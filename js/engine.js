import { Routing } from "./routing.js";
import { districts, vehicles, simulator, getDistrict, getAvailableVehicles, getAvailableVehiclesInDistrict, getCoverage, resetSimulator, VEHICLE_STATUS, REPOSITIONING } from "./data.js";

export class Engine {
    constructor(ui, map) {
        this.ui = ui;
        this.map = map;
        this.routing = new Routing();
        this.step = 0;
        this.locked = false;
        this.repositioning = false;
        this.timers = new Set();
    }

    createIncident() {
        if (!this.canAct(0)) return;
        const district = districts[Math.floor(Math.random() * districts.length)];
        simulator.activeIncident = district.id;
        simulator.openIncidents = 1;
        this.map.showIncident(district);
        this.ui.log(`Nieuwe melding: ${district.name}`);
        this.step = 1;
        this.finishAction();
    }

    selectPrison() {
        if (!this.canAct(1)) return;
        const prisons = districts.filter(d => d.prison);
        const prison = prisons[Math.floor(Math.random() * prisons.length)];
        simulator.selectedPrison = prison.id;
        this.map.highlightPrison(prison.id);
        this.ui.log(`Gevangenis geselecteerd: ${prison.name}`);
        this.step = 2;
        this.finishAction();
    }

    calculateTravelTime() {
        if (!this.canAct(2)) return;
        simulator.travelTime = this.routing.calculateTravelTime(simulator.activeIncident, simulator.selectedPrison);
        this.ui.log(`Reistijd: ${simulator.travelTime} seconden`);
        this.step = 3;
        this.finishAction();
    }

    dispatchVehicle() {
        if (!this.canAct(3)) return;
        const vehicle = this.findClosestVehicle();
        if (!vehicle) {
            this.ui.log("Geen voertuig beschikbaar.");
            this.finishAction();
            return;
        }
        const origin = getDistrict(vehicle.district);
        const incident = getDistrict(simulator.activeIncident);
        vehicle.status = VEHICLE_STATUS.DISPATCHED;
        vehicle.incident = incident.id;
        this.ui.log(`${vehicle.id} uitgereden vanuit ${origin.name}`);
        this.map.moveVehicleAlongRoute(vehicle, [{ x: vehicle.x, y: vehicle.y }, { x: incident.x, y: incident.y }], 3)
            .then(() => {
                if (vehicle.status === VEHICLE_STATUS.DISPATCHED) vehicle.status = VEHICLE_STATUS.BUSY;
                this.map.hideVehicle(vehicle.id);
                this.ui.refresh(this.step);
            });
        const returnSeconds = simulator.travelTime;
        this.setTimer(() => this.returnVehicle(vehicle), returnSeconds * 1000);
        simulator.openIncidents = 0;
        simulator.incidentsHandled += 1;
        simulator.activeIncident = null;
        simulator.selectedPrison = null;
        simulator.travelTime = null;
        this.map.removeIncident();
        this.step = 0;
        this.checkCoverage();
        this.finishAction();
    }

    returnVehicle(vehicle) {
        if (simulator.gameOver || !vehicle) return;
        vehicle.status = VEHICLE_STATUS.RETURNING;
        vehicle.district = vehicle.homeDistrict;
        this.map.showVehicle(vehicle);
        this.map.placeVehicleAtDistrict(vehicle);
        vehicle.status = VEHICLE_STATUS.AVAILABLE;
        vehicle.incident = null;
        vehicle.prison = null;
        this.ui.log(`${vehicle.id} terug beschikbaar`);
        this.checkCoverage();
        this.ui.refresh(this.step);
    }

    findClosestVehicle() {
        const incident = getDistrict(simulator.activeIncident);
        return getAvailableVehicles().map(vehicle => ({
            vehicle,
            distance: this.routing.distance(vehicle.district, incident.id)
        })).sort((a, b) => a.distance - b.distance || a.vehicle.id.localeCompare(b.vehicle.id))[0]?.vehicle || null;
    }

    checkCoverage() {
        this.ui.refresh(this.step);
        if (!simulator.gameOver) this.startRepositioningCycle();
    }

    async startRepositioningCycle() {
        if (this.repositioning || simulator.gameOver) return;
        this.repositioning = true;
        const processed = new Set();
        let steps = 0;
        try {
            while (!simulator.gameOver && steps < REPOSITIONING.MAX_STEPS_PER_CYCLE) {
                const empty = districts.find(d => !processed.has(d.id) && getAvailableVehiclesInDistrict(d.id).length === 0);
                if (!empty) break;
                processed.add(empty.id);
                this.ui.log(`${empty.name} heeft geen beschikbare voertuigen.`);
                const success = await this.repositionTo(empty.id);
                steps += 1;
                if (!success) return this.failMission();
            }
            if (!simulator.gameOver && getCoverage() === 100) this.ui.log("Dekking hersteld naar 100%.");
        } catch (error) {
            console.error("Herpositionering mislukt", error);
            this.ui.log("Herpositionering niet mogelijk.");
            this.failMission();
        } finally {
            this.repositioning = false;
            this.ui.refresh(this.step);
        }
    }

    async repositionTo(targetDistrictId) {
        const target = getDistrict(targetDistrictId);
        const candidates = target.neighbours.map(id => {
            const available = getAvailableVehiclesInDistrict(id);
            return { district: getDistrict(id), available: available.length, vehicle: available.sort((a, b) => a.id.localeCompare(b.id))[0] };
        }).filter(candidate => candidate.available > 1 && candidate.vehicle)
          .sort((a, b) => b.available - a.available || this.routing.distance(a.district.id, targetDistrictId) - this.routing.distance(b.district.id, targetDistrictId) || a.district.id.localeCompare(b.district.id));
        const donor = candidates[0];
        if (!donor) {
            this.ui.log("Herpositionering niet mogelijk.");
            return false;
        }
        const vehicle = donor.vehicle;
        vehicle.status = VEHICLE_STATUS.REPOSITIONING;
        this.ui.log(`Herpositionering gestart: ${vehicle.id} van ${donor.district.name} naar ${target.name}.`);
        this.ui.refresh(this.step);
        const route = this.routing.shortestPath(donor.district.id, targetDistrictId);
        const points = [{ x: vehicle.x, y: vehicle.y }, ...this.routing.routeCoordinates(route).slice(1)];
        await this.map.moveVehicleAlongRoute(vehicle, points, REPOSITIONING.ANIMATION_SECONDS, { showRoute: true, routeId: `reposition-${vehicle.id}`, className: "reposition-route" });
        if (simulator.gameOver) return false;
        vehicle.district = targetDistrictId;
        vehicle.status = VEHICLE_STATUS.AVAILABLE;
        vehicle.incident = null;
        this.map.placeVehicleAtDistrict(vehicle);
        this.ui.log(`${vehicle.id} aangekomen in ${target.name}.`);
        this.ui.refresh(this.step);
        return true;
    }

    failMission() {
        if (simulator.gameOver) return;
        simulator.gameOver = true;
        this.map.stopAnimations();
        this.ui.log("MISSION FAILED: niet alle districten zijn gedekt.");
        this.ui.showGameOver();
        this.ui.refresh(this.step);
    }

    reset() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
        this.map.stopAnimations();
        this.map.clearRoutes();
        resetSimulator();
        this.step = 0;
        this.locked = false;
        this.repositioning = false;
        this.map.initialize();
        this.ui.clearLog();
        this.ui.hideGameOver();
        this.ui.log("Simulator opnieuw gestart");
        this.ui.log("21 voertuigen beschikbaar");
        this.ui.refresh(this.step);
    }

    canAct(requiredStep) {
        if (this.locked || simulator.gameOver || this.step !== requiredStep) return false;
        this.locked = true;
        return true;
    }

    finishAction() {
        this.locked = false;
        this.ui.refresh(this.step);
    }

    setTimer(callback, ms) {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            callback();
        }, ms);
        this.timers.add(timer);
    }
}
