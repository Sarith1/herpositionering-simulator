import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Engine } from "../js/engine.js";
import { districts, sessionConfig, simulator, vehicles } from "../js/data.js";

const fleet = count => Object.fromEntries(districts.map(district => [district.id, count]));

test("reposition training schedules incidents but waits for the user's vehicle", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", vehiclesPerDistrict: fleet(3), autoplayMinDelaySeconds: 2, autoplayMaxDelaySeconds: 2, multiUnitIncidentPercentage: 0 });
    assert.equal(engine.getControlState().incident, false);
    assert.equal(engine.getControlState().autoplayToggle, true);
    assert.match(engine.toggleAutoplay().message, /Herpositioneringsmodus gestart/);
    const due = simulator.autoplayState.nextIncidentAt;
    const events = engine.update(due);
    assert.equal(simulator.incidents.length, 1);
    assert.equal(simulator.incidents[0].status, "OPEN");
    assert.equal(engine.activeDispatches.size, 0);
    assert.equal(simulator.vehicleSelection.incidentId, simulator.incidents[0].id);
    assert.equal(simulator.vehicleSelection.active, true);
    assert.ok(events.some(event => event.message?.includes("automatische melding")));
    assert.equal(simulator.autoplayState.nextIncidentAt, due + 2000);
    engine.toggleAutoplay();
    assert.equal(simulator.autoplayState.nextIncidentAt, null);
});

test("training dispatches the exact selected unit immediately", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", vehiclesPerDistrict: fleet(3) });
    const created = engine.createIncident({ autoplayGenerated: true, requiredUnits: 1 });
    const nearest = engine.availableVehiclesByDistance(created.incident)[0];
    const chosen = vehicles.find(vehicle => vehicle.status === "AVAILABLE" && vehicle.id !== nearest.id);
    const result = engine.selectVehicle(chosen.id);
    assert.equal(result.success, true);
    assert.equal(created.incident.status, "FULLY_ASSIGNED");
    assert.deepEqual(created.incident.assignedVehicleIds, [chosen.id]);
    assert.equal(engine.activeDispatches.size, 1);
    assert.equal(nearest.status, "AVAILABLE");
});

test("training multi-unit dispatch waits until the exact required count", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", vehiclesPerDistrict: fleet(3) });
    const incident = engine.createIncident({ autoplayGenerated: true, requiredUnits: 3 }).incident;
    const chosen = vehicles.filter(vehicle => vehicle.status === "AVAILABLE").slice(0, 3);
    assert.equal(engine.selectVehicle(chosen[0].id).message, "[SELECTIE] 1/3 voertuigen geselecteerd.");
    assert.equal(engine.selectVehicle(chosen[1].id).message, "[SELECTIE] 2/3 voertuigen geselecteerd.");
    assert.equal(engine.activeDispatches.size, 0);
    engine.selectVehicle(chosen[2].id);
    assert.equal(engine.activeDispatches.size, 3);
    assert.deepEqual(incident.assignedVehicleIds, chosen.map(vehicle => vehicle.id));
});

test("training never restores an available displaced vehicle home", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", vehiclesPerDistrict: fleet(3) });
    const vehicle = vehicles[0];
    vehicle.district = districts[1].id;
    vehicle.lastRepositionedAt = -Infinity;
    engine.ensureCoverage();
    engine.update(performance.now() + 10_000);
    assert.equal(vehicle.status, "AVAILABLE");
    assert.equal(vehicle.district, districts[1].id);
    assert.equal(engine.activeRepositions.size, 0);
});

test("reposition training warns but never automatically repositions", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", vehiclesPerDistrict: fleet(2) });
    vehicles.filter(vehicle => vehicle.district === districts[0].id).forEach(vehicle => { vehicle.status = "BUSY"; });
    const events = engine.ensureCoverage();
    assert.equal(engine.activeRepositions.size, 0);
    assert.ok(events.some(event => event.message?.includes("Herpositioneer handmatig met H")));
    assert.equal(simulator.gameOver, false);
});

test("keyboard shortcut guards input, repeats and intermediate selection phases", () => {
    const source = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
    assert.match(source, /event\.repeat/);
    assert.match(source, /tag === "input"/);
    assert.match(source, /event\.target\?\.isContentEditable/);
    assert.match(source, /phase !== "idle"/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /handleManualRepositionAction\(\)/);
    assert.equal(source.match(/addEventListener\?\.\("keydown"/g)?.length, 1);
});

test("button and target guidance expose H as the selection action", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");
    assert.match(html, /startRepositionBtn[^>]+aria-keyshortcuts="H"/);
    assert.match(ui, /klik op een gemarkeerd district om direct te herpositioneren/);
    assert.doesNotMatch(ui, /Herpositionering starten/);
    assert.match(ui, /primary\.innerHTML=.*<kbd>H<\/kbd>/);
});

test("current reset keeps reposition training configuration and stops its scheduler", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", autoplayMinDelaySeconds: 7, autoplayMaxDelaySeconds: 9 });
    engine.toggleAutoplay();
    engine.reset();
    assert.equal(sessionConfig.operationMode, "repositionTraining");
    assert.equal(sessionConfig.autoplayMinDelaySeconds, 7);
    assert.equal(sessionConfig.autoplayMaxDelaySeconds, 9);
    assert.deepEqual(simulator.autoplayState, { running: false, nextIncidentAt: null, nextDelaySeconds: null });
});
