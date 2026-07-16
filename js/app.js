/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: app.js

Hoofdcontroller van de applicatie.
==========================================================
*/

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
        this.bindButton("resetBtn", () => this.engine.reset());
    }

    bindButton(id, action) {
        const button = document.getElementById(id);

        button?.addEventListener("click", () => {
            try {
                const result = action();
                this.ui.log(result.message);

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
        if (event.type === "missionFailed" || event.type === "error") this.ui.log(event.message);
    }

    sync() {
        this.map.render();
        this.ui.refresh(this.engine.getButtonState());
    }

    startRenderLoop() {
        const loop = now => {
            const events = this.engine.update(now);
            events.forEach(event => this.handleEngineEvent(event));

            if (this.engine.getButtonState().gameOver && !this.ui.gameOverLogged) {
                this.ui.logGameOver();
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
