/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: map.js

Verantwoordelijk voor de SVG-kaartlaag, districten, voertuigen,
meldingen, gevangenissen en routes.
==========================================================
*/

import { colors, detentionComplexes, districts, sessionConfig, simulator, vehicles } from "./data.js";
import { getDistrictById, getShortestRoute } from "./routing.js";

const VEHICLE_SCALE = 1.15;
const BASE_VEHICLE_FONT_SIZE = 24;
const VEHICLE_SLOT_RADIUS = 54;
const VEHICLE_SLOT_STEP = 18;
const DETENTION_COMPLEX_SCALE = 1.20;
const DETENTION_COMPLEX_OFFSET_Y = -62;
export const REPOSITION_TARGET_HIT_RADIUS = 95;
export const REPOSITION_TARGET_LABEL_WIDTH = 190;
export const REPOSITION_TARGET_LABEL_HEIGHT = 55;

export class MapView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`Container '${containerId}' niet gevonden.`);
        }

        this.width = 1100;
        this.height = 800;
        this.svg = null;
        this.routeLayer = null;
        this.districtLayer = null;
        this.vehicleLayer = null;
        this.incidentLayer = null;
        this.prisonLayer = null;
        this.labelLayer = null;
        this.interactionLayer = null;
        this.lastInteractionSignature = null;
        this.incidentAnimationCleanups = new Map();
    }

    initialize() {
        this.container.innerHTML = "";
        this.createBackground();
        this.createSVG();
        this.createLegend();
        this.render();
    }

    createBackground() {
        const image = document.createElement("img");
        image.src = "assets/kaart_Eenheid_DEF.png";
        image.className = "map-background";
        image.alt = "Kaart van de politie-eenheid";
        this.container.appendChild(image);
    }

    createLegend() {
        const legend = document.createElement("div");
        legend.className = "map-legend";
        legend.setAttribute("aria-label", "Legenda");
        legend.innerHTML = `
            <strong>Legenda</strong>
            <span><span class="legend-icon vehicle-icon">🚔</span> normaal voertuig</span>
            <span><span class="legend-icon vehicle-icon vehicle-repositioning-sample">🚔</span> herpositionering</span>
            <span><span class="legend-icon incident-icon">●</span> melding</span>
            <span><span class="legend-icon detention-legend-icon" aria-hidden="true">${this.getDetentionComplexLegendSvg(false)}</span> Beschikbaar cellencomplex</span>
            <span><span class="legend-icon detention-legend-icon unavailable" aria-hidden="true">${this.getDetentionComplexLegendSvg(true)}</span> Niet beschikbaar cellencomplex</span>
        `;
        this.container.appendChild(legend);
    }

    getDetentionComplexLegendSvg(unavailable) {
        return `<svg viewBox="-28 -25 56 50" focusable="false" class="detention-legend-svg${unavailable ? " unavailable" : ""}">
            <path class="detention-building" d="M-20-9h40v27h-40z"/><path class="detention-roof" d="M-23-9L0-20 23-9z"/>
            <path class="detention-badge" d="M0-16l3 4 5 1-4 4 1 5-5-2-5 2 1-5-4-4 5-1z"/>
            <path class="detention-bars" d="M-13-3v14m7-14v14M-16-3h13m-13 14h13M6-3v14m7-14v14M3-3h13M3 11h13"/>
        </svg>`;
    }

    createSVG() {
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
        this.svg.classList.add("map-svg");
        this.container.appendChild(this.svg);

        this.routeLayer = this.createLayer("routes");
        this.districtLayer = this.createLayer("districts");
        this.vehicleLayer = this.createLayer("vehicles");
        this.incidentLayer = this.createLayer("incidents");
        this.prisonLayer = this.createLayer("prisons");
        this.labelLayer = this.createLayer("labels");
        // Keep interaction targets last so visual map objects can never cover them.
        this.interactionLayer = this.createLayer("interaction");
        this.interactionLayer.addEventListener("click", event => this.handleRepositionTargetSelection(event));
        this.interactionLayer.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") this.handleRepositionTargetSelection(event);
        });
    }

    createLayer(name) {
        const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        layer.setAttribute("id", name);
        this.svg.appendChild(layer);
        return layer;
    }

    render() {
        this.clearLayer(this.routeLayer);
        this.clearLayer(this.districtLayer);
        this.clearLayer(this.labelLayer);
        this.syncIncident();

        this.drawRoutes();
        this.drawDistricts();
        this.syncPrisons();
        this.drawLabels();
        this.syncVehicles();
        this.syncInteractionLayer();
    }

    clearLayer(layer) {
        if (layer) layer.innerHTML = "";
    }

    drawRoutes() {
        const routes = [...(simulator.activeRoutes || [])];
        if (simulator.activeRoute?.length > 1) routes.push({ id: "preview", route: simulator.activeRoute, type: "preview" });

        routes.forEach(routeInfo => {
            if (!routeInfo.route || (routeInfo.route.length < 2 && !routeInfo.destination)) return;
            const points = routeInfo.route
                .map(getDistrictById)
                .filter(Boolean)
                .concat(routeInfo.destination || [])
                .map(district => `${district.x},${district.y}`)
                .join(" ");
            if (!points) return;
            const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            line.setAttribute("points", points);
            line.setAttribute("class", `route-line ${routeInfo.type || "dispatch"}`);
            this.routeLayer.appendChild(line);
        });
    }

    drawDistricts() {
        districts.forEach(district => {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("class", "district-marker");
            group.dataset.districtId = district.id;

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", district.x);
            circle.setAttribute("cy", district.y);
            circle.setAttribute("r", 32);
            circle.setAttribute("fill", colors[district.id]);
            circle.setAttribute("stroke", simulator.selectedPrison === district.id ? "#facc15" : "#ffffff");
            circle.setAttribute("stroke-width", simulator.selectedPrison === district.id ? "7" : "3");

            const code = document.createElementNS("http://www.w3.org/2000/svg", "text");
            code.setAttribute("x", district.x);
            code.setAttribute("y", district.y + 6);
            code.setAttribute("text-anchor", "middle");
            code.setAttribute("class", "district-code");
            code.textContent = district.id;

            group.append(circle, code);

            this.districtLayer.appendChild(group);
        });
    }

    syncInteractionLayer() {
        const signature = this.getInteractionSignature();
        if (signature === this.lastInteractionSignature) return;

        this.rebuildInteractionLayer();
        this.lastInteractionSignature = signature;
    }

    getInteractionSignature() {
        const { phase, selectedVehicleId, targetDistrictId } = simulator.manualRepositionState;
        return `${phase}:${selectedVehicleId || ""}:${targetDistrictId || ""}`;
    }

    rebuildInteractionLayer() {
        this.clearLayer(this.interactionLayer);
        const state = simulator.manualRepositionState;

        if (state.phase === "ready") {
            const target = getDistrictById(state.targetDistrictId);
            if (target) this.interactionLayer.appendChild(this.createRepositionTarget(target, true));
            return;
        }

        if (state.phase !== "selectDistrict" || !state.selectedVehicleId) return;
        const selectedVehicle = vehicles.find(vehicle => vehicle.id === state.selectedVehicleId);
        if (!selectedVehicle || !getDistrictById(selectedVehicle.district)) return;

        districts
            .filter(district => district.id !== selectedVehicle.district && getShortestRoute(selectedVehicle.district, district.id).length > 0)
            .forEach(district => this.interactionLayer.appendChild(this.createRepositionTarget(district, false)));
    }

    handleRepositionTargetSelection(event) {
        const target = event.target?.closest?.("[data-reposition-target-id]");
        if (!target || simulator.manualRepositionState.phase !== "selectDistrict") return;

        event.preventDefault();
        event.stopPropagation();
        this.container.dispatchEvent(new CustomEvent("district-select", {
            detail: { districtId: target.dataset.repositionTargetId }
        }));
    }

    createRepositionTarget(district, selected) {
        const target = document.createElementNS("http://www.w3.org/2000/svg", "g");
        target.setAttribute("class", `reposition-target${selected ? " reposition-target--selected" : ""}`);
        target.dataset.districtId = district.id;
        target.setAttribute("data-reposition-target-id", district.id);
        target.setAttribute("pointer-events", "all");
        target.setAttribute("aria-label", `${selected ? "Gekozen doeldistrict" : "Kies"} ${district.name}`);

        const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        hit.setAttribute("class", "reposition-target-zone reposition-target-hitarea");
        hit.dataset.districtId = district.id;
        hit.setAttribute("data-reposition-target-id", district.id);
        hit.setAttribute("pointer-events", "all");
        hit.setAttribute("cx", district.x);
        hit.setAttribute("cy", district.y);
        hit.setAttribute("r", REPOSITION_TARGET_HIT_RADIUS);

        const labelZone = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        labelZone.setAttribute("class", "reposition-target-label-zone");
        labelZone.dataset.districtId = district.id;
        labelZone.setAttribute("data-reposition-target-id", district.id);
        labelZone.setAttribute("pointer-events", "all");
        labelZone.setAttribute("x", district.x - REPOSITION_TARGET_LABEL_WIDTH / 2);
        labelZone.setAttribute("y", district.y + 35);
        labelZone.setAttribute("width", REPOSITION_TARGET_LABEL_WIDTH);
        labelZone.setAttribute("height", REPOSITION_TARGET_LABEL_HEIGHT);
        labelZone.setAttribute("rx", 18);

        const prompt = document.createElementNS("http://www.w3.org/2000/svg", "text");
        prompt.setAttribute("class", "reposition-target-prompt");
        prompt.setAttribute("x", district.x);
        prompt.setAttribute("y", district.y + 119);
        prompt.setAttribute("text-anchor", "middle");
        prompt.textContent = selected ? "Doeldistrict gekozen" : "Kies dit district";

        target.append(hit, labelZone, prompt);
        if (selected) return target;

        target.setAttribute("tabindex", "0");
        target.setAttribute("role", "button");
        return target;
    }

    syncPrisons() {
        const visiblePrisonIds = new Set();
        const availablePrisonIds = new Set(sessionConfig.availablePrisons);

        detentionComplexes
            .forEach(district => {
                visiblePrisonIds.add(district.id);

                const group = this.getOrCreatePrisonElement(district.id);
                const available = availablePrisonIds.has(district.id);
                const selected = available && simulator.selectedPrison === district.id;
                group.setAttribute("class", `prison-marker ${available ? "available" : "unavailable"}${selected ? " selected" : ""}`);
                group.setAttribute("aria-label", `Cellencomplex ${district.name}. ${available ? "Beschikbaar" : "Niet beschikbaar"}`);
                group.querySelector("title").textContent = `Cellencomplex ${district.name}\n${available ? "Beschikbaar" : "Niet beschikbaar"}`;
                group.setAttribute("transform", `translate(${district.x} ${district.y})`);
            });

        this.prisonLayer
            .querySelectorAll("[data-prison-district-id]")
            .forEach(element => {
                if (!visiblePrisonIds.has(element.dataset.prisonDistrictId)) {
                    element.remove();
                }
            });
    }

    getOrCreatePrisonElement(districtId) {
        const selector = `[data-prison-district-id="${CSS.escape(districtId)}"]`;
        const existingElement = this.prisonLayer.querySelector(selector);

        if (existingElement) return existingElement;

        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.prisonDistrictId = districtId;
        group.setAttribute("role", "img");
        group.setAttribute("tabindex", "0");

        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");

        const connector = document.createElementNS("http://www.w3.org/2000/svg", "path");
        connector.setAttribute("class", "detention-connector");
        connector.setAttribute("d", `M0 ${24 * DETENTION_COMPLEX_SCALE}V${-DETENTION_COMPLEX_OFFSET_Y - 32}`);

        const visual = document.createElementNS("http://www.w3.org/2000/svg", "g");
        visual.setAttribute("class", "prison-visual");
        visual.setAttribute("transform", `scale(${DETENTION_COMPLEX_SCALE})`);

        const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        halo.setAttribute("class", "prison-halo");
        halo.setAttribute("cx", 0);
        halo.setAttribute("cy", 0);
        halo.setAttribute("r", 28);

        const flashRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        flashRing.setAttribute("class", "prison-selection-ring");
        flashRing.setAttribute("r", 29);

        const building = document.createElementNS("http://www.w3.org/2000/svg", "path");
        building.setAttribute("class", "detention-building");
        building.setAttribute("d", "M-22-10h44v30h-44z");
        const roof = document.createElementNS("http://www.w3.org/2000/svg", "path");
        roof.setAttribute("class", "detention-roof");
        roof.setAttribute("d", "M-25-10L0-22 25-10z");
        const badge = document.createElementNS("http://www.w3.org/2000/svg", "path");
        badge.setAttribute("class", "detention-badge");
        badge.setAttribute("d", "M0-18l3 4 5 1-4 4 1 5-5-2-5 2 1-5-4-4 5-1z");
        const bars = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bars.setAttribute("class", "detention-bars");
        bars.setAttribute("d", "M-14-3v15m7-15v15M-17-3h13m-13 15h13M7-3v15m7-15v15M4-3h13M4 12h13");

        visual.append(halo, flashRing, building, roof, badge, bars);
        group.append(title, connector, visual);
        this.prisonLayer.appendChild(group);

        return group;
    }

    drawLabels() {
        districts.forEach(district => {
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", district.x);
            label.setAttribute("y", district.y + 60);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("class", "district-label");
            label.textContent = district.name;

            this.labelLayer.appendChild(label);
        });
    }

    syncIncident() {
        const visible = new Set();
        (simulator.incidents || []).filter(i => i.status !== "HANDLED").forEach(incident => {
            visible.add(incident.id);
            const element = this.incidentLayer.querySelector(`[data-incident-id="${CSS.escape(incident.id)}"]`) || this.createIncidentElement(incident);
            element.setAttribute("transform", `translate(${incident.x} ${incident.y})`);
            element.classList.toggle("waiting", ["OPEN", "PARTIALLY_ASSIGNED"].includes(incident.status));
            const selectable = sessionConfig.operationMode === "manualVehicle" && !simulator.gameOver && ["OPEN", "PARTIALLY_ASSIGNED"].includes(incident.status);
            element.classList.toggle("incident--selectable", selectable);
            element.classList.toggle("incident--selected", simulator.vehicleSelection.incidentId === incident.id || simulator.activeIncident?.id === incident.id);
            element.setAttribute("tabindex", selectable ? "0" : "-1");
        });
        this.incidentLayer.querySelectorAll("[data-incident-id]").forEach(marker => {
            if (!visible.has(marker.dataset.incidentId)) this.removeIncidentElement(marker.dataset.incidentId);
        });
    }

    createIncidentElement(incident) {
        const positionGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        positionGroup.dataset.incidentId = incident.id;
        positionGroup.setAttribute("class", "incident-position");
        const chooseIncident = () => this.container.dispatchEvent(new CustomEvent("incident-select", { detail: { incidentId: positionGroup.dataset.incidentId } }));
        positionGroup.addEventListener("click", chooseIncident);
        positionGroup.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseIncident(); } });

        const visualGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        visualGroup.setAttribute("class", "incident-visual incident-marker--intro");
        visualGroup.classList.toggle("incident-marker--multi", incident.requiredUnits > 1);

        const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        ring.setAttribute("class", "incident-ring");
        ring.setAttribute("cx", 0);
        ring.setAttribute("cy", 0);
        ring.setAttribute("r", 27);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", 0);
        text.setAttribute("y", 0);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("class", "incident");
        text.textContent = "🦹";

        visualGroup.append(ring, text);
        if (incident.requiredUnits > 1) {
            const badge=document.createElementNS("http://www.w3.org/2000/svg","circle");badge.setAttribute("class","incident-unit-badge");badge.setAttribute("cx","23");badge.setAttribute("cy","-22");badge.setAttribute("r","14");
            const badgeText=document.createElementNS("http://www.w3.org/2000/svg","text");badgeText.setAttribute("class","incident-unit-badge-text");badgeText.setAttribute("x","23");badgeText.setAttribute("y","-18");badgeText.setAttribute("text-anchor","middle");badgeText.textContent=`${incident.requiredUnits}x`;visualGroup.append(badge,badgeText);
        }
        positionGroup.appendChild(visualGroup);

        const handleIntroEnd = event => {
            if (event.animationName !== "incidentIntroPulse") return;
            visualGroup.classList.remove("incident-marker--intro");
            visualGroup.classList.add("incident-marker--active");
            this.removeIncidentAnimationListener(incident.id);
        };

        visualGroup.addEventListener("animationend", handleIntroEnd);
        this.incidentAnimationCleanups.set(incident.id, () => visualGroup.removeEventListener("animationend", handleIntroEnd));

        this.incidentLayer.appendChild(positionGroup);
        return positionGroup;
    }

    removeIncidentElement(incidentId) {
        this.removeIncidentAnimationListener(incidentId);
        const marker = this.incidentLayer.querySelector(`[data-incident-id="${CSS.escape(incidentId)}"]`);
        marker?.querySelector(".incident-visual")?.classList.remove("incident-marker--intro", "incident-marker--active");
        marker?.remove();
    }

    removeIncidentAnimationListener(incidentId) {
        const cleanup = this.incidentAnimationCleanups.get(incidentId);
        if (!cleanup) return;
        cleanup();
        this.incidentAnimationCleanups.delete(incidentId);
    }

    syncVehicles() {
        const visibleVehicleIds = new Set();
        const districtIndexes = new Map();

        vehicles.forEach(vehicle => {
            const position = this.getVehicleRenderPosition(vehicle, districtIndexes);
            if (!position) return;

            visibleVehicleIds.add(vehicle.id);
            const element = this.getOrCreateVehicleElement(vehicle);
            this.updateVehicleElement(element, vehicle, position.x, position.y);
        });

        this.vehicleLayer
            .querySelectorAll("[data-vehicle-id]")
            .forEach(element => {
                if (!visibleVehicleIds.has(element.dataset.vehicleId)) {
                    element.remove();
                }
            });
    }

    getVehicleRenderPosition(vehicle, districtIndexes) {
        if (vehicle.status !== "AVAILABLE") {
            return { x: vehicle.x, y: vehicle.y };
        }

        const district = getDistrictById(vehicle.district);
        if (!district) return null;

        const index = districtIndexes.get(vehicle.district) || 0;
        const ringIndex = Math.floor(index / 3);
        const slotIndex = index % 3;
        const angle = (Math.PI * 2 / 3) * slotIndex - (Math.PI / 2) + (ringIndex * Math.PI / 6);
        const radius = VEHICLE_SLOT_RADIUS + (ringIndex * VEHICLE_SLOT_STEP);
        const x = this.clamp(district.x + Math.cos(angle) * radius, 28, this.width - 28);
        const y = this.clamp(district.y + Math.sin(angle) * radius, 28, this.height - 28);

        vehicle.x = x;
        vehicle.y = y;
        districtIndexes.set(vehicle.district, index + 1);

        return { x, y };
    }

    getOrCreateVehicleElement(vehicle) {
        const selector = `[data-vehicle-id="${CSS.escape(vehicle.id)}"]`;
        const existingElement = this.vehicleLayer.querySelector(selector);

        if (existingElement) return existingElement;

        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.dataset.vehicleId = vehicle.id;
        const hitbox = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        hitbox.setAttribute("class", "vehicle-hitbox"); hitbox.setAttribute("r", "25");
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "central");
        text.setAttribute("class", "vehicle-symbol");
        text.textContent = "🚔";
        group.addEventListener("click", () => { if (group.classList.contains("vehicle--selectable")) this.container.dispatchEvent(new CustomEvent("vehicle-select", { detail: { vehicleId: group.dataset.vehicleId } })); });
        group.addEventListener("keydown", event => { if (group.classList.contains("vehicle--selectable") && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); group.dispatchEvent(new MouseEvent("click")); } });
        group.append(hitbox, text); this.vehicleLayer.appendChild(group);

        return group;
    }

    updateVehicleElement(element, vehicle, x, y) {
        element.setAttribute("transform", `translate(${x} ${y}) rotate(${vehicle.angle || 0})`);
        element.setAttribute("x", 0);
        element.setAttribute("y", 0);
        element.querySelector(".vehicle-symbol").style.fontSize = `${BASE_VEHICLE_FONT_SIZE * VEHICLE_SCALE}px`;
        const reposition=simulator.manualRepositionState,repositionSelectable=reposition.phase==="selectVehicle";
        const selectable = !simulator.gameOver && vehicle.status === "AVAILABLE" && !vehicle.incident && ((sessionConfig.operationMode === "manualVehicle" && simulator.vehicleSelection.active)||repositionSelectable);
        const selected=(simulator.vehicleSelection.selectedVehicleIds||[]).includes(vehicle.id)||reposition.selectedVehicleId===vehicle.id;
        element.setAttribute("class", `vehicle ${vehicle.status === "AVAILABLE" ? "available" : `busy ${String(vehicle.status).toLowerCase()}`}${selectable ? " vehicle--selectable" : ""}${selected ? " vehicle--selected" : ""}`);
        element.setAttribute("tabindex", selectable ? "0" : "-1");element.setAttribute("role", selectable ? "button" : "img");element.setAttribute("aria-label", `${vehicle.id}: ${selectable ? "beschikbaar om te selecteren" : vehicle.status}`);
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}
