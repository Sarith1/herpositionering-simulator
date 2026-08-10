import test from "node:test";
import assert from "node:assert/strict";
import { Engine, dedupePathPoints } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";
import { getShortestRoute } from "../js/routing.js";

const context = { fromX: 100, fromY: 100, toX: 150, toY: 150 };

test("move interpolates an empty route directly from start to destination", () => {
  const engine = new Engine(), vehicle = { x: 100, y: 100, angle: 0 };
  assert.doesNotThrow(() => engine.move(vehicle, [], 0.5, context));
  assert.ok(Math.abs(vehicle.x - 125) < 1e-9);
  assert.ok(Math.abs(vehicle.y - 125) < 1e-9);
});

test("move treats a one-node same-district route as a direct movement", () => {
  const engine = new Engine(), vehicle = { x: 100, y: 100, angle: 0 };
  assert.deepEqual(getShortestRoute("RS", "RS"), ["RS"]);
  assert.doesNotThrow(() => engine.move(vehicle, ["RS"], 0.5, context));
  assert.deepEqual({ x: vehicle.x, y: vehicle.y }, { x: 125, y: 125 });
});

test("move follows intermediate district coordinates on longer routes", () => {
  const engine = new Engine(), route = getShortestRoute("RN", "RZW"), vehicle = { x: 10, y: 20, angle: 0 };
  assert.ok(route.length > 2);
  const intermediate = districts.find(district => district.id === route[1]);
  engine.move(vehicle, route, 1 / (route.length - 1), { fromX: 10, fromY: 20, toX: 900, toY: 600 });
  assert.ok(Math.abs(vehicle.x - intermediate.x) < 1e-9);
  assert.ok(Math.abs(vehicle.y - intermediate.y) < 1e-9);
});

test("identical endpoints and invalid movement inputs never throw", () => {
  const engine = new Engine(), vehicle = { x: 100, y: 100, angle: 37 };
  assert.deepEqual(dedupePathPoints([{ x: 1, y: 1 }, { x: 1 + 1e-7, y: 1 }]), [{ x: 1, y: 1 }]);
  assert.doesNotThrow(() => engine.move(vehicle, undefined, 0.8, { fromX: 100, fromY: 100, toX: 100, toY: 100 }));
  assert.deepEqual(vehicle, { x: 100, y: 100, angle: 37 });
  assert.doesNotThrow(() => engine.move(undefined, [], 0.5, context));
});

test("a corrupt dispatch is cancelled without stopping other dispatch updates", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic", vehiclesPerDistrict: Object.fromEntries(districts.map(d => [d.id, 2])) });
  const badVehicle = vehicles[0], goodVehicle = vehicles[1];
  const bad = { id: "bad", vehicleId: badVehicle.id, incidentId: "missing", originDistrictId: badVehicle.district };
  const good = { id: "good", vehicleId: goodVehicle.id };
  engine.activeDispatches.set(bad.id, bad); engine.activeDispatches.set(good.id, good);
  const updated = [];
  engine.updateDispatch = dispatch => { if (dispatch === bad) throw new Error("corrupt test dispatch"); updated.push(dispatch.id); return []; };
  const originalError = console.error; console.error = () => {};
  try { assert.doesNotThrow(() => engine.update(1000)); } finally { console.error = originalError; }
  assert.deepEqual(updated, ["good"]);
  assert.equal(engine.activeDispatches.has("bad"), false);
  assert.equal(engine.activeDispatches.has("good"), true);
  assert.equal(badVehicle.status, "AVAILABLE");
});
