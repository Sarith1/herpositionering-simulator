import { districts, vehicles, colors } from "./data.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export class MapView {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container '${containerId}' niet gevonden.`);
        this.width = 1100;
        this.height = 800;
        this.svg = null;
        this.routeLayer = null;
        this.vehicleLayer = null;
        this.districtLayer = null;
        this.incidentLayer = null;
        this.animations = new Map();
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
        this.svg = document.createElementNS(SVG_NS, "svg");
        this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
        this.svg.classList.add("map-svg");
        this.container.appendChild(this.svg);
        this.routeLayer = this.createLayer("routes");
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

    drawDistricts() {
        districts.forEach(district => {
            const group = document.createElementNS(SVG_NS, "g");
            const circle = document.createElementNS(SVG_NS, "circle");
            circle.setAttribute("cx", district.x);
            circle.setAttribute("cy", district.y);
            circle.setAttribute("r", 32);
            circle.setAttribute("fill", colors[district.id]);
            circle.setAttribute("stroke", "#ffffff");
            circle.setAttribute("stroke-width", "3");
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", district.x);
            label.setAttribute("y", district.y + 60);
            label.setAttribute("text-anchor", "middle");
            label.setAttribute("fill", "white");
            label.setAttribute("font-size", "15");
            label.textContent = district.name;
            if (district.prison) {
                const prison = document.createElementNS(SVG_NS, "text");
                prison.setAttribute("x", district.x);
                prison.setAttribute("y", district.y - 45);
                prison.setAttribute("text-anchor", "middle");
                prison.setAttribute("font-size", "24");
                prison.textContent = "🏛️";
                group.appendChild(prison);
            }
            group.append(circle, label);
            this.districtLayer?.appendChild(group);
        });
    }

    vehicleSlot(districtId, vehicleId) {
        const district = districts.find(d => d.id === districtId);
        const ordered = vehicles.filter(v => v.district === districtId).sort((a, b) => a.id.localeCompare(b.id));
        const index = Math.max(0, ordered.findIndex(v => v.id === vehicleId));
        const angle = (Math.PI * 2 / Math.max(3, ordered.length)) * index;
        const radius = 45 + Math.floor(index / 6) * 18;
        return { x: district.x + Math.cos(angle) * radius, y: district.y + Math.sin(angle) * radius };
    }

    drawVehicles() {
        this.vehicleLayer.innerHTML = "";
        vehicles.forEach(vehicle => {
            this.placeVehicleAtDistrict(vehicle);
            const text = document.createElementNS(SVG_NS, "text");
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-size", "20");
            text.setAttribute("class", "vehicle");
            text.textContent = "🚔";
            text.dataset.vehicleId = vehicle.id;
            this.vehicleLayer.appendChild(text);
            this.updateVehicle(vehicle);
        });
    }

    placeVehicleAtDistrict(vehicle) {
        const point = this.vehicleSlot(vehicle.district, vehicle.id);
        vehicle.x = point.x;
        vehicle.y = point.y;
        this.updateVehicle(vehicle);
    }

    updateVehicle(vehicle) {
        const svgVehicle = this.vehicleLayer?.querySelector(`[data-vehicle-id="${vehicle.id}"]`);
        if (!svgVehicle) return;
        svgVehicle.setAttribute("x", vehicle.x);
        svgVehicle.setAttribute("y", vehicle.y);
        svgVehicle.classList.toggle("vehicle-hidden", vehicle.hidden === true);
    }

    showVehicle(vehicle) { vehicle.hidden = false; this.updateVehicle(vehicle); }
    hideVehicle(id) { const v = vehicles.find(vehicle => vehicle.id === id); if (v) { v.hidden = true; this.updateVehicle(v); } }

    showIncident(district) {
        if (!this.incidentLayer) return;
        this.incidentLayer.innerHTML = "";
        const marker = document.createElementNS(SVG_NS, "text");
        marker.setAttribute("x", district.x);
        marker.setAttribute("y", district.y - 70);
        marker.setAttribute("text-anchor", "middle");
        marker.setAttribute("font-size", "30");
        marker.textContent = "🚨";
        this.incidentLayer.appendChild(marker);
    }
    removeIncident() { if (this.incidentLayer) this.incidentLayer.innerHTML = ""; }
    highlightPrison() {}

    drawRoute(id, points, className = "route-line") {
        if (!this.routeLayer || points.length < 2) return null;
        const polyline = document.createElementNS(SVG_NS, "polyline");
        polyline.setAttribute("points", points.map(p => `${p.x},${p.y}`).join(" "));
        polyline.setAttribute("class", className);
        polyline.dataset.routeId = id;
        this.routeLayer.appendChild(polyline);
        return polyline;
    }
    clearRoute(id) { this.routeLayer?.querySelector(`[data-route-id="${id}"]`)?.remove(); }
    clearRoutes() { if (this.routeLayer) this.routeLayer.innerHTML = ""; }

    moveVehicleAlongRoute(vehicle, points, seconds, options = {}) {
        return new Promise(resolve => {
            if (!vehicle || points.length === 0) return resolve();
            const routeId = options.routeId || `${vehicle.id}-${Date.now()}`;
            if (options.showRoute) this.drawRoute(routeId, points, options.className || "route-line");
            const start = performance.now();
            const duration = Math.max(0.5, seconds) * 1000;
            const segments = points.slice(1).map((point, index) => ({ from: points[index], to: point }));
            const tick = now => {
                if (!this.animations.has(vehicle.id)) return resolve();
                const progress = Math.min(1, (now - start) / duration);
                const segmentProgress = progress * segments.length;
                const segmentIndex = Math.min(segments.length - 1, Math.floor(segmentProgress));
                const local = segmentProgress - segmentIndex;
                const segment = segments[segmentIndex];
                vehicle.x = segment.from.x + (segment.to.x - segment.from.x) * local;
                vehicle.y = segment.from.y + (segment.to.y - segment.from.y) * local;
                this.updateVehicle(vehicle);
                if (progress < 1) requestAnimationFrame(tick); else {
                    this.animations.delete(vehicle.id);
                    if (options.showRoute) this.clearRoute(routeId);
                    resolve();
                }
            };
            this.animations.set(vehicle.id, true);
            requestAnimationFrame(tick);
        });
    }

    stopAnimations() { this.animations.clear(); }
}
