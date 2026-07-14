import { MapView } from "./map.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";
import { simulator } from "./data.js";

class App {
    start() {
        console.info("Politie Herpositionering Simulator - Sprint 1.5");
        this.map = new MapView("map");
        this.map.initialize();
        this.ui = new UI();
        this.ui.initialize();
        this.engine = new Engine(this.ui, this.map);
        this.registerButtons();
        this.registerSettings();
        this.startRenderLoop();
    }

    registerButtons() {
        this.bind("incidentBtn", () => this.engine.createIncident());
        this.bind("prisonBtn", () => this.engine.selectPrison());
        this.bind("travelBtn", () => this.engine.calculateTravelTime());
        this.bind("dispatchBtn", () => this.engine.dispatchVehicle());
        this.bind("resetBtn", () => this.engine.reset());
    }

    registerSettings() {
        const vehiclesPerDistrict = document.getElementById("vehiclesPerDistrict");
        vehiclesPerDistrict?.addEventListener("change", event => {
            simulator.settings.vehiclesPerDistrict = Number(event.target.value);
            this.engine.reset(simulator.settings.vehiclesPerDistrict);
        });
        this.toggle("animationsToggle", "animations", () => this.map.container.classList.toggle("animations-off", !simulator.settings.animations));
        this.toggle("logToggle", "log");
        this.toggle("routesToggle", "routes", () => this.map.renderRoutes());
        this.toggle("idsToggle", "showIds", () => this.map.vehicleNodes.forEach((node) => node.classList.toggle("hide-id", !simulator.settings.showIds)));
    }

    bind(id, handler) {
        const element = document.getElementById(id);
        if (!element) return console.warn(`Knop ontbreekt: ${id}`);
        element.addEventListener("click", handler, { passive: true });
    }

    toggle(id, setting, afterChange = () => {}) {
        const element = document.getElementById(id);
        if (!element) return console.warn(`Instelling ontbreekt: ${id}`);
        element.addEventListener("change", event => {
            simulator.settings[setting] = event.target.checked;
            afterChange();
            this.ui.refresh(true);
        });
    }

    startRenderLoop() {
        const loop = (time) => {
            this.engine.update(time);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }
}

window.addEventListener("DOMContentLoaded", () => new App().start(), { once: true });
