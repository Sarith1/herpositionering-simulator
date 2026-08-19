import test from "node:test";
import assert from "node:assert/strict";
import { REAL_TIME_MULTIPLIER, SimulationClock, formatSimulationTime } from "../js/simulation-clock.js";

test("simulation clock advances sixty realistic seconds per elapsed second", () => {
    const clock = new SimulationClock(1_000);
    clock.update(11_000);
    assert.equal(REAL_TIME_MULTIPLIER, 60);
    assert.equal(clock.displayTime, "12:10:00");
    clock.update(61_000);
    assert.equal(clock.displayTime, "13:00:00");
});

test("simulation clock uses timestamps rather than update count", () => {
    const clock = new SimulationClock(0);
    clock.update(5_000);
    assert.equal(clock.displayTime, "12:05:00");
    clock.update(5_000);
    assert.equal(clock.displayTime, "12:05:00");
});

test("simulation clock resets and wraps across midnight", () => {
    const clock = new SimulationClock(0);
    clock.update(12 * 60 * 1_000);
    assert.equal(clock.displayTime, "00:00:00");
    clock.reset(800_000);
    assert.equal(clock.displayTime, "12:00:00");
    assert.equal(formatSimulationTime(25 * 60 * 60 * 1_000), "13:00:00");
});
