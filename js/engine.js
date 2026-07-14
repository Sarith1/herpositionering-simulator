import { Routing } from "./routing.js";
import { districts, vehicles, simulator, getDistrict, getAvailableVehicles, resetSimulatorStats, resetVehicles } from "./data.js";

const SPEED = 180;

export class Engine {
    constructor(ui, map) { this.ui = ui; this.map = map; this.routing = new Routing(); this.step = 0; this.lastTime = performance.now(); this.activeAnimations = new Map(); }

    createIncident() {
        if (this.step !== 0 || simulator.activeIncident) return this.ui.log("FOUT", "Er staat al een melding open.");
        const district = districts[Math.floor(Math.random() * districts.length)];
        simulator.activeIncident = district.id;
        simulator.incidents.push({ district: district.id, createdAt: performance.now(), status: "open" });
        simulator.stats.totalIncidents += 1;
        this.map.showIncident(district);
        this.ui.log("MELDING", `Nieuwe melding ${district.name}`);
        this.step = 1;
        this.refresh();
    }

    selectPrison() {
        if (this.step !== 1) return;
        const prison = this.routing.nearestPrison(simulator.activeIncident);
        if (!prison) return console.error("Geen gevangenis beschikbaar.");
        simulator.selectedPrison = prison.id;
        this.map.highlightPrison(prison.id);
        this.ui.log("STATUS", `Gevangenis geselecteerd: ${prison.name}`);
        this.step = 2;
    }

    calculateTravelTime() {
        if (this.step !== 2) return;
        simulator.travelTime = this.routing.calculateTravelTime(simulator.activeIncident, simulator.selectedPrison);
        this.ui.log("STATUS", `Reistijd naar gevangenis: ${simulator.travelTime} seconden`);
        this.step = 3;
    }

    dispatchVehicle() {
        if (this.step !== 3) return;
        const vehicle = this.findClosestVehicle();
        if (!vehicle) return this.missionFailed("Geen voertuig beschikbaar voor melding.");
        const incident = getDistrict(simulator.activeIncident);
        const prison = getDistrict(simulator.selectedPrison);
        if (!incident || !prison) return console.error("Melding of gevangenis ontbreekt.");
        this.step = 4;
        const startDistrict = vehicle.district || vehicle.homeDistrict;
        vehicle.status = "toIncident";
        vehicle.district = null;
        vehicle.route = this.routing.shortestPath(startDistrict, incident.id);
        this.ui.log("DISPATCH", `${vehicle.id} uitgereden naar ${incident.name}`);
        this.animateVehicle(vehicle, incident.x, incident.y, () => this.arriveAtIncident(vehicle, incident, prison));
        this.repositionIfNeeded();
        this.refresh();
    }

    arriveAtIncident(vehicle, incident, prison) {
        const active = simulator.incidents.find(item => item.district === incident.id && item.status === "open");
        if (active) active.status = "transport";
        simulator.stats.responseTotal += Math.round((performance.now() - (active?.createdAt || performance.now())) / 1000);
        this.map.removeIncident();
        vehicle.status = "toPrison";
        vehicle.route = this.routing.shortestPath(incident.id, prison.id);
        this.ui.log("DISPATCH", `${vehicle.id} vervoert verdachte naar ${prison.name}`);
        this.animateVehicle(vehicle, prison.x, prison.y, () => this.completeIncident(vehicle, prison));
        this.refresh();
    }

    completeIncident(vehicle, prison) {
        simulator.stats.handledIncidents += 1;
        simulator.stats.prisonTravelTotal += simulator.travelTime || 0;
        simulator.incidents.forEach(item => { if (item.status !== "handled") item.status = "handled"; });
        vehicle.status = "available";
        vehicle.district = prison.id;
        vehicle.route = [];
        simulator.activeIncident = null;
        simulator.selectedPrison = null;
        simulator.travelTime = null;
        this.step = 0;
        this.map.highlightPrison(null);
        this.map.positionParkedVehicles();
        this.ui.log("STATUS", `${vehicle.id} beschikbaar in ${prison.name}; knop 1 is weer actief.`);
        this.repositionIfNeeded();
        this.refresh();
    }

    repositionIfNeeded() {
        let chain = 0;
        districts.filter(d => !vehicles.some(v => v.district === d.id && v.status === "available")).forEach(emptyDistrict => {
            const donor = districts.find(d => vehicles.filter(v => v.district === d.id && v.status === "available").length >= 2);
            if (!donor) return;
            const vehicle = vehicles.find(v => v.district === donor.id && v.status === "available");
            if (!vehicle) return;
            vehicle.status = "repositioning";
            vehicle.district = null;
            vehicle.route = this.routing.shortestPath(donor.id, emptyDistrict.id);
            simulator.stats.repositions += 1;
            chain += 1;
            this.ui.log("HERPOSITIONERING", `${vehicle.id} naar ${emptyDistrict.name}`);
            this.animateVehicle(vehicle, emptyDistrict.x, emptyDistrict.y, () => {
                vehicle.status = "available"; vehicle.district = emptyDistrict.id; vehicle.route = []; this.map.positionParkedVehicles(); this.refresh();
            });
        });
        simulator.stats.longestRepositionChain = Math.max(simulator.stats.longestRepositionChain, chain);
    }

    animateVehicle(vehicle, targetX, targetY, callback) {
        if (this.activeAnimations.has(vehicle.id)) return console.warn(`Dubbele timer voorkomen voor ${vehicle.id}`);
        const start = { x: vehicle.x, y: vehicle.y, at: performance.now() };
        const distance = Math.hypot(targetX - start.x, targetY - start.y);
        const duration = simulator.settings.animations ? Math.max(900, (distance / SPEED) * 1000) : 1;
        this.activeAnimations.set(vehicle.id, { vehicle, start, targetX, targetY, duration, callback });
    }

    update(now = performance.now()) {
        this.activeAnimations.forEach((animation, id) => {
            const t = Math.min(1, (now - animation.start.at) / animation.duration);
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const { vehicle, start, targetX, targetY } = animation;
            const previousX = vehicle.x; const previousY = vehicle.y;
            vehicle.x = start.x + (targetX - start.x) * eased;
            vehicle.y = start.y + (targetY - start.y) * eased;
            vehicle.angle = Math.atan2(vehicle.y - previousY, vehicle.x - previousX) * 180 / Math.PI;
            this.map.updateVehicle(vehicle);
            if (t >= 1) { this.activeAnimations.delete(id); animation.callback?.(); }
        });
        this.map.renderRoutes();
        this.map.updateCoverageRings();
        this.ui.refresh();
    }

    findClosestVehicle() {
        const incident = getDistrict(simulator.activeIncident);
        const available = getAvailableVehicles();
        if (!incident || available.length === 0) return null;
        return available.reduce((best, vehicle) => {
            const distance = Math.hypot(incident.x - vehicle.x, incident.y - vehicle.y);
            return distance < best.distance ? { vehicle, distance } : best;
        }, { vehicle: null, distance: Infinity }).vehicle;
    }

    missionFailed(reason) { simulator.stats.missionFailed += 1; simulator.gameOver = true; globalThis.document?.getElementById("missionFailed")?.classList.add("visible"); this.ui.log("STATUS", `Mission Failed: ${reason}`); }

    reset(perDistrict = simulator.settings.vehiclesPerDistrict) {
        this.activeAnimations.clear();
        resetSimulatorStats(); resetVehicles(perDistrict); this.step = 0;
        globalThis.document?.getElementById("missionFailed")?.classList.remove("visible");
        this.map.initialize(); this.ui.log("STATUS", "Simulator volledig gereset"); this.refresh();
    }

    refresh() { this.map.updateCoverageRings(); this.ui.refresh(true); }
}
