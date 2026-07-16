/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: app.js

Hoofdcontroller van de applicatie.
==========================================================
*/

import { createDefaultVehiclesPerDistrict, getDefaultPrisonDistrictIds } from "./data.js";
import { Engine } from "./engine.js";
import { MapView } from "./map.js";
import { UI } from "./ui.js";

class App {
    constructor() {
        this.engine = new Engine();
        this.map = null;
        this.ui = null;
    }

    start() {
        console.clear();
        console.log("Politie Herpositionering Simulator - Sprint 1.5");

        this.initializeMap();
        this.initializeUI();
        this.registerButtons();
        this.sync();
        this.startRenderLoop();
    }

    initializeMap() {
        this.map = new MapView("map");
        this.map.initialize();
    }

    initializeUI() {
        this.ui = new UI();
        this.ui.initialize();
    }

    registerButtons() {
        this.bindButton("incidentBtn", () => this.engine.createIncident());
        this.bindButton("prisonBtn", () => this.engine.selectPrison());
        this.bindButton("travelBtn", () => this.engine.calculateTravelTime());
        this.bindButton("dispatchBtn", () => this.engine.dispatchVehicle());
        this.bindButton("resetBtn", () => this.resetCurrentSession());
        this.bindButton("failureResetBtn", () => this.resetCurrentSession());
        this.bindButton("failureNewSessionBtn", () => this.newSessionSetup());
        this.bindButton("failureInspectBtn", () => ({ success: true, message: "[EINDE SESSIE] Kaartsituatie blijft zichtbaar." }));
        this.bindButton("applyConfigBtn", () => this.applyConfiguredSession());
        this.bindButton("restoreDefaultsBtn", () => {
            const defaults = createDefaultVehiclesPerDistrict();
            this.ui.setConfigValues(defaults);
            this.ui.setPrisonConfigValues(getDefaultPrisonDistrictIds());
            return this.engine.reset({ restoreDefaults: true });
        });
    }

    bindButton(id, action) {
        const button = document.getElementById(id);

        button?.addEventListener("click", () => {
            try {
                const result = action();
                this.ui.log(result.message);

                if (id === "resetBtn" || id === "failureResetBtn") this.ui.hideRepositioningFailure();

                if (id === "restoreDefaultsBtn" || id === "failureNewSessionBtn") {
                    this.ui.setConfigValues(createDefaultVehiclesPerDistrict());
                    this.ui.setPrisonConfigValues(getDefaultPrisonDistrictIds());
                }

                (result.events || []).forEach(event => this.handleEngineEvent(event));

                if (result.success && result.vehicle && result.district) {
                    this.ui.log(`[UITRUK] ${result.vehicle.id} is gekoppeld aan ${result.district.name}.`);
                }

                this.sync();
            } catch (error) {
                console.error(error);
                this.ui.log(`[FOUT] Technische fout: ${error.message}`);
                this.sync();
            }
        });
    }

    handleEngineEvent(event) {
        if (!event) return;
        if (event.type === "incidentCleared") this.ui.log(`[AANKOMST] ${event.vehicle.id} is aangekomen bij de melding.`);
        if (event.type === "transport") this.ui.log(`[TRANSPORT] ${event.vehicle.id} rijdt naar de cel in ${event.district.name}.`);
        if (event.type === "prisonReached") this.ui.log(`[CEL] ${event.vehicle.id} is ${event.seconds} seconden tijdelijk bezet.`);
        if (event.type === "returning") this.ui.log(`[TERUGRIT] ${event.vehicle.id} rijdt terug naar de standplaats.`);
        if (event.type === "vehicleReturned") this.ui.vehicleReturned(event.vehicle.id);
        if (event.type === "repositionStarted") this.ui.log(`[HERPOSITIONERING] ${event.vehicle.id} rijdt naar ${event.district.name}.`);
        if (event.type === "repositionComplete") this.ui.log(`[BESCHIKBAAR] ${event.vehicle.id} dekt nu ${event.district.name}.`);
        if (event.type === "repositioningFailure") this.ui.showRepositioningFailure(event.failure);
        if (event.type === "missionFailed" || event.type === "error") this.ui.log(event.message);
    }


    applyConfiguredSession() {
        const availablePrisons = this.ui.getConfiguredAvailablePrisons();
        if (!availablePrisons.length) return { success: false, message: "[FOUT] Selecteer minimaal één cellencomplex." };
        this.ui.hideRepositioningFailure();
        return this.engine.reset({
            vehiclesPerDistrict: this.ui.getConfiguredVehiclesPerDistrict(),
            availablePrisons
        });
    }

    resetCurrentSession() {
        this.ui.hideRepositioningFailure();
        return this.engine.reset();
    }

    newSessionSetup() {
        this.ui.hideRepositioningFailure();
        this.ui.setConfigValues(createDefaultVehiclesPerDistrict());
        this.ui.setPrisonConfigValues(getDefaultPrisonDistrictIds());
        return this.engine.reset({ restoreDefaults: true });
    }

    sync() {
        this.map.render();
        this.ui.refresh(this.engine.getButtonState());
    }

    startRenderLoop() {
        const loop = now => {
            const events = this.engine.update(now);
            events.forEach(event => this.handleEngineEvent(event));

            if (this.engine.getButtonState().gameOver) {
                this.ui.showRepositioningFailure(this.engine.getRepositioningFailure?.());
            }

            this.sync();
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    app.start();
});
