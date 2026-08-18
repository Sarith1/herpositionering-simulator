import test from "node:test";
import assert from "node:assert/strict";
import { DISPATCH_DEPARTURE_DELAY_MS, Engine } from "../js/engine.js";
import { vehicles } from "../js/data.js";

test("a dispatched vehicle waits two seconds before it starts moving", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", multiUnitIncidentPercentage: 0 });
  const incident = engine.createIncident({ requiredUnits: 1 }).incident;
  engine.selectPrison();
  engine.calculateTravelTime();
  engine.dispatchVehicle();

  const dispatch = [...engine.activeDispatches.values()].find(item => item.incidentId === incident.id);
  const vehicle = vehicles.find(item => item.id === dispatch.vehicleId);
  const start = { x: vehicle.x, y: vehicle.y };

  assert.equal(dispatch.departureAt, dispatch.phaseStartTime + DISPATCH_DEPARTURE_DELAY_MS);
  engine.updateDispatch(dispatch, dispatch.departureAt - 1);
  assert.deepEqual({ x: vehicle.x, y: vehicle.y }, start);
  engine.updateDispatch(dispatch, dispatch.departureAt);
  assert.deepEqual({ x: vehicle.x, y: vehicle.y }, start);

  engine.updateDispatch(dispatch, dispatch.departureAt + 100);
  assert.notDeepEqual({ x: vehicle.x, y: vehicle.y }, start);
});
