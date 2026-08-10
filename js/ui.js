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
    detentionComplexes,
    DEFAULT_VEHICLES_PER_DISTRICT,
    sessionConfig,
    repositioningFailureConfig,
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
        this.roundElement = null;
        this.averageTimeElement = null;
        this.stepHintElement = null;
        this.historyElement = null;
        this.configContainer = null;
        this.configTotalElement = null;
        this.prisonConfigContainer = null;
        this.failureOverlay = null;
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

        this.historyElement =
            document.getElementById("incidentHistory");

        this.configContainer =
            document.getElementById("vehicleConfig");

        this.configTotalElement =
            document.getElementById("vehicleConfigTotal");

        this.prisonConfigContainer =
            document.getElementById("prisonConfig");

        this.failureOverlay =
            document.getElementById("repositioningFailureOverlay");

        this.renderSessionConfig();

    }

    refresh(buttonState = null) {

        this.updateDashboard();

        this.updateStatusPanel();

        this.updateEvaluationPanel();

        if (buttonState) this.updateButtons(buttonState);

    }

    renderSessionConfig() {

        if (!this.configContainer) return;

        this.configContainer.innerHTML = "";

        districts.forEach(district => {
            const label = document.createElement("label");
            label.className = "vehicle-config-row";
            label.innerHTML = `
                <span>${district.name}</span>
                <input type="number" min="0" max="9" step="1" value="${sessionConfig.vehiclesPerDistrict[district.id] ?? DEFAULT_VEHICLES_PER_DISTRICT}" data-district-id="${district.id}">
            `;
            this.configContainer.appendChild(label);
        });

        this.renderPrisonConfig();

        this.updateConfigTotal();

        this.configContainer.addEventListener("input", () => this.updateConfigTotal());

    }


    renderPrisonConfig() {

        if (!this.prisonConfigContainer) return;

        this.prisonConfigContainer.innerHTML = "";

        detentionComplexes.forEach(district => {
            const label = document.createElement("label");
            label.className = "prison-config-row";
            const checked = sessionConfig.availablePrisons.includes(district.id) ? "checked" : "";
            label.innerHTML = `
                <input type="checkbox" value="${district.id}" data-prison-id="${district.id}" ${checked}>
                <span>${district.name}</span>
            `;
            this.prisonConfigContainer.appendChild(label);
        });

    }

    getConfiguredAvailablePrisons() {

        if (!this.prisonConfigContainer) return [...sessionConfig.availablePrisons];

        return [...this.prisonConfigContainer.querySelectorAll("input[data-prison-id]:checked")]
            .map(input => input.dataset.prisonId);

    }

    setPrisonConfigValues(prisonIds) {

        if (!this.prisonConfigContainer) return;

        const selected = new Set(prisonIds);
        this.prisonConfigContainer.querySelectorAll("input[data-prison-id]").forEach(input => {
            input.checked = selected.has(input.dataset.prisonId);
        });

    }

    getConfiguredVehiclesPerDistrict() {

        if (!this.configContainer) return { ...sessionConfig.vehiclesPerDistrict };

        return Object.fromEntries(
            [...this.configContainer.querySelectorAll("input[data-district-id]")].map(input => [
                input.dataset.districtId,
                Math.max(0, Number.parseInt(input.value, 10) || 0)
            ])
        );

    }

    setConfigValues(vehiclesPerDistrict) {

        if (!this.configContainer) return;

        this.configContainer.querySelectorAll("input[data-district-id]").forEach(input => {
            input.value = vehiclesPerDistrict[input.dataset.districtId] ?? DEFAULT_VEHICLES_PER_DISTRICT;
        });

        this.updateConfigTotal();

    }

    updateConfigTotal() {

        if (!this.configTotalElement || !this.configContainer) return;

        const total = Object.values(this.getConfiguredVehiclesPerDistrict())
            .reduce((sum, count) => sum + count, 0);

        this.configTotalElement.textContent = total;

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

        if (this.roundElement)
            this.roundElement.textContent = `${simulator.incidentsHandled}`;

        if (this.averageTimeElement)
            this.averageTimeElement.textContent = this.getAverageTravelTimeLabel();

        const waiting = (simulator.incidents || []).filter(i => i.status === "WAITING").length;
        document.getElementById("waitingCount").textContent = waiting;
        document.getElementById("repositionCount").textContent = vehicles.filter(v => v.status === "REPOSITIONING").length;
        document.getElementById("modeCount").textContent = ({automatic:"Automatisch",manualVehicle:"Handmatig",autoplay:"Autoplay"})[sessionConfig.operationMode];
        document.getElementById("complexCount").textContent = sessionConfig.availablePrisons.length;
        document.getElementById("incidentCount").textContent = (simulator.incidents || []).filter(i => i.status !== "COMPLETED").length;
        const controls = document.getElementById("autoplayControls");
        if (controls) controls.hidden = sessionConfig.operationMode !== "autoplay";
        const status = document.getElementById("autoplayStatus");
        if (status && sessionConfig.operationMode === "autoplay") {
            const seconds = simulator.autoplayPaused || simulator.nextIncidentAt === null ? "gepauzeerd" : `${Math.max(0, (simulator.nextIncidentAt - performance.now()) / 1000).toFixed(1).replace(".", ",")} sec`;
            status.textContent = `Interval ${sessionConfig.autoplayIntervalSeconds}s · Volgende melding over: ${seconds}`;
        }

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
                    <small>${item.travelTime}s</small>
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
            this.stepHintElement.textContent = repositioningFailureConfig.title;
            return;
        }

        if (sessionConfig.operationMode === "manualVehicle" && (simulator.incidents || []).some(i => i.status === "OPEN" || i.status === "WAITING")) {
            this.stepHintElement.textContent = "Klik op een beschikbaar voertuig en bevestig de inzet.";
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

    showRepositioningFailure(failure) {

        if (!this.failureOverlay || !failure || this.gameOverLogged) return;

        this.gameOverLogged = true;
        this.log(`[DEKKING] ${failure.districtName} heeft geen beschikbaar voertuig meer.`);
        this.log(`[HERPOSITIONERING] Er is geen veilig donor-district beschikbaar voor ${failure.districtName}.`);
        this.log(`[EINDE SESSIE] ${repositioningFailureConfig.title}.`);

        this.failureOverlay.querySelector("[data-failure-title]").textContent = repositioningFailureConfig.title;
        this.failureOverlay.querySelector("[data-failure-explanation]").textContent = repositioningFailureConfig.explanation;
        this.failureOverlay.querySelector("[data-failure-district]").textContent = failure.districtName;
        this.failureOverlay.querySelector("[data-failure-coverage]").textContent = `${failure.coveragePercentage}%`;
        this.failureOverlay.querySelector("[data-failure-available]").textContent = failure.availableVehicles;
        document.querySelector(".simulator")?.classList.add("failure-active");
        this.failureOverlay.hidden = false;

    }

    hideRepositioningFailure() {

        if (this.failureOverlay) this.failureOverlay.hidden = true;
        document.querySelector(".simulator")?.classList.remove("failure-active");
        this.gameOverLogged = false;

    }

    vehicleReturned(vehicleId) {

        this.log(
            `[BESCHIKBAAR] ${vehicleId} is weer beschikbaar.`
        );

        this.refresh();

    }

    getOperationMode() { return document.querySelector('input[name="operationMode"]:checked')?.value || "automatic"; }
    getAutoplayInterval() { return Number(document.getElementById("autoplayInterval")?.value || 5); }
    setOperationConfig(mode="automatic", interval=5) {
        const radio=document.querySelector(`input[name="operationMode"][value="${mode}"]`); if(radio)radio.checked=true;
        const range=document.getElementById("autoplayInterval");if(range)range.value=interval;
        this.updateModeConfigVisibility();
    }
    updateModeConfigVisibility() {
        const autoplay=this.getOperationMode()==="autoplay", box=document.getElementById("autoplayIntervalConfig"), range=document.getElementById("autoplayInterval"), output=document.getElementById("autoplayIntervalValue");
        if(box)box.hidden=!autoplay;if(range)range.disabled=!autoplay;if(output)output.textContent=`Nieuwe melding iedere ${this.getAutoplayInterval()} seconden`;
    }
    showVehicleSelection(selection) {
        const panel=document.getElementById("manualDispatchPanel"), details=document.getElementById("vehicleSelectionDetails");if(!panel||!details)return;
        panel.hidden=false;details.innerHTML=`<strong>${selection.vehicleId}</strong><dl><dt>Huidig district</dt><dd>${selection.district}</dd><dt>Afstand</dt><dd>${selection.distance} netwerksegment(en)</dd><dt>Geschatte aanrijtijd</dt><dd>${selection.eta} sec</dd><dt>Over in vertrekdistrict</dt><dd>${selection.remaining}</dd><dt>Verwachte dekking</dt><dd>${selection.coverage}%</dd></dl>`;
    }
    hideVehicleSelection(){const p=document.getElementById("manualDispatchPanel");if(p)p.hidden=true;}

}
