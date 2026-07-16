/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
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
        this.scoreElement = null;
        this.roundElement = null;
        this.averageTimeElement = null;
        this.stepHintElement = null;
        this.scoreBreakdownElement = null;
        this.historyElement = null;
        this.gameOverLogged = false;

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

        this.scoreElement =
            document.getElementById("scoreCount");

        this.roundElement =
            document.getElementById("roundCount");

        this.averageTimeElement =
            document.getElementById("averageTimeCount");

        this.stepHintElement =
            document.getElementById("stepHint");

        this.logContainer =
            document.getElementById("activityLog");

        this.statusContainer =
            document.getElementById("districtStatus");

        this.scoreBreakdownElement =
            document.getElementById("scoreBreakdown");

        this.historyElement =
            document.getElementById("incidentHistory");

    }

    refresh(buttonState = null) {

        this.updateDashboard();

        this.updateStatusPanel();

        this.updateEvaluationPanel();

        if (buttonState) this.updateButtons(buttonState);

    }

    updateDashboard() {

        const available =
            vehicles.filter(v => v.status === "AVAILABLE").length;

        const busy =
            vehicles.filter(v => v.status !== "AVAILABLE").length;

        if (this.availableElement)
            this.availableElement.textContent = available;

        if (this.busyElement)
            this.busyElement.textContent = busy;

        if (this.incidentElement)
            this.incidentElement.textContent = String((simulator.activeIncident ? 1 : 0) + vehicles.filter(v => v.incident && v.status !== "AVAILABLE").length);

        if (this.coverageElement)
            this.coverageElement.textContent = `${this.calculateCoverage()}%`;

        if (this.scoreElement)
            this.scoreElement.textContent = simulator.score;

        if (this.roundElement)
            this.roundElement.textContent = `${simulator.incidentsHandled}`;

        if (this.averageTimeElement)
            this.averageTimeElement.textContent = this.getAverageTravelTimeLabel();

    }

    updateStatusPanel() {

        if (!this.statusContainer) return;

        this.statusContainer.innerHTML = "";

        districts.forEach(district => {

            const available =
                vehicles.filter(vehicle =>
                    vehicle.district === district.id &&
                    vehicle.status === "AVAILABLE"
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

    updateEvaluationPanel() {

        if (this.scoreBreakdownElement) {
            const breakdown = simulator.lastScoreBreakdown;

            this.scoreBreakdownElement.textContent = breakdown
                ? `Laatste score: ${breakdown.total} punten (${breakdown.base} basis + ${breakdown.timeBonus} tijd + ${breakdown.coverageBonus} dekking).`
                : "Nog geen afgehandelde melding.";
        }

        if (!this.historyElement) return;

        if (!simulator.incidentHistory.length) {
            this.historyElement.innerHTML = "<p>De evaluatie verschijnt na de eerste melding.</p>";
            return;
        }

        this.historyElement.innerHTML = simulator.incidentHistory
            .map(item => `
                <div class="history-item">
                    <strong>Ronde ${item.round}</strong>
                    <span>${item.vehicleId}: ${item.incidentDistrict} → ${item.prisonDistrict}</span>
                    <small>${item.travelTime}s · ${item.score} punten</small>
                </div>
            `)
            .join("");

    }

    updateButtons(buttonState) {

        this.updateControlState(buttonState);

        this.updateStepHint(buttonState);

    }

    updateControlState(buttonState) {

        const controls = [
            { id: "incidentBtn", enabled: buttonState.incident, step: "incident" },
            { id: "prisonBtn", enabled: buttonState.prison, step: "prison" },
            { id: "travelBtn", enabled: buttonState.travelTime, step: "travelTime" },
            { id: "dispatchBtn", enabled: buttonState.dispatch, step: "dispatch" }
        ];

        controls.forEach(control => {
            const button = document.getElementById(control.id);

            if (!button) {
                console.warn(`Bedieningsknop ontbreekt: ${control.id}`);
                return;
            }

            const disabled = !control.enabled;
            button.disabled = disabled;
            button.setAttribute("aria-disabled", String(disabled));
            button.classList.toggle(
                "active-step",
                buttonState.currentStep === control.step && control.enabled
            );
        });

        const resetButton = document.getElementById("resetBtn");

        if (resetButton) {
            const resetDisabled = !buttonState.reset;
            resetButton.disabled = resetDisabled;
            resetButton.setAttribute("aria-disabled", String(resetDisabled));
        }

    }

    updateStepHint(buttonState) {

        if (!this.stepHintElement) return;

        if (buttonState.gameOver) {
            this.stepHintElement.textContent = "Oefening afgerond. Bekijk je score of druk op reset.";
            return;
        }

        const labels = {
            incident: "1. Plaats een nieuwe melding.",
            prison: "2. Selecteer een cel voor de arrestant.",
            travelTime: "3. Bereken de reistijd naar de cel.",
            dispatch: "4. Stuur het dichtstbijzijnde voertuig."
        };

        this.stepHintElement.textContent = labels[buttonState.currentStep] || "Start met een melding.";

    }

    calculateCoverage() {

        const coveredDistricts = districts.filter(district =>
            vehicles.some(vehicle =>
                vehicle.district === district.id &&
                vehicle.status === "AVAILABLE"
            )
        ).length;

        return Math.round((coveredDistricts / districts.length) * 100);

    }

    getAverageTravelTimeLabel() {

        if (!simulator.incidentHistory.length) return "-";

        const total = simulator.incidentHistory
            .reduce((sum, item) => sum + item.travelTime, 0);

        return `${Math.round(total / simulator.incidentHistory.length)}s`;

    }

    log(message) {

        if (!this.logContainer) return;

        if (message.includes("Nieuwe Sprint 1.5")) this.gameOverLogged = false;

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

    logGameOver() {

        this.gameOverLogged = true;

        this.log(`Oefening afgerond met ${simulator.score} punten.`);

    }

    vehicleReturned(vehicleId) {

        this.log(
            `[BESCHIKBAAR] ${vehicleId} is weer beschikbaar.`
        );

        this.refresh();

    }

}
