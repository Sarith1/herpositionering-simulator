/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.2
Bestand: app.js

Hoofdcontroller van de applicatie.
==========================================================
*/

import { MapView } from "./map.js";
import { UI } from "./ui.js";

class App {

    constructor() {

        this.map = null;
        this.ui = null;

    }

    start() {

        console.clear();

        console.log("====================================");
        console.log("Politie Herpositionering Simulator");
        console.log("Sprint 1.2");
        console.log("====================================");

        this.initializeMap();

        this.initializeUI();

        this.registerButtons();

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

        const incidentButton =
            document.getElementById("incidentBtn");

        const prisonButton =
            document.getElementById("prisonBtn");

        const travelButton =
            document.getElementById("travelBtn");

        const dispatchButton =
            document.getElementById("dispatchBtn");

        incidentButton?.addEventListener(
            "click",
            () => {

                this.ui.log("Melding aangemaakt.");

            }
        );

        prisonButton?.addEventListener(
            "click",
            () => {

                this.ui.log("Gevangenis geselecteerd.");

            }
        );

        travelButton?.addEventListener(
            "click",
            () => {

                this.ui.log("Reistijd berekend.");

            }
        );

        dispatchButton?.addEventListener(
            "click",
            () => {

                this.ui.log("Voertuig uitgezonden.");

            }
        );

    }

    startRenderLoop() {

        const loop = () => {

            // Vanaf Sprint 1.3 komt hier:
            //
            // engine.update();
            // map.render();
            // ui.refresh();

            requestAnimationFrame(loop);

        };

        requestAnimationFrame(loop);

    }

}

window.addEventListener("DOMContentLoaded", () => {

    const app = new App();

    app.start();

});
