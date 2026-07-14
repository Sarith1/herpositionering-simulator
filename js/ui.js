import { districts, vehicles, simulator } from "./data.js";

export class UI {
    constructor() { this.elements = {}; this.lastDashboard = ""; }

    initialize() {
        ["availableCount","toIncidentCount","toPrisonCount","repositioningCount","offlineCount","openIncidentCount","handledCount","coverageCount","avgResponseCount","avgPrisonCount","repositionsCount","simTimeCount","activityLog","districtStatus","statisticsPanel"].forEach(id => { this.elements[id] = document.getElementById(id); });
        this.refresh(true);
        this.log("STATUS", "Simulator gestart");
    }

    refresh(force = false) { this.updateDashboard(force); this.updateStatusPanel(); this.updateStatistics(); }

    updateDashboard(force = false) {
        const stats = this.getDashboardStats();
        const serialized = JSON.stringify(stats);
        if (!force && serialized === this.lastDashboard) return;
        this.lastDashboard = serialized;
        Object.entries(stats).forEach(([id, value]) => { if (this.elements[id]) this.elements[id].textContent = value; });
    }

    getDashboardStats() {
        const coverage = this.coveragePercent();
        const elapsed = Math.floor((performance.now() - simulator.startTime) / 1000);
        return {
            availableCount: vehicles.filter(v => v.status === "available").length,
            toIncidentCount: vehicles.filter(v => v.status === "toIncident").length,
            toPrisonCount: vehicles.filter(v => v.status === "toPrison").length,
            repositioningCount: vehicles.filter(v => v.status === "repositioning").length,
            offlineCount: vehicles.filter(v => v.status === "offline").length,
            openIncidentCount: simulator.incidents.filter(i => i.status !== "handled").length,
            handledCount: simulator.stats.handledIncidents,
            coverageCount: `${coverage}%`,
            avgResponseCount: `${this.average(simulator.stats.responseTotal, simulator.stats.handledIncidents)}s`,
            avgPrisonCount: `${this.average(simulator.stats.prisonTravelTotal, simulator.stats.handledIncidents)}s`,
            repositionsCount: simulator.stats.repositions,
            simTimeCount: this.formatDuration(elapsed)
        };
    }

    updateStatusPanel() {
        const container = this.elements.districtStatus;
        if (!container) return;
        container.innerHTML = districts.map(district => {
            const available = vehicles.filter(vehicle => vehicle.district === district.id && vehicle.status === "available").length;
            const state = available >= 2 ? "groen" : available === 1 ? "oranje" : "rood";
            return `<div class="district-status ${state}"><span>${district.name}</span><small>${state}</small><strong>${available}</strong></div>`;
        }).join("");
    }

    updateStatistics() {
        const panel = this.elements.statisticsPanel;
        if (!panel) return;
        const elapsed = Math.floor((performance.now() - simulator.startTime) / 1000);
        const rows = [
            ["Totaal meldingen", simulator.stats.totalIncidents],
            ["Gemiddelde responstijd", `${this.average(simulator.stats.responseTotal, simulator.stats.handledIncidents)}s`],
            ["Gemiddelde gevangenisrit", `${this.average(simulator.stats.prisonTravelTotal, simulator.stats.handledIncidents)}s`],
            ["Herpositioneringen", simulator.stats.repositions],
            ["Langste keten", simulator.stats.longestRepositionChain],
            ["Mission Failed", simulator.stats.missionFailed],
            ["Totale simulatietijd", this.formatDuration(elapsed)]
        ];
        panel.innerHTML = rows.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
    }

    log(category, message) {
        if (!simulator.settings.log) return;
        const container = this.elements.activityLog;
        if (!container) return;
        const time = new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
        const item = document.createElement("div");
        item.className = "log-item";
        item.innerHTML = `<time>${time}</time><strong>[${category}]</strong><span>${message}</span>`;
        container.prepend(item);
        while (container.children.length > 100) container.lastElementChild.remove();
    }

    coveragePercent() {
        const covered = districts.filter(district => vehicles.some(vehicle => vehicle.district === district.id && vehicle.status === "available")).length;
        return Math.round((covered / districts.length) * 100);
    }

    average(total, count) { return count > 0 ? Math.round(total / count) : 0; }
    formatDuration(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
}
