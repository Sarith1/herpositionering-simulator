/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.5
Bestand: map.js

Verantwoordelijk voor de SVG-kaartlaag, districten, voertuigen,
meldingen, gevangenissen en routes.
==========================================================
*/

import { colors, districts, sessionConfig, simulator, vehicles } from "./data.js";
import { getDistrictById } from "./routing.js";

const VEHICLE_SCALE = 1.15;
const BASE_VEHICLE_FONT_SIZE = 24;
const VEHICLE_SLOT_RADIUS = 54;
const VEHICLE_SLOT_STEP = 18;
const PRISON_ICON_SCALE = 1.20;
const BASE_PRISON_FONT_SIZE = 32;
const PRISON_ICON_OFFSET_Y = -48;

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
        this.incidentAnimationCleanup = null;
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
            <span><span class="legend-icon prison-icon">🏛️</span> geselecteerde cel</span>
        `;
        this.container.appendChild(legend);
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
    }

    clearLayer(layer) {
        if (layer) layer.innerHTML = "";
    }

    drawRoutes() {
        const routes = [...(simulator.activeRoutes || [])];
        if (simulator.activeRoute?.length > 1) routes.push({ id: "preview", route: simulator.activeRoute, type: "preview" });

        routes.forEach(routeInfo => {
            if (!routeInfo.route || routeInfo.route.length < 2) return;
            const points = routeInfo.route
                .map(getDistrictById)
                .filter(Boolean)
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

    syncPrisons() {
        const visiblePrisonIds = new Set();

        districts
            .filter(district => district.prison && sessionConfig.availablePrisons.includes(district.id))
            .forEach(district => {
                visiblePrisonIds.add(district.id);

                const group = this.getOrCreatePrisonElement(district.id);
                group.setAttribute("class", simulator.selectedPrison === district.id ? "prison-marker selected" : "prison-marker");
                group.setAttribute("transform", `translate(${district.x} ${district.y + PRISON_ICON_OFFSET_Y})`);
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

        const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        halo.setAttribute("class", "prison-halo");
        halo.setAttribute("cx", 0);
        halo.setAttribute("cy", 0);
        halo.setAttribute("r", 21 * PRISON_ICON_SCALE);

        const prison = document.createElementNS("http://www.w3.org/2000/svg", "text");
        prison.setAttribute("x", 0);
        prison.setAttribute("y", 0);
        prison.setAttribute("text-anchor", "middle");
        prison.setAttribute("dominant-baseline", "central");
        prison.setAttribute("class", "prison");
        prison.style.fontSize = `${BASE_PRISON_FONT_SIZE * PRISON_ICON_SCALE}px`;
        prison.textContent = "🏛️";

        group.append(halo, prison);
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
        if (!simulator.activeIncident) {
            this.removeIncidentElement();
            return;
        }

        const incident = simulator.activeIncident;
        const existingElement = this.incidentLayer.querySelector(`[data-incident-id="${CSS.escape(incident.id)}"]`);
        const element = existingElement || this.createIncidentElement(incident);
        element.setAttribute("transform", `translate(${incident.x} ${incident.y - 72})`);

        this.incidentLayer
            .querySelectorAll("[data-incident-id]")
            .forEach(marker => {
                if (marker !== element) marker.remove();
            });
    }

    createIncidentElement(incident) {
        this.removeIncidentAnimationListener();

        const positionGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        positionGroup.dataset.incidentId = incident.id;
        positionGroup.setAttribute("class", "incident-position");

        const visualGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        visualGroup.setAttribute("class", "incident-visual incident-marker--intro");

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
        positionGroup.appendChild(visualGroup);

        const handleIntroEnd = event => {
            if (event.animationName !== "incidentIntroPulse") return;
            visualGroup.classList.remove("incident-marker--intro");
            visualGroup.classList.add("incident-marker--active");
            this.removeIncidentAnimationListener();
        };

        visualGroup.addEventListener("animationend", handleIntroEnd);
        this.incidentAnimationCleanup = () => visualGroup.removeEventListener("animationend", handleIntroEnd);

        this.incidentLayer.appendChild(positionGroup);
        return positionGroup;
    }

    removeIncidentElement() {
        this.removeIncidentAnimationListener();
        this.clearLayer(this.incidentLayer);
    }

    removeIncidentAnimationListener() {
        if (!this.incidentAnimationCleanup) return;
        this.incidentAnimationCleanup();
        this.incidentAnimationCleanup = null;
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

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("text-anchor", "middle");
        text.dataset.vehicleId = vehicle.id;
        text.setAttribute("dominant-baseline", "central");
        text.textContent = "🚔";
        this.vehicleLayer.appendChild(text);

        return text;
    }

    updateVehicleElement(element, vehicle, x, y) {
        element.setAttribute("transform", `translate(${x} ${y}) rotate(${vehicle.angle || 0})`);
        element.setAttribute("x", 0);
        element.setAttribute("y", 0);
        element.style.fontSize = `${BASE_VEHICLE_FONT_SIZE * VEHICLE_SCALE}px`;
        element.setAttribute("class", vehicle.status === "AVAILABLE" ? "vehicle" : `vehicle busy ${String(vehicle.status).toLowerCase()}`);
    }

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}
