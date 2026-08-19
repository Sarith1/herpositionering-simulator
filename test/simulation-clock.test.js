import test from "node:test";
import assert from "node:assert/strict";
import { REAL_TIME_MULTIPLIER, SimulationClock, formatSimulationTime } from "../js/simulation-clock.js";
import { Engine } from "../js/engine.js";

test("simulation clock advances sixty realistic seconds per elapsed second", () => {
    const clock = new SimulationClock();
    assert.equal(clock.displayTime, "12:00:00");
    clock.start(1_000);
    clock.update(11_000);
    assert.equal(REAL_TIME_MULTIPLIER, 60);
    assert.equal(clock.displayTime, "12:10:00");
    clock.update(61_000);
    assert.equal(clock.displayTime, "13:00:00");
});

test("simulation clock uses timestamps rather than update count", () => {
    const clock = new SimulationClock();
    clock.start(0);
    clock.update(5_000);
    assert.equal(clock.displayTime, "12:05:00");
    clock.update(5_000);
    assert.equal(clock.displayTime, "12:05:00");
});

test("simulation clock resets and wraps across midnight", () => {
    const clock = new SimulationClock();
    clock.start(0);
    clock.update(12 * 60 * 1_000);
    assert.equal(clock.displayTime, "00:00:00");
    clock.reset();
    assert.equal(clock.displayTime, "12:00:00");
    assert.equal(formatSimulationTime(25 * 60 * 60 * 1_000), "13:00:00");
});

test("simulation clock waits for start and resumes without resetting", () => {
    const clock = new SimulationClock();
    clock.update(10_000);
    assert.deepEqual({started:clock.started,running:clock.running,elapsedRealMs:clock.elapsedRealMs,lastStartedAt:clock.lastStartedAt}, {started:false,running:false,elapsedRealMs:0,lastStartedAt:null});
    clock.start(10_000);
    clock.update(15_000);
    clock.pause(15_000);
    clock.update(20_000);
    assert.equal(clock.displayTime, "12:05:00");
    clock.start(20_000);
    clock.update(25_000);
    assert.equal(clock.displayTime, "12:10:00");
});

test("operational actions centrally start the engine clock", () => {
    const engine = new Engine();
    engine.reset({operationMode:"automatic"});
    engine.update(10_000);
    assert.equal(engine.simulationClock.started, false);
    assert.equal(engine.createIncident({type:"detention",requiredUnits:1}).success, true);
    assert.equal(engine.simulationClock.started, true);

    engine.reset({operationMode:"autoplay"});
    engine.update(20_000);
    assert.equal(engine.simulationClock.started, false);
    assert.equal(engine.toggleAutoplay().success, true);
    assert.equal(engine.simulationClock.started, true);
    engine.toggleAutoplay();
    assert.equal(engine.simulationClock.running, true, "autoplay pause only stops new incidents, not active simulation work");
});

test("non-operational reposition selection does not start the clock", () => {
    const engine = new Engine();
    engine.reset({operationMode:"repositionTraining"});
    assert.equal(engine.startManualReposition().success, true);
    assert.equal(engine.simulationClock.started, false);
    engine.reset();
    assert.equal(engine.simulationClock.displayTime, "12:00:00");
    assert.equal(engine.simulationClock.started, false);
});
