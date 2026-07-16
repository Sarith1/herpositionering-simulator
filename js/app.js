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
            const result = action();
            this.ui.log(result.message);

            if (result.success && result.vehicle && result.district) {
                this.ui.vehicleDispatched(result.vehicle.id, result.district.name);
            }

            this.sync();
        });
    }

    sync() {
        this.map.render();
        this.ui.refresh(this.engine.getButtonState());
    }

    startRenderLoop() {
        const loop = now => {
            const event = this.engine.update(now);

            if (event?.type === "incidentCleared") {
                this.ui.log(`${event.vehicle.id} heeft de melding opgepakt.`);
            }

            if (event?.type === "vehicleReturned") {
                this.ui.vehicleReturned(event.vehicle.id);
            }

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
