/*
Politie Herpositionering Simulator
Sprint 1.2
Bestand: ui.js

Verantwoordelijk voor:

- Dashboard
- Activiteitenlog
- Statuspaneel
- Tellerwaarden
*/

import {
    districts,
    vehicles,
    simulator
} from "./data.js";

export class UI {
    constructor() {
        this.buttons = {};
    }

    initialize() {
        this.findElements();
        this.refresh();
        this.log("Simulator gestart");
        this.log("21 voertuigen beschikbaar");
    }

    findElements() {
        this.availableElement = document.getElementById("availableCount");
        this.underwayElement = document.getElementById("underwayCount");
        this.repositioningElement = document.getElementById("repositioningCount");
        this.busyElement = document.getElementById("busyCount");
        this.openElement = document.getElementById("openIncidentCount");
        this.handledElement = document.getElementById("handledIncidentCount");
        this.coverageElement = document.getElementById("coverageCount");
        this.logContainer = document.getElementById("activityLog");
        this.statusContainer = document.getElementById("districtStatus");
        this.gameOverOverlay = document.getElementById("gameOverOverlay");
        this.buttons = {
            incident: document.getElementById("incidentBtn"),
            prison: document.getElementById("prisonBtn"),
            travel: document.getElementById("travelBtn"),
            dispatch: document.getElementById("dispatchBtn"),
            reset: document.getElementById("resetBtn")
        };
    }

    refresh(step = 0) {
        this.updateDashboard();
        this.updateStatusPanel();
        this.updateButtons(step);
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

        if (this.coverageElement) {
            const coverage = Math.round((available / vehicles.length) * 100);
            this.coverageElement.textContent = `${coverage}%`;
        }

    }

    updateStatusPanel() {
        if (!this.statusContainer) return;
        this.statusContainer.innerHTML = "";
        districts.forEach(district => {
            const available = getAvailableVehiclesInDistrict(district.id).length;
            const row = document.createElement("div");
            row.className = `district-status ${available >= 2 ? "coverage-green" : available === 1 ? "coverage-orange" : "coverage-red"}`;
            const icon = available >= 2 ? "🟢" : available === 1 ? "🟠" : "🔴";
            row.innerHTML = `<span>${icon}</span><span>${district.name}</span><strong>${available}</strong>`;
            this.statusContainer.appendChild(row);
        });
    }

    updateButtons(step = 0) {
        if (simulator.gameOver) {
            [this.buttons.incident, this.buttons.prison, this.buttons.travel, this.buttons.dispatch].forEach(button => { if (button) button.disabled = true; });
            return;
        }
        if (this.buttons.incident) this.buttons.incident.disabled = step !== 0;
        if (this.buttons.prison) this.buttons.prison.disabled = step !== 1;
        if (this.buttons.travel) this.buttons.travel.disabled = step !== 2;
        if (this.buttons.dispatch) this.buttons.dispatch.disabled = step !== 3;
    }

    setText(element, value) { if (element) element.textContent = value; }

    log(message) {
        if (!this.logContainer || !message) return;
        const first = this.logContainer.firstElementChild?.querySelector(".log-message")?.textContent;
        if (first === message) return;
        const now = new Date();
        const item = document.createElement("div");
        item.className = "log-item";
        item.innerHTML = `<div class="log-time">${now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</div><div class="log-message">${message}</div>`;
        this.logContainer.prepend(item);
    }

    clearLog() { if (this.logContainer) this.logContainer.innerHTML = ""; }

    updateButtons(step, dispatching = false) {
        const buttons = [
            document.getElementById("incidentBtn"),
            document.getElementById("prisonBtn"),
            document.getElementById("travelBtn"),
            document.getElementById("dispatchBtn")
        ];

        buttons.forEach((button, index) => {
            if (!button) return;
            const enabled = !dispatching && step === index;
            button.disabled = !enabled;
            button.setAttribute("aria-disabled", String(!enabled));
        });
    }

    average(total, count) { return count > 0 ? Math.round(total / count) : 0; }
    formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
}
