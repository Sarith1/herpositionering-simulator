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
    getTotalDetentionCapacity,
    getTotalDetentionOccupancy,
    DEFAULT_VEHICLES_PER_DISTRICT,
    VEHICLE_CALLSIGNS,
    sessionConfig,
    repositioningFailureConfig,
    simulator,
    vehicles
} from "./data.js";
import { getCoverageTargets } from "./engine.js";

export const CONFIG_HELP = Object.freeze({
    vehicles:{title:"Voertuigen per district",text:"Bepaalt hoeveel eenheden bij de start van de sessie in dit district beschikbaar zijn."},
    hotzone:{title:"Hotzone",text:"Hotzones krijgen in Automatic en Autoplay prioriteit bij dekkingsverdeling."},
    hotzoneIncidents:{title:"Meldingen in Hotzones",text:"Bepaalt welk percentage van nieuwe meldingen bij voorkeur in een Hotzone ontstaat."},
    multiUnit:{title:"Grotere incidenten",text:"Bepaalt welk percentage van de meldingen 2 of 3 eenheden nodig heeft."},
    onScene:{title:"Ter-plaatse meldingen",text:"Deze meldingen worden op locatie afgehandeld en leiden niet tot een cellencomplex."},
    travelTime:{title:"Reistijd",text:"Bepaalt de minimale en maximale reistijd die in de simulatie kan worden berekend. Langere routes krijgen een tijd dichter bij het maximum."},
    autoplayMin:{title:"Minimuminterval",text:"Bepaalt de minimale willekeurige tijd tussen automatisch gegenereerde meldingen."},
    autoplayMax:{title:"Maximuminterval",text:"Bepaalt de maximale willekeurige tijd tussen automatisch gegenereerde meldingen."},
    detentionAvailability:{title:"Cellencomplex beschikbaarheid",text:"Bepaalt welke cellencomplexen beschikbaar zijn voor arrestantentransport."},
    detentionCapacity:{title:"Cellencapaciteit",text:"Bepaalt hoeveel arrestanten tegelijk in dit cellencomplex kunnen worden verwerkt."},
    operationMode:{title:"Werkwijze",text:"Bepaalt welke delen van de simulatie automatisch en welke handmatig worden uitgevoerd."}
});

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
        this.initializeConfigHelp();
        const percentageInput = document.getElementById("multiUnitIncidentPercentage");
        percentageInput?.addEventListener("input", () => this.updateMultiUnitIncidentLabel());
        this.setMultiUnitIncidentPercentage(sessionConfig.multiUnitIncidentPercentage);
        document.getElementById("onSceneIncidentPercentage")?.addEventListener("input", () => this.updateOnSceneIncidentLabel());
        this.setOnSceneIncidentPercentage(sessionConfig.onSceneIncidentPercentage);
        document.getElementById("hotzoneIncidentPercentage")?.addEventListener("input", () => this.updateHotzoneIncidentLabel());
        this.setHotzoneIncidentPercentage(sessionConfig.hotzoneIncidentPercentage);
        this.setAutoplayDelayValues(sessionConfig.autoplayMinDelaySeconds, sessionConfig.autoplayMaxDelaySeconds);
        ["autoplayMinDelay", "autoplayMaxDelay"].forEach(id => document.getElementById(id)?.addEventListener("input", event => this.handleAutoplayDelayInput(event.target)));
        this.setTravelTimeValues(sessionConfig.travelTimeMinSeconds, sessionConfig.travelTimeMaxSeconds);
        ["travelTimeMin", "travelTimeMax"].forEach(id => document.getElementById(id)?.addEventListener("input", event => this.handleTravelTimeInput(event.target)));
        this.updateModeConfigVisibility();

    }

    helpIcon(key){return `<span class="config-info" data-config-help="${key}" tabindex="0" role="button" aria-label="Meer informatie" aria-expanded="false"></span>`;}

    initializeConfigHelp() {
        const root=document.querySelector(".session-config");if(!root)return;
        root.querySelectorAll("[data-config-help]").forEach(host=>{const help=CONFIG_HELP[host.dataset.configHelp];if(!help)return;if(!host.classList.contains("config-info")){host.className="config-info";host.tabIndex=0;host.setAttribute("role","button");host.setAttribute("aria-label",`Meer informatie over ${help.title}`);host.setAttribute("aria-expanded","false");}host.innerHTML=`<span aria-hidden="true">i</span><span class="config-tooltip" role="tooltip"><strong>${help.title}</strong><span>${help.text}</span></span>`;});
        const close=except=>root.querySelectorAll(".config-info.is-open").forEach(icon=>{if(icon!==except){icon.classList.remove("is-open");icon.setAttribute("aria-expanded","false");}});
        root.addEventListener("click",event=>{const icon=event.target.closest?.(".config-info");if(!icon){close();return;}event.preventDefault();event.stopPropagation();const open=!icon.classList.contains("is-open");close(icon);icon.classList.toggle("is-open",open);icon.setAttribute("aria-expanded",String(open));});
        root.addEventListener("keydown",event=>{const icon=event.target.closest?.(".config-info");if(event.key==="Escape"){close();icon?.blur();}else if(icon&&(event.key==="Enter"||event.key===" ")){event.preventDefault();icon.click();}});
        document.addEventListener("click",()=>close());
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
            const row = document.createElement("div");
            row.className = "vehicle-config-row";
            row.innerHTML = `
                <span class="vehicle-config-name">${district.name}</span>
                <label class="vehicle-count" for="vehicle-count-${district.id}">
                    <span class="visually-hidden">Voertuigen in ${district.name}</span>
                    <input id="vehicle-count-${district.id}" type="number" min="0" max="${VEHICLE_CALLSIGNS[district.id].length}" step="1" value="${sessionConfig.vehiclesPerDistrict[district.id] ?? DEFAULT_VEHICLES_PER_DISTRICT}" data-district-id="${district.id}">
                </label>
                <label class="hotzone-config" for="hotzone-${district.id}">
                    <input id="hotzone-${district.id}" type="checkbox" data-hotzone-district-id="${district.id}">
                    <span>Hotzone ${this.helpIcon("hotzone")}</span>
                </label>
            `;
            this.configContainer.appendChild(row);
        });

        this.setHotzoneConfigValues(sessionConfig.hotzoneDistrictIds);

        this.renderPrisonConfig();

        this.updateConfigTotal();

        this.configContainer.addEventListener("input", () => { this.updateConfigTotal(); this.updateHotzoneIncidentLabel(); });

    }


    renderPrisonConfig() {

        if (!this.prisonConfigContainer) return;

        this.prisonConfigContainer.innerHTML = "";

        detentionComplexes.forEach(district => {
            const label = document.createElement("div");
            label.className = "prison-config-row";
            const checked = sessionConfig.availablePrisons.includes(district.id) ? "checked" : "";
            label.innerHTML = `
                <label class="prison-availability"><input type="checkbox" value="${district.id}" data-prison-id="${district.id}" ${checked}> <span>${district.name} ${this.helpIcon("detentionAvailability")}</span></label>
                <label class="prison-capacity">Aantal plekken ${this.helpIcon("detentionCapacity")} <input type="number" min="0" max="50" step="1" value="${sessionConfig.detentionCapacity[district.id]}" data-prison-capacity-id="${district.id}" ${checked ? "" : "disabled"}></label>
            `;
            this.prisonConfigContainer.appendChild(label);
        });
        this.prisonConfigContainer.addEventListener("input", event => {
            if (event.target.matches("[data-prison-id]")) {
                const capacityInput=this.prisonConfigContainer.querySelector(`[data-prison-capacity-id="${event.target.dataset.prisonId}"]`);
                if(capacityInput)capacityInput.disabled=!event.target.checked;
            }
            this.updateCapacityWarning();
        });
        this.updateCapacityWarning();

    }

    getConfiguredDetentionCapacity() {
        return Object.fromEntries([...this.prisonConfigContainer.querySelectorAll("[data-prison-capacity-id]")].map(input => [input.dataset.prisonCapacityId, Math.max(0, Math.min(50, Number.parseInt(input.value,10)||0))]));
    }

    setDetentionCapacityValues(values) {
        this.prisonConfigContainer?.querySelectorAll("[data-prison-capacity-id]").forEach(input => { input.value=String(values[input.dataset.prisonCapacityId] ?? 10); });
        this.updateCapacityWarning();
    }

    updateCapacityWarning() {
        const warning=document.getElementById("detentionCapacityWarning");if(!warning)return;
        const selected=new Set(this.getConfiguredAvailablePrisons()),capacities=this.getConfiguredDetentionCapacity();
        warning.hidden=[...selected].reduce((sum,id)=>sum+(capacities[id]||0),0)!==0;
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
            const capacityInput=this.prisonConfigContainer.querySelector(`[data-prison-capacity-id="${input.dataset.prisonId}"]`);
            if(capacityInput)capacityInput.disabled=!input.checked;
        });
        this.updateCapacityWarning();

    }

    getConfiguredVehiclesPerDistrict() {

        if (!this.configContainer) return { ...sessionConfig.vehiclesPerDistrict };

        return Object.fromEntries(
            [...this.configContainer.querySelectorAll("input[data-district-id]")].map(input => [
                input.dataset.districtId,
                Math.max(0, Math.min(VEHICLE_CALLSIGNS[input.dataset.districtId].length, Number.parseInt(input.value, 10) || 0))
            ])
        );

    }

    getConfiguredHotzones() {
        if (!this.configContainer) return [...sessionConfig.hotzoneDistrictIds];

        return [...this.configContainer.querySelectorAll("[data-hotzone-district-id]:checked")]
            .map(input => input.dataset.hotzoneDistrictId);
    }

    setHotzoneConfigValues(ids = []) {
        if (!this.configContainer) return;

        const selected = new Set(ids);
        this.configContainer.querySelectorAll("[data-hotzone-district-id]").forEach(input => {
            input.checked = selected.has(input.dataset.hotzoneDistrictId);
        });
        this.updateHotzoneIncidentLabel();
    }

    getHotzoneIncidentPercentage() {
        const input=document.getElementById("hotzoneIncidentPercentage");
        return Math.max(0,Math.min(100,Number(input?.value ?? sessionConfig.hotzoneIncidentPercentage)));
    }

    setHotzoneIncidentPercentage(value) {
        const input=document.getElementById("hotzoneIncidentPercentage");
        if(input)input.value=String(Math.max(0,Math.min(100,Number(value) || 0)));
        this.updateHotzoneIncidentLabel();
    }

    updateHotzoneIncidentLabel() {
        const value=this.getHotzoneIncidentPercentage(),label=document.getElementById("hotzoneIncidentPercentageLabel"),help=document.getElementById("hotzoneIncidentPercentageHelp");
        if(label)label.textContent=`${value}% van de meldingen wordt bij voorkeur in Hotzones geplaatst.`;
        if(help)help.hidden=this.getConfiguredHotzones().length>0;
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

    getOnSceneIncidentPercentage() {
        const input=document.getElementById("onSceneIncidentPercentage");
        return Math.max(0,Math.min(100,Number(input?.value ?? sessionConfig.onSceneIncidentPercentage)));
    }

    setOnSceneIncidentPercentage(value) {
        const input=document.getElementById("onSceneIncidentPercentage");
        if(input)input.value=String(Math.max(0,Math.min(100,Number(value)||0)));
        this.updateOnSceneIncidentLabel();
    }

    updateOnSceneIncidentLabel() {
        const label=document.getElementById("onSceneIncidentPercentageLabel");
        if(label)label.textContent=`${this.getOnSceneIncidentPercentage()}% van de meldingen wordt ter plaatse afgehandeld`;
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
        document.getElementById("modeCount").textContent = ({automatic:"Automatisch",manualVehicle:"Handmatig",autoplay:"Autoplay",repositionTraining:"Herpositioneringsmodus"})[sessionConfig.operationMode];
        document.getElementById("complexCount").textContent = sessionConfig.availablePrisons.length;
        const occupancy=getTotalDetentionOccupancy(),capacity=getTotalDetentionCapacity(),capacityCount=document.getElementById("detentionCapacityCount");
        if(capacityCount){capacityCount.textContent=`${occupancy} / ${capacity}`;capacityCount.dataset.level=capacity===0||occupancy>=capacity?"full":occupancy/capacity>=.8?"near":"available";}
        document.getElementById("incidentCount").textContent = (simulator.incidents || []).filter(i => i.status !== "COMPLETED").length;
        const status = document.getElementById("autoplayStatus");
        const state=simulator.autoplayState;
        const seconds = !state.running || state.nextIncidentAt === null ? null : `${Math.ceil(Math.max(0, state.nextIncidentAt-performance.now())/1000)} sec`;
        if (status && sessionConfig.operationMode === "autoplay") status.textContent = state.running ? `Autoplay actief · Volgende melding over: ${seconds}` : "Autoplay gepauzeerd";
        const trainingStatus=document.getElementById("repositionTrainingStatus");
        if(trainingStatus&&sessionConfig.operationMode==="repositionTraining")trainingStatus.textContent=waiting?`${waiting===1?"Melding wacht":`${waiting} meldingen wachten`} op voertuigkeuze · Volgende melding over: ${seconds}`:state.running?`Oefening actief · Volgende melding over: ${seconds}`:"Oefening gepauzeerd";

    }

    updateStatusPanel() {

        if (!this.statusContainer) return;

        this.statusContainer.innerHTML = "";
        const coverageTargets = getCoverageTargets();

        districts.forEach(district => {

            const available =
                vehicles.filter(vehicle =>
                    vehicle.district === district.id &&
                    vehicle.status === "AVAILABLE"
                ).length;

            const row = document.createElement("div");

            row.className = "district-status";
            const isHotzone = sessionConfig.hotzoneDistrictIds.includes(district.id);
            const maxNonHotzone = Math.max(0, ...districts.filter(item => !sessionConfig.hotzoneDistrictIds.includes(item.id)).map(item => coverageTargets.availableByDistrict[item.id]));
            const undercovered = isHotzone && available < Math.max(coverageTargets.hotzoneMinimum, maxNonHotzone);
            if (undercovered) row.classList.add("district-status--hotzone-warning");

            let icon = "🟢";

            if (available === 2)
                icon = "🟡";

            if (available <= 1)
                icon = "🟠";

            if (available === 0)
                icon = "🔴";

            row.innerHTML = `
                <span>${icon}</span>
                <span>${isHotzone ? "🔥 " : ""}${district.name}${undercovered ? ` <small>Hotzone onder gewenste dekking (≥ ${Math.max(coverageTargets.hotzoneMinimum, maxNonHotzone)})</small>` : ""}</span>
                <strong>${available}${undercovered ? " ⚠" : ""}</strong>
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

        const simulationClock = document.getElementById("simulationClock");
        if (simulationClock) {
            simulationClock.textContent = buttonState.realisticTime;
            simulationClock.dateTime = buttonState.realisticTime;
        }

        const controls = [
            { id: "incidentBtn", enabled: buttonState.incident, step: "INCIDENT" },
            { id: "prisonBtn", enabled: buttonState.prison, step: "PRISON" },
            { id: "travelBtn", enabled: buttonState.travelTime, step: "TRAVEL_TIME" },
            { id: "dispatchBtn", enabled: buttonState.dispatch, step: "DISPATCH" },
            { id: "confirmVehicleBtn", enabled: buttonState.confirmVehicle, step: "confirmVehicle" }
        ];

        const automatic = buttonState.mode === "automatic", manual = buttonState.mode === "manualVehicle", autoplay = buttonState.mode === "autoplay", training = buttonState.mode === "repositionTraining";
        document.getElementById("processControls").hidden = autoplay || training;
        document.getElementById("dispatchBtn").hidden = !automatic;
        document.getElementById("confirmVehicleBtn").hidden = !manual;
        const confirmVehicleButton=document.getElementById("confirmVehicleBtn");
        if(confirmVehicleButton&&manual){const count=simulator.vehicleSelection.selectedVehicleIds?.length||0;confirmVehicleButton.textContent=count===1?"1 eenheid inzetten":`${count} eenheden inzetten`;}
        document.getElementById("autoplayControls").hidden = !autoplay;
        document.getElementById("repositionTrainingControls").hidden = !training;
        const trainingButton=document.getElementById("repositionTrainingToggleBtn");
        if(trainingButton){trainingButton.disabled=!buttonState.autoplayToggle;trainingButton.textContent=buttonState.autoplayRunning?"⏸ Pauze":"▶ Start oefening";trainingButton.classList.toggle("is-playing",buttonState.autoplayRunning);}
        const shortcutHint=document.getElementById("repositionShortcutHint");if(shortcutHint)shortcutHint.hidden=!training;
        document.querySelector(".simulator")?.classList.toggle("reposition-training-mode",training);
        const rules=document.querySelector(".reposition-rules");if(training&&rules&&!this.trainingRulesOpened){rules.open=true;this.trainingRulesOpened=true;}if(!training)this.trainingRulesOpened=false;
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
        if (sessionConfig.operationMode === "repositionTraining") {
            const waiting=(simulator.incidents||[]).filter(i=>["OPEN","PARTIALLY_ASSIGNED"].includes(i.status)).length;
            this.stepHintElement.textContent = waiting ? (simulator.vehicleSelection.active ? "Kies een voertuig voor de melding." : `${waiting} meldingen wachten op inzet — kies eerst een melding.`) : simulator.autoplayState.running ? "Wacht op een melding of druk H om handmatig te herpositioneren." : "Start de oefening; meldingen ontstaan daarna automatisch.";
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

        const compactPreview = document.getElementById("activityCompactPreview");
        if (compactPreview) compactPreview.textContent = `↳ ${message}`;

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
            this.log(`[EINDE SESSIE] ${failure.title || repositioningFailureConfig.title}.`);
        }

        this.failureOverlay.querySelector("[data-failure-title]").textContent = failure.title || repositioningFailureConfig.title;
        this.failureOverlay.querySelector("[data-failure-explanation]").textContent = failure.explanation || repositioningFailureConfig.explanation;
        this.failureOverlay.querySelector("[data-failure-district]").textContent = failure.districtName;
        this.failureOverlay.querySelector("[data-failure-coverage]").textContent = `${failure.coveragePercentage}%`;
        this.failureOverlay.querySelector("[data-failure-available]").textContent = failure.availableVehicles;
        document.querySelector(".simulator")?.classList.add("failure-active");
        this.failureOverlay.hidden = false;

    }

    hideRepositioningFailure() {

        if (this.failureOverlay) this.failureOverlay.hidden = true;
        document.querySelector(".simulator")?.classList.remove("failure-active");
        document.querySelector(".simulator")?.classList.remove("failure-inspection");
        const button=document.getElementById("failureReturnBtn");
        if(button)button.hidden=true;
        simulator.failureInspectionMode=false;
        this.gameOverLogged = false;

    }

    hideRepositioningFailureForInspection() {
        if (this.failureOverlay) this.failureOverlay.hidden = true;
        document.querySelector(".simulator")?.classList.remove("failure-active");
        document.querySelector(".simulator")?.classList.add("failure-inspection");
        const button=document.getElementById("failureReturnBtn");
        if(button)button.hidden=false;
    }

    showRepositioningFailureScreen() {
        simulator.failureInspectionMode=false;
        document.querySelector(".simulator")?.classList.remove("failure-inspection");
        const button=document.getElementById("failureReturnBtn");
        if(button)button.hidden=true;
        this.showRepositioningFailure(simulator.repositioningFailure);
    }

    showTravelTime(seconds, capacityExceeded=false) {
        const toast=document.getElementById("travelTimeToast"), value=document.getElementById("travelTimeToastValue");
        if(!toast||!value)return;
        clearTimeout(this.travelTimeTimer);
        toast.classList.remove("is-visible");
        void toast.offsetWidth;
        value.textContent=`${seconds} sec`;
        toast.classList.toggle("capacity-exceeded",capacityExceeded);
        const reason=document.getElementById("travelTimeToastReason");if(reason)reason.textContent=capacityExceeded?"Cellencapaciteit bereikt — reistijd verdubbeld":"naar cellencomplex";
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
        if(config)config.hidden=!["autoplay","repositionTraining"].includes(this.getOperationMode());
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
    getTravelTimeValues(){return{min:Number(document.getElementById("travelTimeMin")?.value||90),max:Number(document.getElementById("travelTimeMax")?.value||120)};}
    setTravelTimeValues(min=90,max=120){
        const minInput=document.getElementById("travelTimeMin"),maxInput=document.getElementById("travelTimeMax");
        const safeMin=Math.max(30,Math.min(180,Number(min)||90)),safeMax=Math.max(safeMin,Math.min(180,Number(max)||120));
        if(minInput)minInput.value=String(safeMin);if(maxInput)maxInput.value=String(safeMax);this.updateTravelTimeLabels();
    }
    handleTravelTimeInput(input){
        const min=document.getElementById("travelTimeMin"),max=document.getElementById("travelTimeMax");if(!min||!max)return;
        if(input===min&&Number(min.value)>Number(max.value))max.value=min.value;
        if(input===max&&Number(max.value)<Number(min.value))min.value=max.value;
        this.updateTravelTimeLabels();
    }
    updateTravelTimeLabels(){const {min,max}=this.getTravelTimeValues();const a=document.getElementById("travelTimeMinLabel"),b=document.getElementById("travelTimeMaxLabel");if(a)a.textContent=`${min} sec`;if(b)b.textContent=`${max} sec`;}
    showVehicleSelection(selection) {
        const panel=document.getElementById("manualDispatchPanel"), details=document.getElementById("vehicleSelectionDetails");if(!panel||!details)return;
        const incident=simulator.incidents.find(item=>item.id===simulator.vehicleSelection.incidentId);
        const ids=simulator.vehicleSelection.selectedVehicleIds||[];
        if(!incident){details.innerHTML="<p>Kies een open melding.</p>";return;}
        const required=incident.requiredUnits||1, missing=Math.max(0,required-ids.length),training=sessionConfig.operationMode==="repositionTraining";
        panel.hidden=false;details.innerHTML=`<dl><dt>Incident</dt><dd>${districts.find(d=>d.id===incident.district)?.name||incident.district}</dd><dt>Benodigde eenheden</dt><dd>${required}</dd><dt>Geselecteerd</dt><dd><strong>${ids.length} / ${required}</strong></dd><dt>Voertuigen</dt><dd>${ids.length?ids.join(", "):"Nog geen"}</dd><dt>Nog nodig</dt><dd>${missing}</dd></dl><p>${missing?"Klik op gemarkeerde voertuigen om de selectie compleet te maken.":training?"De inzet start direct.":"De inzet is gereed voor bevestiging."}</p>`;
    }
    hideVehicleSelection(){const p=document.getElementById("manualDispatchPanel");if(p)p.hidden=true;}
    updateManualReposition(buttonState){
        const state=simulator.manualRepositionState,panel=document.getElementById("manualRepositionPanel"),primary=document.getElementById("startRepositionBtn"),cancel=document.getElementById("cancelRepositionBtn"),instruction=document.getElementById("manualRepositionInstruction"),shortcutHint=document.getElementById("repositionShortcutHint");
        const active=state.phase!=="idle";
        if(panel)panel.hidden=!active;
        const actionLabel=state.phase==="idle"?"Herpositioneer voertuig":state.phase==="selectVehicle"?"Kies een voertuig…":"Kies een doeldistrict…";
        const actionable=state.phase==="idle";
        if(primary){primary.hidden=false;primary.disabled=!buttonState.manualRepositionStart;primary.innerHTML=`${actionable?"<kbd>H</kbd>":""}<span>${actionLabel}</span>`;primary.classList.remove("dispatch-confirm-button");}
        if(shortcutHint){const label=shortcutHint.querySelector("[data-reposition-shortcut-label]");if(label)label.textContent=actionLabel;shortcutHint.hidden=buttonState.mode!=="repositionTraining"||!actionable;shortcutHint.classList.remove("reposition-shortcut-hint--ready");}
        if(cancel){cancel.hidden=!active;cancel.disabled=!active;}
        if(instruction&&active)instruction.innerHTML=state.phase==="selectDistrict"?"Kies een doeldistrict — klik op een gemarkeerd district om direct te herpositioneren.":"Kies een voertuig op de kaart.";
        const details=document.getElementById("manualRepositionDetails");
        if(details&&(!active||!state.targetDistrictId)){const vehicle=vehicles.find(item=>item.id===state.selectedVehicleId),origin=districts.find(item=>item.id===vehicle?.district);details.innerHTML=vehicle?`<dl><dt>Voertuig</dt><dd><strong>${vehicle.id}</strong></dd><dt>Van</dt><dd>${origin?.name||"—"}</dd><dt>Naar</dt><dd>Nog te kiezen</dd></dl>`:"";}
    }
    showRepositionPreview(preview){
        const details=document.getElementById("manualRepositionDetails");if(!details)return;
        details.innerHTML=`<dl><dt>Voertuig</dt><dd><strong>${preview.vehicleId}</strong></dd><dt>Van</dt><dd>${preview.origin}</dd><dt>Naar</dt><dd>${preview.target}</dd><dt>Route</dt><dd>${preview.route}</dd><dt>Voertuigen vertrekdistrict na vertrek</dt><dd>${preview.originAfter}</dd><dt>Voertuigen doeldistrict na aankomst</dt><dd>${preview.targetAfter}</dd><dt>Huidige dekking</dt><dd>${preview.current}%</dd><dt>Verwachte dekking tijdens verplaatsing</dt><dd>${preview.during}%</dd><dt>Verwachte dekking na aankomst</dt><dd>${preview.after}%</dd></dl>${preview.warning?`<p class="reposition-warning"><strong>Waarschuwing:</strong> ${preview.origin} heeft tijdens deze verplaatsing geen beschikbaar voertuig meer.</p>`:""}`;
    }

}
