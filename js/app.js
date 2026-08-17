/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: app.js

Hoofdcontroller van de applicatie.
==========================================================
*/

import { createDefaultDetentionCapacity, createDefaultVehiclesPerDistrict, getDefaultPrisonDistrictIds, sessionConfig, simulator } from "./data.js";
import { Engine } from "./engine.js";
import { MapView } from "./map.js";
import { UI } from "./ui.js";

export class App {
    constructor() {
        this.engine = new Engine();
        this.map = null;
        this.ui = null;
    }

    start() {
        console.clear();
        console.log("Politie Herpositionering Simulator - Sprint 1.5");

        this.initializeMap();
        this.initializeUI();
        this.registerButtons();
        this.initializeWorkspaceLayout();
        this.sync();
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
        this.bindButton("incidentBtn", () => this.engine.createIncident());
        this.bindButton("prisonBtn", () => this.engine.selectPrison());
        this.bindButton("travelBtn", () => this.engine.calculateTravelTime());
        this.bindButton("dispatchBtn", () => this.engine.dispatchVehicle());
        this.bindButton("confirmVehicleBtn", () => this.engine.confirmManualDispatch());
        this.bindButton("cancelVehicleBtn", () => this.engine.cancelVehicleSelection());
        this.bindButton("startRepositionBtn", () => this.engine.handleManualRepositionAction());
        this.bindButton("cancelRepositionBtn", () => this.engine.cancelManualReposition());
        this.bindButton("autoplayToggleBtn", () => this.engine.toggleAutoplay());
        this.bindButton("repositionTrainingToggleBtn", () => this.engine.toggleAutoplay());
        this.bindButton("resetBtn", () => this.resetCurrentSession());
        this.bindButton("failureResetBtn", () => this.resetCurrentSession());
        this.bindButton("failureNewSessionBtn", () => this.newSessionSetup());
        this.bindButton("failureInspectBtn", () => {
            simulator.failureInspectionMode = true;
            this.ui.hideRepositioningFailureForInspection();
            return { success: true, message: "[EINDE SESSIE] Inspectiemodus actief; de simulatie blijft geblokkeerd." };
        });
        this.bindButton("failureReturnBtn", () => {
            this.ui.showRepositioningFailureScreen();
            return { success: true, message: "[EINDE SESSIE] Eindscherm opnieuw geopend." };
        });
        this.bindButton("applyConfigBtn", () => this.applyConfiguredSession());
        this.bindButton("restoreDefaultsBtn", () => {
            const defaults = createDefaultVehiclesPerDistrict();
            this.ui.setConfigValues(defaults);
            this.ui.setHotzoneConfigValues([]);
            this.ui.setHotzoneIncidentPercentage(50);
            this.ui.setPrisonConfigValues(getDefaultPrisonDistrictIds());
            this.ui.setDetentionCapacityValues(createDefaultDetentionCapacity());
            this.ui.setOperationConfig("automatic", 5);
            this.ui.setMultiUnitIncidentPercentage(20);
            this.ui.setOnSceneIncidentPercentage(30);
            this.ui.setAutoplayDelayValues(1, 20);
            return this.engine.reset({ restoreDefaults: true });
        });
        document.querySelectorAll('input[name="operationMode"]').forEach(input => input.addEventListener("input", () => this.ui.updateModeConfigVisibility()));
        document.getElementById("map")?.addEventListener("vehicle-select", event => {
            const result=simulator.manualRepositionState.phase!=="idle"?this.engine.selectRepositionVehicle(event.detail.vehicleId):this.engine.selectVehicle(event.detail.vehicleId); this.ui.log(result.message); (result.events||[]).forEach(engineEvent=>this.handleEngineEvent(engineEvent)); if(result.selection&&simulator.vehicleSelection.active)this.ui.showVehicleSelection(result.selection);else if(!simulator.vehicleSelection.active)this.ui.hideVehicleSelection();this.sync();
        });
        document.getElementById("map")?.addEventListener("district-select", event => {const result=this.engine.selectRepositionTarget(event.detail.districtId);this.ui.log(result.message);(result.events||[]).forEach(engineEvent=>this.handleEngineEvent(engineEvent));this.sync();});
        document.getElementById("map")?.addEventListener("incident-select", event => {
            const result=this.engine.selectIncident(event.detail.incidentId);this.ui.log(result.message);this.sync();
        });
        if (!this.keyboardShortcutsRegistered) {
            this.keyboardShortcutsRegistered = true;
            document.addEventListener?.("keydown", event => {
                const tag = event.target?.tagName?.toLowerCase();
                if (tag === "input" || tag === "textarea" || tag === "select" || event.target?.isContentEditable || event.repeat) return;
                if (simulator.gameOver) return;
                if (event.key === "Escape" && simulator.manualRepositionState.phase !== "idle") {
                    const result = this.engine.cancelManualReposition();
                    this.ui.log(result.message);
                    this.sync();
                    return;
                }
                if (event.key?.toLowerCase() !== "h") return;
                const phase = simulator.manualRepositionState.phase;
                if (!this.engine.getControlState().manualRepositionStart || phase !== "idle") {
                    if (phase === "selectVehicle" || phase === "selectDistrict") this.ui.log("[HERPOSITIONERING] Kies eerst voertuig en doeldistrict.");
                    return;
                }
                const result = this.engine.handleManualRepositionAction();
                this.ui.log(result.message);
                (result.events || []).forEach(engineEvent => this.handleEngineEvent(engineEvent));
                this.sync();
            });
        }
    }

    initializeWorkspaceLayout() {
        const shell = document.querySelector(".simulator");
        const activityToggle = document.getElementById("activityPanelToggle");
        const configToggle = document.getElementById("configPanelToggle");
        const focusToggle = document.getElementById("mapFocusToggle");
        const setPanel = (name, collapsed) => {
            shell?.classList.toggle(`${name}-collapsed`, collapsed);
            const button = name === "activity" ? activityToggle : configToggle;
            button?.setAttribute("aria-expanded", String(!collapsed));
            button?.setAttribute("title", `${name === "activity" ? "Activiteiten" : "Configuratie"} ${collapsed ? "openen" : "inklappen"}`);
            button?.querySelector(".visually-hidden")?.replaceChildren(`${name === "activity" ? "Activiteiten" : "Configuratie"} ${collapsed ? "openen" : "inklappen"}`);
        };
        const setFocus = active => {
            shell?.classList.toggle("map-focus-mode", active);
            document.body.classList.toggle("map-focus-mode", active);
            focusToggle.textContent = active ? "×" : "⛶";
            focusToggle.title = active ? "Normale weergave" : "Kaart vergroten";
            focusToggle.setAttribute("aria-label", focusToggle.title);
            focusToggle.setAttribute("aria-pressed", String(active));
        };
        activityToggle?.addEventListener("click", () => setPanel("activity", !shell.classList.contains("activity-collapsed")));
        configToggle?.addEventListener("click", () => setPanel("config", !shell.classList.contains("config-collapsed")));
        focusToggle?.addEventListener("click", () => setFocus(!shell.classList.contains("map-focus-mode")));
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && simulator.manualRepositionState.phase === "idle" && shell?.classList.contains("map-focus-mode")) setFocus(false);
        });
        this.setWorkspacePanel = setPanel;
    }

    bindButton(id, action) {
        const button = document.getElementById(id);

        button?.addEventListener("click", () => {
            try {
                const result = action();
                this.ui.log(result.message);
                if (result.followup) this.ui.log(result.followup);
                if (id === "cancelVehicleBtn" || (id === "confirmVehicleBtn" && result.success)) this.ui.hideVehicleSelection();
                if (id === "travelBtn" && result.success && sessionConfig.operationMode !== "autoplay") this.ui.showTravelTime?.(simulator.travelTime, simulator.activeIncident?.capacityExceeded);

                if (id === "resetBtn" || id === "failureResetBtn") this.ui.hideRepositioningFailure();

                if (id === "restoreDefaultsBtn" || id === "failureNewSessionBtn") {
                    this.ui.setConfigValues(createDefaultVehiclesPerDistrict());
                    this.ui.setPrisonConfigValues(getDefaultPrisonDistrictIds());
                }

                (result.events || []).forEach(event => this.handleEngineEvent(event));

                if (result.success && result.vehicle && result.district) {
                    this.ui.log(`[UITRUK] ${result.vehicle.id} is gekoppeld aan ${result.district.name}.`);
                }

                this.sync();
            } catch (error) {
                console.error(error);
                this.ui.log(`[FOUT] Technische fout: ${error.message}`);
                this.sync();
            }
        });
    }

    handleEngineEvent(event) {
        if (!event) return;
        if (event.type === "incidentCleared") this.ui.log(`[AANKOMST] ${event.vehicle.id} is aangekomen bij de melding.`);
        if (event.type === "onSceneStarted") this.ui.log(`[TER PLAATSE] ${event.vehicle.id} is ter plaatse en blijft ${event.seconds} seconden bezet.`);
        if (event.type === "onSceneComplete") this.ui.log(`[AFGEROND] Melding afgehandeld. ${event.vehicle.id} keert terug naar ${event.district.name}.`);
        if (event.type === "transport") this.ui.log(`[TRANSPORT] ${event.vehicle.id} rijdt naar de cel in ${event.district.name}.`);
        if (event.type === "prisonReached") this.ui.log(`[CAPACITEIT] ${event.prison.name}: ${event.occupancy}/${event.capacity} bezet.`);
        if (event.type === "prisonReleased") this.ui.log(`[CEL] 1 plek vrijgekomen in ${event.prison.name}.`);
        if (event.type === "capacityWarning") { this.ui.log(event.message); this.ui.showTravelTime(event.incident.travelTime, true); }
        if (event.type === "returning") this.ui.log(`[TERUGRIT] ${event.vehicle.id} rijdt terug naar de standplaats.`);
        if (event.type === "vehicleReturned") this.ui.vehicleReturned(event.vehicle.id);
        if (event.type === "vehicleAvailableAway") this.ui.log(`[BESCHIKBAAR] ${event.vehicle.id} blijft in ${event.district.name}; verplaats handmatig met H.`);
        if (event.type === "repositionStarted") this.ui.log(`[HERPOSITIONERING] ${event.vehicle.id} rijdt naar ${event.district.name}.`);
        if (event.type === "repositionComplete") this.ui.log(event.repositionType==="manual"?`[AANKOMST] ${event.vehicle.id} is beschikbaar in ${event.district.name}.`:`[BESCHIKBAAR] ${event.vehicle.id} dekt nu ${event.district.name}.`);
        if (event.type === "repositioningFailure") this.ui.showRepositioningFailure(event.failure);
        if (event.type === "missionFailed" || event.type === "error") this.ui.log(event.message);
        if (event.type === "log") this.ui.log(event.message);
    }


    applyConfiguredSession() {
        const availablePrisons = this.ui.getConfiguredAvailablePrisons();
        if (!availablePrisons.length) return { success: false, message: "[FOUT] Selecteer minimaal één cellencomplex." };
        this.ui.hideRepositioningFailure();
        const mode = this.ui.getOperationMode();
        const result = this.engine.reset({
            vehiclesPerDistrict: this.ui.getConfiguredVehiclesPerDistrict(),
            hotzoneDistrictIds: this.ui.getConfiguredHotzones(),
            hotzoneIncidentPercentage: this.ui.getHotzoneIncidentPercentage(),
            availablePrisons,
            detentionCapacity: this.ui.getConfiguredDetentionCapacity(),
            operationMode: mode,
            multiUnitIncidentPercentage: this.ui.getMultiUnitIncidentPercentage()
            ,onSceneIncidentPercentage: this.ui.getOnSceneIncidentPercentage()
            ,autoplayMinDelaySeconds: this.ui.getAutoplayDelayValues().min
            ,autoplayMaxDelaySeconds: this.ui.getAutoplayDelayValues().max
        });
        if (result.success && mode === "repositionTraining") {
            this.setWorkspacePanel?.("config", true);
            this.setWorkspacePanel?.("activity", true);
        }
        return result;
    }

    resetCurrentSession() {
        this.ui.hideRepositioningFailure();
        return this.engine.reset();
    }

    newSessionSetup() {
        this.ui.hideRepositioningFailure();
        this.ui.setConfigValues(createDefaultVehiclesPerDistrict());
        this.ui.setHotzoneConfigValues([]);
        this.ui.setHotzoneIncidentPercentage(50);
        this.ui.setPrisonConfigValues(getDefaultPrisonDistrictIds());
        this.ui.setDetentionCapacityValues(createDefaultDetentionCapacity());
        this.ui.setOperationConfig("automatic", 5);
        this.ui.setMultiUnitIncidentPercentage(20);
        this.ui.setOnSceneIncidentPercentage(30);
        this.ui.setAutoplayDelayValues(1, 20);
        return this.engine.reset({ restoreDefaults: true });
    }

    sync() {
        this.map.render();
        this.ui.refresh(this.engine.getControlState());
    }

    startRenderLoop() {
        const loop = now => {
            const events = this.engine.update(now);
            events.forEach(event => this.handleEngineEvent(event));

            if (this.engine.getControlState().gameOver) {
                this.ui.showRepositioningFailure(this.engine.getRepositioningFailure?.());
            }

            this.sync();
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    app.start();
});
