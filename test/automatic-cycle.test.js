import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = count => Object.fromEntries(districts.map(district => [district.id, count]));
const advanceMission = (engine, dispatch) => {
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + 100000);
  assert.equal(dispatch.phase, "TO_PRISON");
  assert.equal(simulator.incidents.find(i => i.id === dispatch.incidentId)?.status, "HANDLED");
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + 100000);
  assert.equal(dispatch.phase, "BUSY");
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + dispatch.busySeconds * 1000 + 1);
  assert.equal(dispatch.phase, "RETURNING");
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + 100000);
};

test("twenty automatic input cycles dispatch their exact incident and complete independently", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic", vehiclesPerDistrict: fleet(5) });
  for (let cycle = 0; cycle < 20; cycle++) {
    assert.equal(engine.createIncident().success, true); const incidentId = simulator.inputCycleState.incidentId;
    assert.equal(engine.selectPrison().success, true); assert.equal(engine.calculateTravelTime().success, true);
    const result = engine.dispatchVehicle(); assert.equal(result.success, true, `cycle ${cycle + 1}`);
    const incident = simulator.incidents.find(item => item.id === incidentId);
    assert.equal(incident.status, "ASSIGNED"); assert.equal(incident.vehicleId, result.vehicle.id);
    const dispatch = [...engine.activeDispatches.values()].find(item => item.incidentId === incidentId); assert.ok(dispatch);
    assert.equal(simulator.inputCycleState.step, "incident");
    advanceMission(engine, dispatch); assert.equal(result.vehicle.status, "AVAILABLE");
  }
  assert.equal(simulator.incidentHistory.length, 20);
});

test("automatic dispatch never falls back to another OPEN incident", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic" });
  engine.createIncident(); const staleId = simulator.inputCycleState.incidentId;
  simulator.incidents.push({ ...simulator.incidents[0], id: "INC-OTHER", status: "OPEN" });
  engine.selectPrison(); engine.calculateTravelTime(); simulator.incidents.find(i => i.id === staleId).status = "HANDLED";
  const result = engine.dispatchVehicle(); assert.equal(result.success, false);
  assert.equal(simulator.incidents.find(i => i.id === "INC-OTHER").status, "OPEN");
  assert.equal(simulator.inputCycleState.step, "incident");
});
