/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.3
Bestand: ui.js

Verantwoordelijk voor:

- Dashboard
- Activiteitenlog
- Statuspaneel
- Tellerwaarden
==========================================================
*/

import {
    districts,
    simulator,
    vehicles
} from "./data.js";

export class UI {

    constructor() {

        this.logContainer = null;
        this.statusContainer = null;

        this.availableElement = null;
        this.busyElement = null;
        this.incidentElement = null;
        this.coverageElement = null;

    }

    initialize() {

        this.findElements();

        this.refresh();

        this.log("Simulator gestart");

        this.log("21 voertuigen beschikbaar");

    }

    findElements() {

        this.availableElement =
            document.getElementById("availableCount");

        this.busyElement =
            document.getElementById("busyCount");

        this.incidentElement =
            document.getElementById("incidentCount");

        this.coverageElement =
            document.getElementById("coverageCount");

        this.logContainer =
            document.getElementById("activityLog");

        this.statusContainer =
            document.getElementById("districtStatus");

    }

    refresh(buttonState = null) {

        this.updateDashboard();

        this.updateStatusPanel();

        if (buttonState) this.updateButtons(buttonState);

    }

    updateDashboard() {

        const available =
            vehicles.filter(v => v.status === "available").length;

        const busy =
            vehicles.filter(v => v.status !== "available").length;

        if (this.availableElement)
            this.availableElement.textContent = available;

        if (this.busyElement)
            this.busyElement.textContent = busy;

        if (this.incidentElement)
            this.incidentElement.textContent = simulator.activeIncident ? "1" : "0";

        if (this.coverageElement)
            this.coverageElement.textContent = `${this.calculateCoverage()}%`;

    }

    updateStatusPanel() {

        if (!this.statusContainer) return;

        this.statusContainer.innerHTML = "";

        districts.forEach(district => {

            const available =
                vehicles.filter(vehicle =>
                    vehicle.district === district.id &&
                    vehicle.status === "available"
                ).length;

            const row = document.createElement("div");

            row.className = "district-status";

            let icon = "🟢";

            if (available === 2)
                icon = "🟡";

            if (available <= 1)
                icon = "🟠";

            if (available === 0)
                icon = "🔴";

            row.innerHTML = `
                <span>${icon}</span>
                <span>${district.name}</span>
                <strong>${available}</strong>
            `;

            this.statusContainer.appendChild(row);

        });

    }

    updateButtons(buttonState) {

        const mapping = {
            incidentBtn: buttonState.incident,
            prisonBtn: buttonState.prison,
            travelBtn: buttonState.travelTime,
            dispatchBtn: buttonState.dispatch
        };

        Object.entries(mapping).forEach(([id, enabled]) => {
            const button = document.getElementById(id);
            if (!button) return;
            button.disabled = !enabled;
        });

    }

    calculateCoverage() {

        const coveredDistricts = districts.filter(district =>
            vehicles.some(vehicle =>
                vehicle.district === district.id &&
                vehicle.status === "available"
            )
        ).length;

        return Math.round((coveredDistricts / districts.length) * 100);

    }

    log(message) {

        if (!this.logContainer) return;

        const now = new Date();

        const time =
            now.toLocaleTimeString("nl-NL", {
                hour: "2-digit",
                minute: "2-digit"
            });

        const item = document.createElement("div");

        item.className = "log-item";

        item.innerHTML = `
            <div class="log-time">${time}</div>
            <div class="log-message">${message}</div>
        `;

        this.logContainer.prepend(item);

    }

    setCoverage(percent) {

        if (!this.coverageElement) return;

        this.coverageElement.textContent =
            `${percent}%`;

    }

    setIncidentCount(count) {

        if (!this.incidentElement) return;

        this.incidentElement.textContent =
            count;

    }

    vehicleDispatched(vehicleId, districtName) {

        this.log(
            `${vehicleId} uitgereden vanuit ${districtName}`
        );

        this.refresh();

    }

    vehicleReturned(vehicleId) {

        this.log(
            `${vehicleId} terug beschikbaar`
        );

        this.refresh();

    }

}
