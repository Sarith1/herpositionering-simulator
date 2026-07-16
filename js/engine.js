/*
==========================================================
Politie Herpositionering Simulator
Stabilisatie: parallelle dispatches, voertuigfasen en herpositionering.
==========================================================
*/

import { districts, simulator, vehicles } from "./data.js";
import { calculateTravelTime, findNearestAvailableVehicle, getDistrictById, getShortestRoute, getRouteDistance } from "./routing.js";

const STEPS = { INCIDENT: "incident", PRISON: "prison", TRAVEL_TIME: "travelTime", DISPATCH: "dispatch" };
const STATUS = { AVAILABLE: "AVAILABLE", TO_INCIDENT: "TO_INCIDENT", TO_PRISON: "TO_PRISON", BUSY: "BUSY", RETURNING: "RETURNING", REPOSITIONING: "REPOSITIONING" };
const DRIVE_MS_PER_EDGE = 1400;
const MIN_BUSY_SECONDS = 90;
const MAX_BUSY_SECONDS = 120;

export class Engine {
    constructor() {
        this.step = STEPS.INCIDENT;
        this.activeDispatches = new Map();
        this.activeRepositions = new Map();
        this.dispatchSequence = 0;
        this.repositionSequence = 0;
    }

    createIncident() {
        if (simulator.gameOver) return this.result(false, "[FOUT] De oefening is geblokkeerd. Druk op reset voor een nieuwe sessie.");
        if (this.step !== STEPS.INCIDENT) return this.result(false, "[FOUT] Maak eerst de huidige knopcyclus af.");
        if (!vehicles.some(v => v.status === STATUS.AVAILABLE)) return this.result(false, "[FOUT] Er is geen beschikbaar voertuig voor een nieuwe melding.");

        const district = this.getRandomItem(districts);
        simulator.activeIncident = { id: `INC-${Date.now()}-${this.dispatchSequence + 1}`, district: district.id, x: district.x, y: district.y, status: "OPEN" };
        simulator.selectedPrison = null;
        simulator.travelTime = null;
        simulator.activeRoute = [];
        simulator.lastScoreBreakdown = null;
        this.step = STEPS.PRISON;
        return this.result(true, `[MELDING] Nieuwe melding in ${district.name}.`, { district });
    }

    selectPrison() {
        if (this.step !== STEPS.PRISON) return this.result(false, "[FOUT] Plaats eerst een melding met knop 1.");
        if (!simulator.activeIncident) return this.failAndResetCycle("Er is geen actieve melding om aan een cel te koppelen.");
        const prison = this.getRandomItem(getPrisonDistrictsSafe());
        simulator.selectedPrison = prison.id;
        simulator.activeRoute = getShortestRoute(simulator.activeIncident.district, prison.id);
        this.step = STEPS.TRAVEL_TIME;
        return this.result(true, `[CEL] Cel geselecteerd in ${prison.name}.`, { prison });
    }

    calculateTravelTime() {
        if (this.step !== STEPS.TRAVEL_TIME) return this.result(false, "[FOUT] Selecteer eerst een cel met knop 2.");
        if (!simulator.activeIncident || !simulator.selectedPrison) return this.failAndResetCycle("Melding of geselecteerde cel ontbreekt.");
        const route = getShortestRoute(simulator.activeIncident.district, simulator.selectedPrison);
        if (!route.length) return this.result(false, "[FOUT] Er is geen route tussen melding en cel gevonden.");
        simulator.activeRoute = route;
        simulator.travelTime = calculateTravelTime(route);
        this.step = STEPS.DISPATCH;
        return this.result(true, `[REISTIJD] Reistijd berekend: ${simulator.travelTime} seconden.`, { route });
    }

    dispatchVehicle() {
        if (this.step !== STEPS.DISPATCH) return this.result(false, "[FOUT] Bereken eerst de reistijd met knop 3.");
        if (!simulator.activeIncident) return this.failAndResetCycle("Er is geen actieve melding voor knop 4.");
        if (!simulator.selectedPrison) return this.result(false, "[FOUT] Er is geen cel geselecteerd voor deze melding.");

        const incidentDistrict = getDistrictById(simulator.activeIncident.district);
        const prisonDistrict = getDistrictById(simulator.selectedPrison);
        if (!incidentDistrict || !prisonDistrict) return this.result(false, "[FOUT] Districtgegevens ontbreken voor melding of cel.");

        const nearest = findNearestAvailableVehicle(vehicles, incidentDistrict.id);
        if (!nearest.vehicle) return this.result(false, "[FOUT] Geen beschikbaar voertuig gevonden.");
        const vehicle = nearest.vehicle;
        if (this.isVehicleReserved(vehicle.id)) return this.result(false, `[FOUT] ${vehicle.id} is al gekoppeld aan een lopende opdracht.`);

        const dispatchId = `DSP-${++this.dispatchSequence}`;
        const returnRoute = getShortestRoute(prisonDistrict.id, vehicle.district);
        Object.assign(vehicle, { status: STATUS.TO_INCIDENT, incident: simulator.activeIncident.id, prison: prisonDistrict.id, angle: 0 });

        const dispatch = {
            id: dispatchId, vehicleId: vehicle.id, incidentId: simulator.activeIncident.id, phase: STATUS.TO_INCIDENT,
            originDistrictId: vehicle.district, incidentDistrictId: incidentDistrict.id, prisonDistrictId: prisonDistrict.id,
            routeToIncident: [...nearest.route], routeToPrison: [...simulator.activeRoute], returnRoute,
            startTime: performance.now(), phaseStartTime: performance.now(), busySeconds: simulator.travelTime || MIN_BUSY_SECONDS,
            fromX: vehicle.x, fromY: vehicle.y, toX: incidentDistrict.x, toY: incidentDistrict.y, scoreBreakdown: null
        };
        this.activeDispatches.set(dispatchId, dispatch);
        simulator.activeRoutes.push({ id: dispatchId, route: dispatch.routeToIncident, type: "dispatch" });
        simulator.activeIncident = null;
        simulator.selectedPrison = null;
        simulator.travelTime = null;
        simulator.activeRoute = [];
        this.step = STEPS.INCIDENT;
        const coverageEvents = this.ensureCoverage();
        return this.result(true, `[DISPATCH] ${vehicle.id} rijdt naar ${incidentDistrict.name}.`, { vehicle, district: incidentDistrict, events: coverageEvents });
    }

    update(now = performance.now()) {
        const events = [];
        for (const dispatch of [...this.activeDispatches.values()]) events.push(...this.updateDispatch(dispatch, now));
        for (const reposition of [...this.activeRepositions.values()]) events.push(...this.updateReposition(reposition, now));
        return events;
    }

    updateDispatch(dispatch, now) {
        const vehicle = vehicles.find(v => v.id === dispatch.vehicleId);
        if (!vehicle) { this.activeDispatches.delete(dispatch.id); return [{ type: "error", message: `[FOUT] Voertuig ${dispatch.vehicleId} bestaat niet meer.` }]; }
        if (dispatch.phase === STATUS.BUSY) {
            const elapsed = (now - dispatch.phaseStartTime) / 1000;
            dispatch.remainingTime = Math.max(0, Math.ceil(dispatch.busySeconds - elapsed));
            if (elapsed < dispatch.busySeconds) return [];
            const assigned = getDistrictById(vehicle.district) || getDistrictById(vehicle.homeDistrict);
            this.startPhase(dispatch, STATUS.RETURNING, now, getShortestRoute(dispatch.prisonDistrictId, assigned.id), assigned.x, assigned.y);
            vehicle.status = STATUS.RETURNING;
            simulator.activeRoutes.push({ id: `${dispatch.id}-return`, route: dispatch.returnRoute, type: "return" });
            return [{ type: "returning", vehicle }];
        }
        const progress = Math.min(1, (now - dispatch.phaseStartTime) / this.getDriveDuration(this.getPhaseRoute(dispatch)));
        this.moveVehicle(vehicle, this.getPhaseRoute(dispatch), progress, dispatch);
        if (progress < 1) return [];
        if (dispatch.phase === STATUS.TO_INCIDENT) {
            dispatch.scoreBreakdown = this.calculateScoreBreakdown(dispatch.busySeconds);
            simulator.incidentsHandled += 1; simulator.score += dispatch.scoreBreakdown.total;
            simulator.incidentHistory.push({ round: simulator.incidentsHandled, incidentDistrict: dispatch.incidentDistrictId, prisonDistrict: dispatch.prisonDistrictId, vehicleId: vehicle.id, travelTime: dispatch.busySeconds, route: [...dispatch.routeToPrison], score: dispatch.scoreBreakdown.total });
            simulator.lastScoreBreakdown = dispatch.scoreBreakdown;
            vehicle.district = dispatch.incidentDistrictId; vehicle.status = STATUS.TO_PRISON;
            this.removeRoute(dispatch.id);
            this.startPhase(dispatch, STATUS.TO_PRISON, now, dispatch.routeToPrison, getDistrictById(dispatch.prisonDistrictId).x, getDistrictById(dispatch.prisonDistrictId).y);
            simulator.activeRoutes.push({ id: dispatch.id, route: dispatch.routeToPrison, type: "dispatch" });
            return [{ type: "incidentCleared", vehicle, district: getDistrictById(dispatch.incidentDistrictId) }, { type: "transport", vehicle, district: getDistrictById(dispatch.prisonDistrictId) }];
        }
        if (dispatch.phase === STATUS.TO_PRISON) {
            vehicle.district = dispatch.prisonDistrictId; vehicle.status = STATUS.BUSY;
            this.removeRoute(dispatch.id); dispatch.phase = STATUS.BUSY; dispatch.phaseStartTime = now;
            return [{ type: "prisonReached", vehicle, seconds: dispatch.busySeconds }];
        }
        vehicle.status = STATUS.AVAILABLE; vehicle.incident = null; vehicle.prison = null;
        this.placeAtDistrict(vehicle, vehicle.district); this.removeRoute(`${dispatch.id}-return`); this.activeDispatches.delete(dispatch.id);
        return [{ type: "vehicleReturned", vehicle }, ...this.ensureCoverage()];
    }

    updateReposition(reposition, now) {
        const vehicle = vehicles.find(v => v.id === reposition.vehicleId);
        if (!vehicle) { this.activeRepositions.delete(reposition.id); return []; }
        const progress = Math.min(1, (now - reposition.phaseStartTime) / this.getDriveDuration(reposition.route));
        this.moveVehicle(vehicle, reposition.route, progress, reposition);
        if (progress < 1) return [];
        vehicle.district = reposition.targetDistrictId; vehicle.status = STATUS.AVAILABLE; this.placeAtDistrict(vehicle, vehicle.district);
        this.activeRepositions.delete(reposition.id); this.removeRoute(reposition.id);
        return [{ type: "repositionComplete", vehicle, district: getDistrictById(vehicle.district) }, ...this.ensureCoverage()];
    }

    ensureCoverage() {
        if (simulator.gameOver) return [];
        const events = [];
        for (const district of districts) {
            if (this.availableCount(district.id) > 0 || this.hasIncomingReposition(district.id)) continue;
            const donor = this.findDonor(district.id);
            if (!donor) { simulator.gameOver = true; events.push({ type: "missionFailed", message: `[FOUT] MISSION FAILED: ${district.name} heeft geen beschikbaar voertuig en geen veilig buurdistrict kan aanvullen.` }); continue; }
            events.push(this.startReposition(donor, district));
        }
        return events;
    }

    findDonor(targetId) {
        const target = getDistrictById(targetId);
        return target.neighbours.map(id => getDistrictById(id)).filter(Boolean)
            .filter(d => this.availableCount(d.id) > 1)
            .map(d => ({ district: d, route: getShortestRoute(d.id, targetId), count: this.availableCount(d.id) }))
            .filter(c => c.route.length)
            .sort((a,b) => b.count - a.count || getRouteDistance(a.route) - getRouteDistance(b.route) || a.district.id.localeCompare(b.district.id))[0] || null;
    }

    startReposition(donor, target) {
        const vehicle = vehicles.filter(v => v.district === donor.district.id && v.status === STATUS.AVAILABLE).sort((a,b) => a.id.localeCompare(b.id))[0];
        const id = `REP-${++this.repositionSequence}`;
        vehicle.status = STATUS.REPOSITIONING;
        const reposition = { id, vehicleId: vehicle.id, originDistrictId: donor.district.id, targetDistrictId: target.id, route: donor.route, phaseStartTime: performance.now(), fromX: vehicle.x, fromY: vehicle.y, toX: target.x, toY: target.y };
        this.activeRepositions.set(id, reposition); simulator.activeRoutes.push({ id, route: donor.route, type: "reposition" });
        return { type: "repositionStarted", vehicle, district: target };
    }

    getButtonState() { return { incident: this.step === STEPS.INCIDENT && !simulator.gameOver && vehicles.some(v => v.status === STATUS.AVAILABLE), prison: this.step === STEPS.PRISON && !simulator.gameOver, travelTime: this.step === STEPS.TRAVEL_TIME && !simulator.gameOver, dispatch: this.step === STEPS.DISPATCH && !simulator.gameOver, reset: true, currentStep: this.step, waitingForReturn: this.activeDispatches.size > 0 || this.activeRepositions.size > 0, gameOver: simulator.gameOver }; }

    reset() {
        Object.assign(simulator, { activeIncident: null, selectedPrison: null, travelTime: null, score: 0, incidentsHandled: 0, gameOver: false, activeRoute: [], activeRoutes: [], incidentHistory: [], lastScoreBreakdown: null });
        vehicles.forEach(vehicle => { vehicle.district = vehicle.homeDistrict; vehicle.status = STATUS.AVAILABLE; this.placeAtDistrict(vehicle, vehicle.homeDistrict); vehicle.targetX = vehicle.x; vehicle.targetY = vehicle.y; vehicle.incident = null; vehicle.prison = null; vehicle.angle = 0; });
        this.activeDispatches.clear(); this.activeRepositions.clear(); this.step = STEPS.INCIDENT;
        return this.result(true, "[RESET] Nieuwe oefening gestart.");
    }

    startPhase(dispatch, phase, now, route, toX, toY) { dispatch.phase = phase; dispatch.phaseStartTime = now; dispatch.fromX = vehicles.find(v => v.id === dispatch.vehicleId).x; dispatch.fromY = vehicles.find(v => v.id === dispatch.vehicleId).y; dispatch.toX = toX; dispatch.toY = toY; if (phase === STATUS.RETURNING) dispatch.returnRoute = route; }
    getPhaseRoute(d) { return d.phase === STATUS.TO_INCIDENT ? d.routeToIncident : d.phase === STATUS.TO_PRISON ? d.routeToPrison : d.returnRoute; }
    getDriveDuration(route) { return Math.max(900, getRouteDistance(route) * DRIVE_MS_PER_EDGE); }
    moveVehicle(vehicle, route, progress, ctx) { const pos = this.getRoutePosition(route, progress, ctx); const oldX = vehicle.x, oldY = vehicle.y; vehicle.x = pos?.x ?? this.lerp(ctx.fromX, ctx.toX, progress); vehicle.y = pos?.y ?? this.lerp(ctx.fromY, ctx.toY, progress); vehicle.targetX = ctx.toX; vehicle.targetY = ctx.toY; vehicle.angle = Math.atan2(vehicle.y - oldY, vehicle.x - oldX) * 180 / Math.PI; }
    getRoutePosition(route, progress, ctx) { if (!route || route.length < 2) return null; const points = route.map(getDistrictById).filter(Boolean).map(d => ({ x: d.x, y: d.y })); if (points.length < 2) return null; points[0] = { x: ctx.fromX, y: ctx.fromY }; points[points.length - 1] = { x: ctx.toX, y: ctx.toY }; const scaled = progress * (points.length - 1); const i = Math.min(Math.floor(scaled), points.length - 2); const p = scaled - i; return { x: this.lerp(points[i].x, points[i+1].x, p), y: this.lerp(points[i].y, points[i+1].y, p) }; }
    placeAtDistrict(vehicle, districtId) { const d = getDistrictById(districtId); if (!d) return; vehicle.x = d.x; vehicle.y = d.y; }
    removeRoute(id) { simulator.activeRoutes = (simulator.activeRoutes || []).filter(route => route.id !== id); }
    availableCount(id) { return vehicles.filter(v => v.district === id && v.status === STATUS.AVAILABLE).length; }
    hasIncomingReposition(id) { return [...this.activeRepositions.values()].some(r => r.targetDistrictId === id); }
    isVehicleReserved(id) { return [...this.activeDispatches.values()].some(d => d.vehicleId === id) || [...this.activeRepositions.values()].some(r => r.vehicleId === id); }
    calculateScoreBreakdown(travelTime = 120) { const base = 50; const timeBonus = Math.max(0, 130 - travelTime); const coverageBonus = vehicles.filter(v => v.status === STATUS.AVAILABLE).length; return { base, timeBonus, coverageBonus, total: base + timeBonus + coverageBonus }; }
    getRandomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
    lerp(start, end, progress) { return start + (end - start) * progress; }
    result(success, message, data = {}) { return { success, message, ...data }; }
    failAndResetCycle(message) { this.step = STEPS.INCIDENT; simulator.activeIncident = null; simulator.selectedPrison = null; simulator.travelTime = null; simulator.activeRoute = []; return this.result(false, `[FOUT] ${message} De invoercyclus is teruggezet.`); }
}

function getPrisonDistrictsSafe() {
    const prisons = districts.filter(d => d.prison);
    if (!prisons.length) throw new Error("Geen gevangenisdistricten geconfigureerd.");
    return prisons;
}
