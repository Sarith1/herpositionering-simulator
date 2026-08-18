import test from "node:test";
import assert from "node:assert/strict";
import { Engine, getRepositionDelayMs } from "../js/engine.js";
import { simulator } from "../js/data.js";

test("reposition delay is always between two and three seconds", () => {
  assert.equal(getRepositionDelayMs(() => 0), 2000);
  assert.equal(getRepositionDelayMs(() => 0.999999), 3000);
});

test("coverage is evaluated only after the dispatched vehicle reaches the incident and the delay expires", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", multiUnitIncidentPercentage: 0 });
  const incident = engine.createIncident({ requiredUnits: 1 }).incident;
  engine.selectPrison();
  engine.calculateTravelTime();
  const dispatchResult = engine.dispatchVehicle();
  assert.equal(dispatchResult.events.some(event => event.type === "repositionStarted"), false);
  assert.equal(engine.pendingCoverageChecks.size, 0);

  const dispatch = [...engine.activeDispatches.values()].find(item => item.incidentId === incident.id);
  const arrivalTime = dispatch.phaseStartTime + 100000;
  engine.updateDispatch(dispatch, arrivalTime);
  const dueAt = engine.pendingCoverageChecks.get(incident.id);
  assert.ok(dueAt >= arrivalTime + 2000 && dueAt <= arrivalTime + 3000);

  let evaluations = 0;
  engine.ensureCoverage = () => { evaluations++; return []; };
  engine.runPendingCoverageChecks(dueAt - 1);
  assert.equal(evaluations, 0);
  engine.runPendingCoverageChecks(dueAt);
  assert.equal(evaluations, 1);
  assert.equal(engine.pendingCoverageChecks.size, 0);
  assert.equal(simulator.incidents.includes(incident), true);
});
