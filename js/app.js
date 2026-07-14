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
        console.clear();
        console.log("Politie Herpositionering Simulator - Sprint 1.4");
        this.map = new MapView("map");
        this.map.initialize();
        this.ui = new UI();
        this.ui.initialize();
        this.engine = new Engine(this.ui, this.map);
        this.registerButtons();
        this.ui.refresh(this.engine.step);
    }

    registerButtons() {
        document.getElementById("incidentBtn")?.addEventListener("click", () => this.engine.createIncident());
        document.getElementById("prisonBtn")?.addEventListener("click", () => this.engine.selectPrison());
        document.getElementById("travelBtn")?.addEventListener("click", () => this.engine.calculateTravelTime());
        document.getElementById("dispatchBtn")?.addEventListener("click", () => this.engine.dispatchVehicle());
        document.getElementById("resetBtn")?.addEventListener("click", () => this.engine.reset());
    }
}

window.addEventListener("DOMContentLoaded", () => new App().start());
