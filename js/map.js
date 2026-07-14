import { districts, vehicles, colors, getDistrict, simulator } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export class MapView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container '${containerId}' niet gevonden.`);
        this.width = 1100;
        this.height = 800;
        this.vehicleNodes = new Map();
        this.districtNodes = new Map();
        this.incidentNode = null;
        this.selectedPrisonId = null;
    }

    initialize() {
        this.container.innerHTML = "";
        this.vehicleNodes.clear();
        this.districtNodes.clear();
        this.container.classList.toggle("animations-off", !simulator.settings.animations);
        this.createBackground();
        this.createSVG();
        this.drawDistrictLinks();
        this.drawDistricts();
        this.drawVehicles();
        this.updateCoverageRings();
    }

    createBackground() {
        const image = document.createElement("img");
        image.src = "assets/kaart_Eenheid_DEF.png";
        image.className = "map-background";
        image.alt = "Kaart Eenheid Rotterdam";
        this.container.appendChild(image);
    }

    createSVG() {
        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
        this.svg.classList.add("map-svg");
        this.container.appendChild(this.svg);
        this.defs = this.createLayer("defs");
        this.routeLayer = this.createLayer("routes");
        this.linkLayer = this.createLayer("links");
        this.districtLayer = this.createLayer("districts");
        this.incidentLayer = this.createLayer("incidents");
        this.vehicleLayer = this.createLayer("vehicles");
    }

    createLayer(name) {
        const layer = document.createElementNS(SVG_NS, "g");
        layer.setAttribute("id", name);
        this.svg.appendChild(layer);
        return layer;
    }

    drawDistrictLinks() {
        const done = new Set();
        districts.forEach(district => district.neighbours.forEach(neighbourId => {
            const key = [district.id, neighbourId].sort().join("-");
            if (done.has(key)) return;
            done.add(key);
            const neighbour = getDistrict(neighbourId);
            if (!neighbour) return;
            const line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", district.x);
            line.setAttribute("y1", district.y);
            line.setAttribute("x2", neighbour.x);
            line.setAttribute("y2", neighbour.y);
            line.setAttribute("class", "map-link");
            this.linkLayer.appendChild(line);
        }));
    }

    drawDistricts() {
        districts.forEach(district => {
            const group = document.createElementNS(SVG_NS, "g");
            group.setAttribute("class", "district-node");
            group.dataset.districtId = district.id;
            const ring = this.circle(district.x, district.y, 44, "coverage-ring");
            const circle = this.circle(district.x, district.y, 30, "district-circle");
            circle.setAttribute("fill", colors[district.id]);
            const labelBox = document.createElementNS(SVG_NS, "rect");
            labelBox.setAttribute("x", district.x - 78);
            labelBox.setAttribute("y", district.y + 47);
            labelBox.setAttribute("width", 156);
            labelBox.setAttribute("height", 26);
            labelBox.setAttribute("rx", 8);
            labelBox.setAttribute("class", "district-label-box");
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", district.x);
            label.setAttribute("y", district.y + 65);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("class", "district-label");
            label.textContent = district.name;
            group.append(ring, circle, labelBox, label);
            if (district.prison) {
                const prison = document.createElementNS(SVG_NS, "text");
                prison.setAttribute("x", district.x);
                prison.setAttribute("y", district.y - 45);
                prison.setAttribute("text-anchor", "middle");
                prison.setAttribute("class", "prison-icon");
                prison.textContent = "🏛️";
                group.appendChild(prison);
            }
            this.districtLayer.appendChild(group);
            this.districtNodes.set(district.id, group);
        });
    }

    circle(x, y, r, className) {
        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", r); circle.setAttribute("class", className);
        return circle;
    }

    drawVehicles() { this.vehicleLayer.innerHTML = ""; vehicles.forEach(vehicle => this.createVehicle(vehicle)); this.positionParkedVehicles(); }

    createVehicle(vehicle) {
        const group = document.createElementNS(SVG_NS, "g");
        group.dataset.vehicleId = vehicle.id;
        group.setAttribute("class", "vehicle");
        group.innerHTML = `<ellipse class="vehicle-shadow" cx="0" cy="8" rx="15" ry="6"></ellipse><text class="vehicle-icon" text-anchor="middle" dominant-baseline="central">🚔</text><circle class="beacon beacon-left" cx="-8" cy="-10" r="3"></circle><circle class="beacon beacon-right" cx="8" cy="-10" r="3"></circle><text class="vehicle-id" y="25" text-anchor="middle">${vehicle.id}</text>`;
        this.vehicleLayer.appendChild(group);
        this.vehicleNodes.set(vehicle.id, group);
    }

    positionParkedVehicles() {
        districts.forEach(district => {
            vehicles.filter(v => v.district === district.id && v.status === "available").forEach((vehicle, index, list) => {
                const angle = (Math.PI * 2 * index) / Math.max(list.length, 1) - Math.PI / 2;
                const radius = 48 + Math.floor(index / 8) * 18;
                vehicle.x = district.x + Math.cos(angle) * radius;
                vehicle.y = district.y + Math.sin(angle) * radius;
                vehicle.angle = 0;
                this.updateVehicle(vehicle);
            });
        });
    }

    updateVehicle(vehicle) {
        const node = this.vehicleNodes.get(vehicle.id);
        if (!node) return console.warn(`Voertuig SVG ontbreekt: ${vehicle.id}`);
        node.setAttribute("transform", `translate(${vehicle.x.toFixed(1)} ${vehicle.y.toFixed(1)}) rotate(${vehicle.angle.toFixed(1)})`);
        node.classList.toggle("moving", vehicle.status !== "available");
        node.classList.toggle("hide-id", !simulator.settings.showIds);
    }

    showIncident(district) {
        this.removeIncident();
        const group = document.createElementNS(SVG_NS, "g");
        group.setAttribute("class", "incident-marker");
        group.innerHTML = `<circle cx="${district.x}" cy="${district.y}" r="18"></circle><text x="${district.x}" y="${district.y + 7}" text-anchor="middle">!</text>`;
        this.incidentLayer.appendChild(group);
        this.incidentNode = group;
    }

    removeIncident() { if (this.incidentNode) this.incidentNode.remove(); this.incidentNode = null; }
    highlightPrison(id) { this.selectedPrisonId = id; this.districtNodes.forEach((node, districtId) => node.classList.toggle("selected-prison", districtId === id)); }

    renderRoutes() {
        this.routeLayer.innerHTML = "";
        if (!simulator.settings.routes) return;
        vehicles.filter(vehicle => vehicle.route?.length > 1 && vehicle.status !== "available").forEach(vehicle => {
            const points = vehicle.route.map(id => getDistrict(id)).filter(Boolean).map(d => `${d.x},${d.y}`).join(" ");
            const polyline = document.createElementNS(SVG_NS, "polyline");
            polyline.setAttribute("points", points);
            polyline.setAttribute("class", vehicle.status === "repositioning" ? "route-line reposition-route" : "route-line");
            this.routeLayer.appendChild(polyline);
        });
    }

    updateCoverageRings() {
        districts.forEach(district => {
            const available = vehicles.filter(v => v.district === district.id && v.status === "available").length;
            const node = this.districtNodes.get(district.id);
            if (!node) return;
            node.dataset.coverage = available >= 2 ? "green" : available === 1 ? "orange" : "red";
        });
    }
}
