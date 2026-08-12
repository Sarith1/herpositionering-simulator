import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Engine } from "../js/engine.js";
import { districts, sessionConfig, simulator, vehicles } from "../js/data.js";

const fleet = count => Object.fromEntries(districts.map(district => [district.id, count]));

test("reposition training reuses autoplay scheduling and automatically dispatches", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "repositionTraining", vehiclesPerDistrict: fleet(3), autoplayMinDelaySeconds: 2, autoplayMaxDelaySeconds: 2, multiUnitIncidentPercentage: 0 });
    assert.equal(engine.getControlState().incident, false);
    assert.equal(engine.getControlState().autoplayToggle, true);
    assert.match(engine.toggleAutoplay().message, /Herpositioneringsmodus gestart/);
    const due = simulator.autoplayState.nextIncidentAt;
    const events = engine.update(due);
    assert.equal(simulator.incidents.length, 1);
    assert.notEqual(simulator.incidents[0].status, "OPEN");
    assert.ok(engine.activeDispatches.size > 0);
    assert.ok(events.some(event => event.message?.includes("automatische melding")));
    assert.equal(simulator.autoplayState.nextIncidentAt, due + 2000);
    engine.toggleAutoplay();
    assert.equal(simulator.autoplayState.nextIncidentAt, null);
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
    assert.match(source, /phase !== "idle" && phase !== "ready"/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /handleManualRepositionAction\(\)/);
    assert.equal(source.match(/addEventListener\?\.\("keydown"/g)?.length, 1);
});

test("button and ready-state guidance expose H as the shared reposition action", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const ui = readFileSync(new URL("../js/ui.js", import.meta.url), "utf8");
    assert.match(html, /startRepositionBtn[^>]+aria-keyshortcuts="H"/);
    assert.match(ui, /Klaar om te herpositioneren/);
    assert.match(ui, /<kbd>H<\/kbd> Start herpositionering/);
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
