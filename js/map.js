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
        this.routeLayer = null;
        this.districtLayer = null;
        this.incidentLayer = null;
        this.vehicleLayer = null;
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

    drawDistricts() {
        districts.forEach(district => {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.dataset.districtId = district.id;
            group.classList.add("district-node");

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", district.x);
            circle.setAttribute("cy", district.y);
            circle.setAttribute("r", 32);
            circle.setAttribute("fill", colors[district.id]);
            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "3");

            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("x", district.x);
            label.setAttribute("y", district.y + 60);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("fill", "white");
            label.setAttribute("font-size", "15");
            label.textContent = district.name;

            group.append(circle, label);

            if (district.prison) {
                const prison = document.createElementNS("http://www.w3.org/2000/svg", "text");
                prison.setAttribute("x", district.x);
                prison.setAttribute("y", district.y - 45);
                prison.setAttribute("text-anchor", "middle");
                prison.setAttribute("font-size", "24");
                prison.textContent = "🏛️";
                group.appendChild(prison);
            }

            this.districtLayer.appendChild(group);
        });
    }

    drawVehicles() {
        vehicles.forEach((vehicle, index) => {
            const districtIndex = index % 3;
            const angle = (Math.PI * 2 / 3) * districtIndex;
            const radius = 45;
            const home = districts.find(district => district.id === vehicle.homeDistrict);
            vehicle.x = home.x + Math.cos(angle) * radius;
            vehicle.y = home.y + Math.sin(angle) * radius;
            vehicle.homeX = vehicle.x;
            vehicle.homeY = vehicle.y;

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", vehicle.x);
            text.setAttribute("y", vehicle.y);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-size", "22");
            text.setAttribute("class", "vehicle");
            text.textContent = "🚔";
            text.dataset.vehicleId = vehicle.id;
            this.vehicleLayer.appendChild(text);
        });
    }

    showIncident(district) {
        this.removeIncident();
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "text");
        marker.setAttribute("x", district.x);
        marker.setAttribute("y", district.y - 70);
        marker.setAttribute("text-anchor", "middle");
        marker.setAttribute("font-size", "34");
        marker.setAttribute("class", "incident-marker");
        marker.textContent = "🦹";
        this.incidentLayer.appendChild(marker);
    }

    removeIncident() {
        this.incidentLayer.replaceChildren();
    }

    highlightPrison(districtId) {
        this.clearPrisonHighlight();
        const group = this.districtLayer.querySelector(`[data-district-id="${districtId}"]`);
        group?.classList.add("selected-prison");
    }

    clearPrisonHighlight() {
        this.districtLayer.querySelectorAll(".selected-prison").forEach(group => {
            group.classList.remove("selected-prison");
        });
    }

    drawRoute(points) {
        this.clearRoute();
        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute("points", points.map(point => `${point.x},${point.y}`).join(" "));
        polyline.setAttribute("class", "route-line");
        this.routeLayer.appendChild(polyline);
    }

    clearRoute() {
        this.routeLayer.replaceChildren();
    }

    moveVehicle(vehicle, x, y, duration = 2500) {
        const svgVehicle = this.getVehicleElement(vehicle.id);
        if (!svgVehicle) return;

        svgVehicle.style.transition = `x ${duration}ms ease-in-out, y ${duration}ms ease-in-out, opacity 250ms ease`;
        svgVehicle.style.opacity = "1";
        vehicle.x = x;
        vehicle.y = y;
        window.requestAnimationFrame(() => {
            svgVehicle.setAttribute("x", x);
            svgVehicle.setAttribute("y", y);
        });
    }

    hideVehicle(vehicleId) {
        const svgVehicle = this.getVehicleElement(vehicleId);
        if (svgVehicle) svgVehicle.style.opacity = "0";
    }

    showVehicle(vehicle) {
        this.showVehicleAt(vehicle, vehicle.homeX ?? vehicle.x, vehicle.homeY ?? vehicle.y);
    }

    showVehicleAt(vehicle, x, y) {
        const svgVehicle = this.getVehicleElement(vehicle.id);
        if (!svgVehicle) return;
        svgVehicle.style.transition = "opacity 250ms ease";
        svgVehicle.setAttribute("x", x);
        svgVehicle.setAttribute("y", y);
        svgVehicle.style.opacity = "1";
    }

    getVehicleElement(vehicleId) {
        return this.vehicleLayer.querySelector(`[data-vehicle-id="${vehicleId}"]`);
    }
}
