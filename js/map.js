/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.4
Bestand: map.js

Verantwoordelijk voor de SVG-kaartlaag, districten, voertuigen,
meldingen, gevangenissen en routes.
==========================================================
*/

import { colors, districts, simulator, vehicles } from "./data.js";
import { getDistrictById } from "./routing.js";

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
    }

    initialize() {
        this.container.innerHTML = "";
        this.createBackground();
        this.createSVG();
        this.render();
    }

    createBackground() {
        const image = document.createElement("img");
        image.src = "assets/kaart_Eenheid_DEF.png";
        image.className = "map-background";
        image.alt = "Kaart van de politie-eenheid";
        this.container.appendChild(image);
    }

    createSVG() {
        this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
        this.svg.classList.add("map-svg");
        this.container.appendChild(this.svg);

        this.routeLayer = this.createLayer("routes");
        this.districtLayer = this.createLayer("districts");
        this.incidentLayer = this.createLayer("incidents");
        this.vehicleLayer = this.createLayer("vehicles");
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
        this.clearLayer(this.incidentLayer);
        this.clearLayer(this.vehicleLayer);

        this.drawRoute();
        this.drawDistricts();
        this.drawIncident();
        this.drawVehicles();
    }

    clearLayer(layer) {
        if (layer) layer.innerHTML = "";
    }

    drawRoute() {
        if (!simulator.activeRoute || simulator.activeRoute.length < 2) return;

        const points = simulator.activeRoute
            .map(getDistrictById)
            .filter(Boolean)
            .map(district => `${district.x},${district.y}`)
            .join(" ");

        const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        line.setAttribute("points", points);
        line.setAttribute("class", "route-line");
        this.routeLayer.appendChild(line);
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

            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", district.x);
            label.setAttribute("y", district.y + 60);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("class", "district-label");
            label.textContent = district.name;

            group.append(circle, code, label);

            if (district.prison) {
                const prison = document.createElementNS("http://www.w3.org/2000/svg", "text");
                prison.setAttribute("x", district.x);
                prison.setAttribute("y", district.y - 45);
                prison.setAttribute("text-anchor", "middle");
                prison.setAttribute("class", simulator.selectedPrison === district.id ? "prison selected" : "prison");
                prison.textContent = "🏛️";
                group.appendChild(prison);
            }

            this.districtLayer.appendChild(group);
        });
    }

    drawIncident() {
        if (!simulator.activeIncident) return;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", simulator.activeIncident.x);
        text.setAttribute("y", simulator.activeIncident.y - 72);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "incident");
        text.textContent = "🦹";
        this.incidentLayer.appendChild(text);
    }

    drawVehicles() {
        const districtIndexes = new Map();

        vehicles.forEach(vehicle => {
            if (vehicle.status === "busy" && !vehicle.incident) return;

            let x = vehicle.x;
            let y = vehicle.y;

            if (vehicle.status === "available") {
                const district = getDistrictById(vehicle.district);
                const index = districtIndexes.get(vehicle.district) || 0;
                const angle = (Math.PI * 2 / 3) * index;
                const radius = 45;

                x = district.x + Math.cos(angle) * radius;
                y = district.y + Math.sin(angle) * radius;
                vehicle.x = x;
                vehicle.y = y;

                districtIndexes.set(vehicle.district, index + 1);
            }

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", x);
            text.setAttribute("y", y);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("class", vehicle.status === "available" ? "vehicle" : "vehicle busy");
            text.dataset.vehicleId = vehicle.id;
            text.textContent = "🚔";
            this.vehicleLayer.appendChild(text);
        });
    }
}
