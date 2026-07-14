import { Engine } from "./engine.js";
import { MapView } from "./map.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";

class App {
    constructor() {
        this.map = null;
        this.ui = null;
        this.engine = null;
    }

    start() {
        console.info("Politie Herpositionering Simulator - Sprint 1.3");

        try {
            this.map = new MapView("map");
            this.map.initialize();

            this.ui = new UI();
            this.ui.initialize();

            this.engine = new Engine(this.ui, this.map);
            this.registerButtons();
            this.ui.updateButtons(this.engine.getStep());
        } catch (error) {
            console.error(error);
            document.body.insertAdjacentHTML(
                "afterbegin",
                `<div class="error-banner">De simulator kon niet starten: ${error.message}</div>`
            );
        }
    }

    registerButtons() {
        this.bindStepButton("incidentBtn", () => this.engine.createIncident());
        this.bindStepButton("prisonBtn", () => this.engine.selectPrison());
        this.bindStepButton("travelBtn", () => this.engine.calculateTravelTime());
        this.bindStepButton("dispatchBtn", () => this.engine.dispatchVehicle());
    }

    bindStepButton(id, action) {
        const button = document.getElementById(id);

        if (!button) {
            this.ui.log(`Knop '${id}' ontbreekt.`);
            return;
        }

        button.addEventListener("click", () => {
            try {
                action();
                this.ui.refresh();
                this.ui.updateButtons(this.engine.getStep(), this.engine.isDispatching());
            } catch (error) {
                console.error(error);
                this.ui.log(`Fout: ${error.message}`);
                this.ui.updateButtons(this.engine.getStep(), this.engine.isDispatching());
            }
        });
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new App().start();
});
