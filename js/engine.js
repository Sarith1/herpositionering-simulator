import { Routing } from "./routing.js";
import {
    districts,
    vehicles,
    simulator,
    getDistrict,
    getAvailableVehicles
} from "./data.js";

export class Engine {
    constructor(ui, map) {
        this.ui = ui;
        this.map = map;
        this.routing = new Routing();
        this.step = 0;
        this.dispatching = false;
    }

    getStep() {
        return this.step;
    }

    isDispatching() {
        return this.dispatching;
    }

    createIncident() {
        this.requireStep(0, "Maak eerst de huidige cyclus af.");

        const district = districts[Math.floor(Math.random() * districts.length)];
        simulator.activeIncident = district.id;
        simulator.selectedPrison = null;
        simulator.travelTime = null;

        this.map.clearRoute();
        this.map.clearPrisonHighlight();
        this.map.showIncident(district);
        this.ui.log(`Nieuwe melding in ${district.name}.`);
        this.step = 1;
    }

    selectPrison() {
        this.requireStep(1, "Maak eerst een melding aan met knop 1.");

        const prisons = districts.filter(district => district.prison);
        const prison = prisons[Math.floor(Math.random() * prisons.length)];
        simulator.selectedPrison = prison.id;

        this.map.highlightPrison(prison.id);
        this.ui.log(`Gevangenis geselecteerd: ${prison.name}.`);
        this.step = 2;
    }

    calculateTravelTime() {
        this.requireStep(2, "Selecteer eerst een gevangenis met knop 2.");

        const route = this.routing.completeRoute(
            simulator.activeIncident,
            simulator.selectedPrison
        );

        if (route.length === 0) {
            throw new Error("Geen route gevonden tussen melding en gevangenis.");
        }

        simulator.travelTime = this.routing.calculateTravelTime(
            simulator.activeIncident,
            simulator.selectedPrison
        );

        this.map.drawRoute(this.routing.routeCoordinates(route));
        this.ui.log(`Kortste route: ${route.map(id => getDistrict(id).name).join(" → ")}.`);
        this.ui.log(`Reistijd berekend: ${simulator.travelTime} seconden.`);
        this.step = 3;
    }

    dispatchVehicle() {
        this.requireStep(3, "Bereken eerst de reistijd met knop 3.");

        if (this.dispatching) {
            this.ui.log("Dispatch is al bezig; dubbele actie genegeerd.");
            return;
        }

        const vehicle = this.findClosestVehicle();
        const incident = getDistrict(simulator.activeIncident);

        if (!vehicle || !incident) {
            throw new Error("Geen beschikbaar voertuig of melding gevonden.");
        }

        this.dispatching = true;
        vehicle.status = "busy";
        vehicle.district = simulator.activeIncident;
        vehicle.incident = simulator.activeIncident;
        vehicle.prison = simulator.selectedPrison;

        this.ui.vehicleDispatched(vehicle.id, getDistrict(vehicle.homeDistrict).name);
        this.map.moveVehicle(vehicle, incident.x, incident.y, 2500);

        window.setTimeout(() => {
            this.map.removeIncident();
            this.map.hideVehicle(vehicle.id);
            this.ui.log(`${vehicle.id} behandelt de melding; voertuig tijdelijk niet beschikbaar.`);
            this.ui.refresh();
        }, 2600);

        window.setTimeout(() => {
            const home = getDistrict(vehicle.homeDistrict);
            const incident = getDistrict(simulator.activeIncident);
            vehicle.status = "returning";
            vehicle.incident = null;
            vehicle.prison = null;
            vehicle.district = vehicle.homeDistrict;
            vehicle.x = incident.x;
            vehicle.y = incident.y;

            this.map.showVehicleAt(vehicle, incident.x, incident.y);
            this.map.moveVehicle(vehicle, vehicle.homeX ?? home.x, vehicle.homeY ?? home.y, 1200);

            window.setTimeout(() => {
                vehicle.status = "available";
                vehicle.x = vehicle.homeX ?? home.x;
                vehicle.y = vehicle.homeY ?? home.y;
                this.ui.vehicleReturned(vehicle.id);
                this.resetCycle();
            }, 1300);
            return;
        }, simulator.travelTime * 1000);

        this.step = 4;
    }

    findClosestVehicle() {
        const incident = getDistrict(simulator.activeIncident);
        const available = getAvailableVehicles();

        return available.reduce((best, vehicle) => {
            const distance = Math.hypot(incident.x - vehicle.x, incident.y - vehicle.y);
            return !best || distance < best.distance ? { vehicle, distance } : best;
        }, null)?.vehicle || null;
    }

    resetCycle() {
        simulator.activeIncident = null;
        simulator.selectedPrison = null;
        simulator.travelTime = null;
        this.dispatching = false;
        this.step = 0;
        this.map.clearRoute();
        this.map.clearPrisonHighlight();
        this.ui.refresh();
        this.ui.updateButtons(this.step, this.dispatching);
    }

    requireStep(expectedStep, message) {
        if (this.step !== expectedStep || this.dispatching) {
            this.ui.log(message);
            throw new Error(message);
        }
    }
}
