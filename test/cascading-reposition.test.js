import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, vehicles } from "../js/data.js";
import { getAdjacentDistrictIds } from "../js/routing.js";

const fleet = values => Object.fromEntries(districts.map((district, index) => [district.id, values[index]]));

test("automatic reposition uses one vehicle per adjacent link in a cascade", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", vehiclesPerDistrict: fleet([3, 1, 1, 1, 1, 1, 0]) });
  const events = engine.ensureCoverage();
  const moves = events.filter(event => event.type === "repositionStarted");
  assert.equal(moves.length, 3);
  assert.equal(moves.at(0).district.id, "ZHZ");
  for (const move of moves) assert.ok(getAdjacentDistrictIds(move.origin.id).includes(move.district.id));
  assert.equal(new Set(moves.map(move => move.vehicle.id)).size, 3);
  assert.equal(engine.activeRepositionPlans.size, 1);
});

test("a direct neighbour is preferred and normal callsigns precede special vehicles", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", vehiclesPerDistrict: fleet([3, 1, 1, 1, 1, 1, 0]) });
  const normal = vehicles.find(vehicle => vehicle.district === "RN" && vehicle.id !== "RT1101");
  const plan = engine.buildRepositionPlan("RS");
  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].fromDistrictId, "RN");
  assert.equal(plan.moves[0].vehicleId, normal.id);
});

test("an unsafe cascade is rejected atomically", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", vehiclesPerDistrict: fleet([1, 1, 1, 1, 1, 1, 0]) });
  assert.equal(engine.buildRepositionPlan("ZHZ"), null);
  assert.equal(engine.activeRepositions.size, 0);
});

test("every link in a three-step cascade is adjacent and starts atomically", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", vehiclesPerDistrict: fleet([3, 1, 1, 1, 1, 1, 0]) });
  const plan = engine.buildRepositionPlan("ZHZ");

  assert.equal(plan.type, "cascade");
  assert.equal(plan.moves.length, 3);
  assert.equal(plan.moves[0].toDistrictId, "ZHZ");
  for (let index = 1; index < plan.moves.length; index++) {
    assert.equal(plan.moves[index].toDistrictId, plan.moves[index - 1].fromDistrictId);
  }
  for (const move of plan.moves) assert.ok(getAdjacentDistrictIds(move.fromDistrictId).includes(move.toDistrictId));

  const events = engine.startRepositionPlan(plan);
  assert.equal(events.filter(event => event.type === "repositionStarted").length, 3);
  assert.ok(plan.moves.every(move => vehicles.find(vehicle => vehicle.id === move.vehicleId).status === "REPOSITIONING"));
});

test("a stale or non-adjacent plan cannot start partially", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", vehiclesPerDistrict: fleet([3, 1, 1, 1, 1, 1, 0]) });
  const plan = engine.buildRepositionPlan("ZHZ");
  plan.moves.at(-1).toDistrictId = "ZHZ";

  assert.deepEqual(engine.startRepositionPlan(plan), []);
  assert.equal(engine.activeRepositions.size, 0);
  assert.ok(plan.moves.every(move => vehicles.find(vehicle => vehicle.id === move.vehicleId).status === "AVAILABLE"));
});
