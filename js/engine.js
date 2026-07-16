/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.3
Bestand: engine.js

Spelregels en simulatiestatus voor de vierstappen-flow.
==========================================================
*/

import { districts, simulator, vehicles } from "./data.js";
import {
    calculateTravelTime,
    findNearestAvailableVehicle,
    getDistrictById,
    getPrisonDistricts,
    getShortestRoute
} from "./routing.js";

const STEPS = {
    INCIDENT: "incident",
    PRISON: "prison",
    TRAVEL_TIME: "travelTime",
    DISPATCH: "dispatch"
};

export class Engine {
    constructor() {
        this.step = STEPS.INCIDENT;
        this.activeDispatch = null;
        this.dispatchDuration = 2400;
        this.returnDuration = 1800;
    }

    createIncident() {
        if (this.step !== STEPS.INCIDENT) {
            return this.result(false, "Maak eerst de huidige cyclus af.");
        }

        const district = this.getRandomItem(districts);

        simulator.activeIncident = {
            id: `INC-${Date.now()}`,
            district: district.id,
            x: district.x,
            y: district.y
        };
        simulator.selectedPrison = null;
        simulator.travelTime = null;
        simulator.activeRoute = [];

        this.step = STEPS.PRISON;

        return this.result(true, `Melding geplaatst in ${district.name}.`, { district });
    }

    selectPrison() {
        if (this.step !== STEPS.PRISON) {
            return this.result(false, "Plaats eerst een melding met knop 1.");
        }

        const prison = this.getRandomItem(getPrisonDistricts());

        simulator.selectedPrison = prison.id;
        simulator.activeRoute = getShortestRoute(simulator.activeIncident.district, prison.id);

        this.step = STEPS.TRAVEL_TIME;

        return this.result(true, `Cel geselecteerd in ${prison.name}.`, { prison });
    }

    calculateTravelTime() {
        if (this.step !== STEPS.TRAVEL_TIME) {
            return this.result(false, "Selecteer eerst een cel met knop 2.");
        }

        const route = getShortestRoute(
            simulator.activeIncident.district,
            simulator.selectedPrison
        );

        simulator.activeRoute = route;
        simulator.travelTime = calculateTravelTime(route);

        this.step = STEPS.DISPATCH;

        return this.result(true, `Reistijd berekend: ${simulator.travelTime} seconden.`, { route });
    }

    dispatchVehicle() {
        if (this.step !== STEPS.DISPATCH) {
            return this.result(false, "Bereken eerst de reistijd met knop 3.");
        }

        const incidentDistrict = getDistrictById(simulator.activeIncident.district);
        const nearest = findNearestAvailableVehicle(vehicles, incidentDistrict.id);

        if (!nearest.vehicle) {
            return this.result(false, "Geen beschikbaar voertuig gevonden.");
        }

        const vehicle = nearest.vehicle;
        const homeDistrict = getDistrictById(vehicle.homeDistrict);

        vehicle.status = "busy";
        vehicle.district = incidentDistrict.id;
        vehicle.targetX = incidentDistrict.x;
        vehicle.targetY = incidentDistrict.y;
        vehicle.incident = simulator.activeIncident.id;
        vehicle.prison = simulator.selectedPrison;

        this.activeDispatch = {
            vehicle,
            phase: "toIncident",
            startedAt: performance.now(),
            fromX: vehicle.x,
            fromY: vehicle.y,
            toX: incidentDistrict.x,
            toY: incidentDistrict.y,
            homeX: homeDistrict.x,
            homeY: homeDistrict.y,
            homeDistrictId: homeDistrict.id
        };

        simulator.incidentsHandled += 1;
        this.step = STEPS.INCIDENT;

        return this.result(
            true,
            `${vehicle.id} rijdt naar melding in ${incidentDistrict.name}.`,
            { vehicle, district: incidentDistrict }
        );
    }

    update(now = performance.now()) {
        if (!this.activeDispatch) return null;

        const dispatch = this.activeDispatch;
        const duration = dispatch.phase === "toIncident" ? this.dispatchDuration : this.returnDuration;
        const progress = Math.min(1, (now - dispatch.startedAt) / duration);

        dispatch.vehicle.x = this.lerp(dispatch.fromX, dispatch.toX, progress);
        dispatch.vehicle.y = this.lerp(dispatch.fromY, dispatch.toY, progress);

        if (progress < 1) return null;

        if (dispatch.phase === "toIncident") {
            simulator.activeIncident = null;
            simulator.selectedPrison = null;
            simulator.travelTime = null;
            simulator.activeRoute = [];

            dispatch.phase = "returning";
            dispatch.startedAt = now;
            dispatch.fromX = dispatch.vehicle.x;
            dispatch.fromY = dispatch.vehicle.y;
            dispatch.toX = dispatch.homeX;
            dispatch.toY = dispatch.homeY;

            return { type: "incidentCleared", vehicle: dispatch.vehicle };
        }

        dispatch.vehicle.status = "available";
        dispatch.vehicle.district = dispatch.homeDistrictId;
        dispatch.vehicle.incident = null;
        dispatch.vehicle.prison = null;
        dispatch.vehicle.x = dispatch.homeX;
        dispatch.vehicle.y = dispatch.homeY;
        dispatch.vehicle.targetX = dispatch.homeX;
        dispatch.vehicle.targetY = dispatch.homeY;

        this.activeDispatch = null;

        return { type: "vehicleReturned", vehicle: dispatch.vehicle };
    }

    getButtonState() {
        return {
            incident: this.step === STEPS.INCIDENT,
            prison: this.step === STEPS.PRISON,
            travelTime: this.step === STEPS.TRAVEL_TIME,
            dispatch: this.step === STEPS.DISPATCH
        };
    }

    getRandomItem(items) {
        return items[Math.floor(Math.random() * items.length)];
    }

    lerp(start, end, progress) {
        return start + (end - start) * progress;
    }

    result(success, message, data = {}) {
        return { success, message, ...data };
    }
}
