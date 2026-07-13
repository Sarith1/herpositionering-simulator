/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.3

Engine

Verantwoordelijk voor:

- Simulatiestatus
- Incidenten
- Gevangenissen
- Reistijd
- Voertuigselectie
- Timers
==========================================================
*/
import { 
    Routing 
} from "./routing.js";
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

    this.activeVehicle = null;

}

    /*
    ======================================================
    Stap 1
    ======================================================
    */

    createIncident() {

        if (this.step !== 0) return;

        const district =
            districts[
                Math.floor(Math.random() * districts.length)
            ];

        simulator.activeIncident = district.id;

        this.map.showIncident(district);

        this.ui.log(
            `Nieuwe melding: ${district.name}`
        );

        this.ui.setIncidentCount(1);

        this.step = 1;

    }

    /*
    ======================================================
    Stap 2
    ======================================================
    */

    selectPrison() {

        if (this.step !== 1) return;

        const prisons =
            districts.filter(d => d.prison);

        const prison =
            prisons[
                Math.floor(Math.random() * prisons.length)
            ];

        simulator.selectedPrison = prison.id;

        this.map.highlightPrison(prison.id);

        this.ui.log(
            `Gevangenis geselecteerd: ${prison.name}`
        );

        this.step = 2;

    }

    /*
    ======================================================
    Stap 3
    ======================================================
    */

    calculateTravelTime() {

        if (this.step !== 2) return;

        // Sprint 1.3:
        // nog eenvoudige berekening.
        // Sprint 1.4:
        // routing-algoritme.

        const seconds = this.routing.calculateTravelTime(
        simulator.activeIncident,
        simulator.selectedPrison
);

simulator.travelTime = seconds;

        this.ui.log(
            `Reistijd: ${seconds} seconden`
        );

        this.step = 3;

    }

    /*
    ======================================================
    Stap 4
    ======================================================
    */

    dispatchVehicle() {

        if (this.step !== 3) return;

        const vehicle =
            this.findClosestVehicle();

        if (!vehicle) {

            this.ui.log(
                "Geen voertuig beschikbaar."
            );

            return;

        }

        vehicle.status = "busy";

        this.activeVehicle = vehicle;

        const incident =
            getDistrict(
                simulator.activeIncident
            );

        this.map.moveVehicle(
            vehicle,
            incident.x,
            incident.y
        );

        this.ui.vehicleDispatched(
            vehicle.id,
            getDistrict(vehicle.district).name
        );

        setTimeout(() => {

            this.map.removeIncident();

            this.map.hideVehicle(vehicle.id);

        }, 3000);

        setTimeout(() => {

            vehicle.status = "available";

            vehicle.x = getDistrict(vehicle.homeDistrict).x;

            vehicle.y = getDistrict(vehicle.homeDistrict).y;

            this.map.showVehicle(vehicle);

            this.ui.vehicleReturned(vehicle.id);

            simulator.activeIncident = null;

            simulator.selectedPrison = null;

            simulator.travelTime = null;

            this.ui.setIncidentCount(0);

            this.step = 0;

        }, simulator.travelTime * 1000);

    }

    /*
    ======================================================
    Zoek dichtstbijzijnde voertuig
    ======================================================
    */

    findClosestVehicle() {

        const incident =
            getDistrict(
                simulator.activeIncident
            );

        const available =
            getAvailableVehicles();

        if (available.length === 0)
            return null;

        let best = null;

        let distance = Infinity;

        available.forEach(vehicle => {

            const dx =
                incident.x - vehicle.x;

            const dy =
                incident.y - vehicle.y;

            const d =
                Math.sqrt(dx * dx + dy * dy);

            if (d < distance) {

                distance = d;

                best = vehicle;

            }

        });

        return best;

    }

}
