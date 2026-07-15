/*
==========================================================
Politie Herpositionering Simulator
Sprint 1.2
Bestand: map.js

Verantwoordelijk voor:
- Kaart tekenen
- SVG-laag
- Districten
- Voertuigen
==========================================================
*/

import { districts, vehicles, colors } from "./data.js";

export class MapView {

    constructor(containerId) {

        this.container = document.getElementById(containerId);

        if (!this.container) {
            throw new Error(`Container '${containerId}' niet gevonden.`);
        }

        this.width = 1100;
        this.height = 800;

        this.svg = null;
        this.vehicleLayer = null;
        this.districtLayer = null;

    }

    initialize() {

        this.container.innerHTML = "";

        this.createBackground();

        this.createSVG();

        this.drawDistricts();

        this.drawVehicles();

    }

    createBackground() {

        const image = document.createElement("img");

        image.src = "assets/kaart_Eenheid_DEF.png";

        image.className = "map-background";

        image.alt = "Kaart";

        this.container.appendChild(image);

    }

    createSVG() {

        this.svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);

        this.svg.classList.add("map-svg");

        this.container.appendChild(this.svg);

        this.routeLayer = this.createLayer("routes");
        this.districtLayer = this.createLayer("districts");
        this.vehicleLayer = this.createLayer("vehicles");

    }

    createLayer(name) {

        const layer = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g"
        );

        layer.setAttribute("id", name);

        this.svg.appendChild(layer);

        return layer;

    }

    drawDistricts() {

        districts.forEach(district => {

            const group = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "g"
            );

            // Cirkel

            const circle = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "circle"
            );

            circle.setAttribute("cx", district.x);
            circle.setAttribute("cy", district.y);
            circle.setAttribute("r", 32);

            circle.setAttribute(
                "fill",
                colors[district.id]
            );

            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "3");

            // Naam

            const label = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text"
            );

            label.setAttribute("x", district.x);

            label.setAttribute("y", district.y + 60);

            label.setAttribute("text-anchor", "middle");

            label.setAttribute("fill", "white");

            label.setAttribute("font-size", "15");

            label.textContent = district.name;

            // Gevangenis

            if (district.prison) {

                const prison = document.createElementNS(
                    "http://www.w3.org/2000/svg",
                    "text"
                );

                prison.setAttribute("x", district.x);

                prison.setAttribute("y", district.y - 45);

                prison.setAttribute("text-anchor", "middle");

                prison.setAttribute("font-size", "24");

                prison.textContent = "🏛️";

                group.appendChild(prison);

            }

            group.appendChild(circle);

            group.appendChild(label);

            this.districtLayer.appendChild(group);

        });

    }

    drawVehicles() {

        vehicles.forEach((vehicle, index) => {

            const district = districts.find(
                d => d.id === vehicle.district
            );

            const angle = (Math.PI * 2 / 3) * (index % 3);

            const radius = 45;

            const x =
                district.x +
                Math.cos(angle) * radius;

            const y =
                district.y +
                Math.sin(angle) * radius;

            vehicle.x = x;
            vehicle.y = y;

            const text = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text"
            );

            text.setAttribute("x", x);

            text.setAttribute("y", y);

            text.setAttribute("text-anchor", "middle");

            text.setAttribute("font-size", "20");

            text.setAttribute("class", "vehicle");

            text.textContent = "🚔";

            text.dataset.vehicleId = vehicle.id;

            this.vehicleLayer.appendChild(text);

        });

    }

    updateVehicle(vehicle) {

        const svgVehicle = this.vehicleLayer.querySelector(
            `[data-vehicle-id="${vehicle.id}"]`
        );

        if (!svgVehicle) return;

        svgVehicle.setAttribute("x", vehicle.x);
        svgVehicle.setAttribute("y", vehicle.y);

    }

}
