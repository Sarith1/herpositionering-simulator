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
        this.travelTimeTimer = null;

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
        const percentageInput = document.getElementById("multiUnitIncidentPercentage");
        percentageInput?.addEventListener("input", () => this.updateMultiUnitIncidentLabel());
        this.setMultiUnitIncidentPercentage(sessionConfig.multiUnitIncidentPercentage);
        this.setAutoplayDelayValues(sessionConfig.autoplayMinDelaySeconds, sessionConfig.autoplayMaxDelaySeconds);
        ["autoplayMinDelay", "autoplayMaxDelay"].forEach(id => document.getElementById(id)?.addEventListener("input", event => this.handleAutoplayDelayInput(event.target)));
        this.updateModeConfigVisibility();

    }

    refresh(buttonState = null) {

        this.updateDashboard();

        this.updateStatusPanel();

        this.updateEvaluationPanel();

        if (buttonState) {
            this.updateButtons(buttonState);
            const panel=document.getElementById("manualDispatchPanel"), details=document.getElementById("vehicleSelectionDetails");
            if(panel)panel.hidden=!buttonState.vehicleSelectionActive;
            if(details&&buttonState.vehicleSelectionActive)this.showVehicleSelection();
            this.updateManualReposition(buttonState);
        }

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

    getMultiUnitIncidentPercentage() {
        const input = document.getElementById("multiUnitIncidentPercentage");
        return Math.max(0, Math.min(100, Number(input?.value ?? sessionConfig.multiUnitIncidentPercentage)));
    }

    setMultiUnitIncidentPercentage(value) {
        const input = document.getElementById("multiUnitIncidentPercentage");
        if (input) input.value = String(Math.max(0, Math.min(100, Number(value) || 0)));
        this.updateMultiUnitIncidentLabel();
    }

    updateMultiUnitIncidentLabel() {
        const label = document.getElementById("multiUnitIncidentPercentageLabel");
        if (label) label.textContent = `${this.getMultiUnitIncidentPercentage()}% van de meldingen vraagt meerdere eenheden`;
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

        const waiting = (simulator.incidents || []).filter(i => ["OPEN", "PARTIALLY_ASSIGNED"].includes(i.status)).length;
        document.getElementById("waitingCount").textContent = waiting;
        document.getElementById("repositionCount").textContent = vehicles.filter(v => v.status === "REPOSITIONING").length;
        document.getElementById("modeCount").textContent = ({automatic:"Automatisch",manualVehicle:"Handmatig",autoplay:"Autoplay"})[sessionConfig.operationMode];
        document.getElementById("complexCount").textContent = sessionConfig.availablePrisons.length;
        document.getElementById("incidentCount").textContent = (simulator.incidents || []).filter(i => i.status !== "COMPLETED").length;
        const status = document.getElementById("autoplayStatus");
        if (status && sessionConfig.operationMode === "autoplay") {
            const state=simulator.autoplayState;
            const seconds = !state.running || state.nextIncidentAt === null ? null : `${Math.ceil(Math.max(0, state.nextIncidentAt-performance.now())/1000)} sec`;
            status.textContent = state.running ? `Autoplay actief · Volgende melding over: ${seconds}` : "Autoplay gepauzeerd";
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
            { id: "incidentBtn", enabled: buttonState.incident, step: "INCIDENT" },
            { id: "prisonBtn", enabled: buttonState.prison, step: "PRISON" },
            { id: "travelBtn", enabled: buttonState.travelTime, step: "TRAVEL_TIME" },
            { id: "dispatchBtn", enabled: buttonState.dispatch, step: "DISPATCH" },
            { id: "confirmVehicleBtn", enabled: buttonState.confirmVehicle, step: "confirmVehicle" }
        ];

        const automatic = buttonState.mode === "automatic", manual = buttonState.mode === "manualVehicle", autoplay = buttonState.mode === "autoplay";
        document.getElementById("processControls").hidden = autoplay;
        document.getElementById("dispatchBtn").hidden = !automatic;
        document.getElementById("confirmVehicleBtn").hidden = !manual;
        const confirmVehicleButton=document.getElementById("confirmVehicleBtn");
        if(confirmVehicleButton&&manual){const count=simulator.vehicleSelection.selectedVehicleIds?.length||0;confirmVehicleButton.textContent=count===1?"1 eenheid inzetten":`${count} eenheden inzetten`;}
        document.getElementById("autoplayControls").hidden = !autoplay;
        const autoplayButton=document.getElementById("autoplayToggleBtn");
        if(autoplayButton){autoplayButton.disabled=!buttonState.autoplayToggle;autoplayButton.textContent=buttonState.autoplayRunning?"⏸ Pauze":"▶ Play";autoplayButton.classList.toggle("is-playing",buttonState.autoplayRunning);}

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

        if (sessionConfig.operationMode === "manualVehicle" && simulator.vehicleSelection.active) {
            this.stepHintElement.textContent = simulator.selectedVehicleId ? "Bevestig de keuze met ‘Voertuig inzetten’." : "Kies een beschikbaar voertuig op de kaart.";
            return;
        }
        if (simulator.manualRepositionState.phase !== "idle") {
            this.stepHintElement.textContent = simulator.manualRepositionState.selectedVehicleId ? "Dekking: kies een doeldistrict op de kaart." : "Dekking: kies eerst een beschikbaar voertuig.";
            return;
        }
        if (sessionConfig.operationMode === "autoplay") {
            this.stepHintElement.textContent = simulator.autoplayState.running ? "Autoplay verwerkt meldingen automatisch." : "Druk op Play om autoplay te starten.";
            return;
        }
        const labels = {
            INCIDENT: "1. Plaats een nieuwe melding.",
            PRISON: "2. Selecteer een cel voor de arrestant.",
            TRAVEL_TIME: "3. Bereken de reistijd naar de cel.",
            DISPATCH: sessionConfig.operationMode === "manualVehicle" ? "Kies een beschikbaar voertuig op de kaart." : "4. Stuur het dichtstbijzijnde voertuig."
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

        const type=(message.match(/^\[([^\]]+)\]/)?.[1]||"INFO").toLowerCase().replace(/[^a-z]/g,"");
        item.className = `log-item log-item--${type}`;

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

        if (!this.failureOverlay || !failure || simulator.failureInspectionMode) return;

        if(!this.gameOverLogged){
            this.gameOverLogged = true;
            this.log(`[DEKKING] ${failure.districtName} heeft geen beschikbaar voertuig meer.`);
            this.log(`[HERPOSITIONERING] Er is geen veilig donor-district beschikbaar voor ${failure.districtName}.`);
            this.log(`[EINDE SESSIE] ${repositioningFailureConfig.title}.`);
        }

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
        const button=document.getElementById("failureReturnBtn");
        if(button)button.hidden=true;
        simulator.failureInspectionMode=false;
        this.gameOverLogged = false;

    }

    hideRepositioningFailureForInspection() {
        if (this.failureOverlay) this.failureOverlay.hidden = true;
        document.querySelector(".simulator")?.classList.remove("failure-active");
        const button=document.getElementById("failureReturnBtn");
        if(button)button.hidden=false;
    }

    showRepositioningFailureScreen() {
        simulator.failureInspectionMode=false;
        const button=document.getElementById("failureReturnBtn");
        if(button)button.hidden=true;
        this.showRepositioningFailure(simulator.repositioningFailure);
    }

    showTravelTime(seconds) {
        const toast=document.getElementById("travelTimeToast"), value=document.getElementById("travelTimeToastValue");
        if(!toast||!value)return;
        clearTimeout(this.travelTimeTimer);
        toast.classList.remove("is-visible");
        void toast.offsetWidth;
        value.textContent=`${seconds} sec`;
        toast.classList.add("is-visible");
        this.travelTimeTimer=setTimeout(()=>toast.classList.remove("is-visible"),2000);
    }

    vehicleReturned(vehicleId) {

        this.log(
            `[BESCHIKBAAR] ${vehicleId} is weer beschikbaar.`
        );

        this.refresh();

    }

    getOperationMode() { return document.querySelector('input[name="operationMode"]:checked')?.value || "automatic"; }
    setOperationConfig(mode="automatic") {
        const radio=document.querySelector(`input[name="operationMode"][value="${mode}"]`); if(radio)radio.checked=true;
        this.updateModeConfigVisibility();
    }
    updateModeConfigVisibility() {
        const config=document.getElementById("autoplayIntervalConfig");
        if(config)config.hidden=this.getOperationMode()!=="autoplay";
    }
    getAutoplayDelayValues(){return{min:Number(document.getElementById("autoplayMinDelay")?.value||1),max:Number(document.getElementById("autoplayMaxDelay")?.value||20)};}
    setAutoplayDelayValues(min=1,max=20){
        const minInput=document.getElementById("autoplayMinDelay"),maxInput=document.getElementById("autoplayMaxDelay");
        if(minInput)minInput.value=String(min);if(maxInput)maxInput.value=String(Math.max(min,max));this.updateAutoplayDelayLabels();
    }
    handleAutoplayDelayInput(input){
        const min=document.getElementById("autoplayMinDelay"),max=document.getElementById("autoplayMaxDelay");if(!min||!max)return;
        if(input===min&&Number(min.value)>Number(max.value))max.value=min.value;
        if(input===max&&Number(max.value)<Number(min.value))min.value=max.value;
        this.updateAutoplayDelayLabels();
    }
    updateAutoplayDelayLabels(){const {min,max}=this.getAutoplayDelayValues();const a=document.getElementById("autoplayMinDelayLabel"),b=document.getElementById("autoplayMaxDelayLabel");if(a)a.textContent=`${min} sec`;if(b)b.textContent=`${max} sec`;}
    showVehicleSelection(selection) {
        const panel=document.getElementById("manualDispatchPanel"), details=document.getElementById("vehicleSelectionDetails");if(!panel||!details)return;
        const incident=simulator.incidents.find(item=>item.id===simulator.vehicleSelection.incidentId);
        const ids=simulator.vehicleSelection.selectedVehicleIds||[];
        if(!incident){details.innerHTML="<p>Kies een open melding.</p>";return;}
        const required=incident.requiredUnits||1, missing=Math.max(0,required-ids.length);
        panel.hidden=false;details.innerHTML=`<dl><dt>Incident</dt><dd>${districts.find(d=>d.id===incident.district)?.name||incident.district}</dd><dt>Benodigde eenheden</dt><dd>${required}</dd><dt>Geselecteerd</dt><dd><strong>${ids.length} / ${required}</strong></dd><dt>Voertuigen</dt><dd>${ids.length?ids.join(", "):"Nog geen"}</dd><dt>Nog nodig</dt><dd>${missing}</dd></dl><p>${missing?"Klik op gemarkeerde voertuigen om de selectie compleet te maken.":"De inzet is gereed voor bevestiging."}</p>`;
    }
    hideVehicleSelection(){const p=document.getElementById("manualDispatchPanel");if(p)p.hidden=true;}
    updateManualReposition(buttonState){
        const state=simulator.manualRepositionState,panel=document.getElementById("manualRepositionPanel"),primary=document.getElementById("startRepositionBtn"),cancel=document.getElementById("cancelRepositionBtn"),instruction=document.getElementById("manualRepositionInstruction");
        const active=state.phase!=="idle";
        if(panel)panel.hidden=!active;
        if(primary){primary.hidden=false;primary.disabled=!buttonState.manualRepositionStart;primary.textContent=state.phase==="idle"?"Herpositioneer voertuig":state.phase==="selectVehicle"?"Kies een voertuig":state.phase==="selectDistrict"?"Kies nu het doeldistrict":"Herpositionering starten";primary.classList.toggle("dispatch-confirm-button",state.phase==="ready");}
        if(cancel){cancel.hidden=!active;cancel.disabled=!active;}
        if(instruction&&active)instruction.textContent=state.phase==="selectDistrict"?"Kies een doeldistrict op de kaart — klik op een blauw gemarkeerd district.":state.phase==="selectVehicle"?"Kies een beschikbaar voertuig":"De herpositionering kan met de hoofdknop worden gestart";
        const details=document.getElementById("manualRepositionDetails");
        if(details&&(!active||!state.targetDistrictId)){const vehicle=vehicles.find(item=>item.id===state.selectedVehicleId),origin=districts.find(item=>item.id===vehicle?.district);details.innerHTML=vehicle?`<dl><dt>Voertuig</dt><dd><strong>${vehicle.id}</strong></dd><dt>Van</dt><dd>${origin?.name||"—"}</dd><dt>Naar</dt><dd>Nog te kiezen</dd></dl>`:"";}
    }
    showRepositionPreview(preview){
        const details=document.getElementById("manualRepositionDetails");if(!details)return;
        details.innerHTML=`<dl><dt>Voertuig</dt><dd><strong>${preview.vehicleId}</strong></dd><dt>Van</dt><dd>${preview.origin}</dd><dt>Naar</dt><dd>${preview.target}</dd><dt>Route</dt><dd>${preview.route}</dd><dt>Voertuigen vertrekdistrict na vertrek</dt><dd>${preview.originAfter}</dd><dt>Voertuigen doeldistrict na aankomst</dt><dd>${preview.targetAfter}</dd><dt>Huidige dekking</dt><dd>${preview.current}%</dd><dt>Verwachte dekking tijdens verplaatsing</dt><dd>${preview.during}%</dd><dt>Verwachte dekking na aankomst</dt><dd>${preview.after}%</dd></dl>${preview.warning?`<p class="reposition-warning"><strong>Waarschuwing:</strong> ${preview.origin} heeft tijdens deze verplaatsing geen beschikbaar voertuig meer.</p>`:""}`;
    }

}
