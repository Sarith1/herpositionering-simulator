import test from "node:test";
import assert from "node:assert/strict";
import { districts, initializeVehicles, sessionConfig, setVehiclesPerDistrict, SPECIAL_VEHICLE_CALLSIGNS, VEHICLE_CALLSIGNS, vehicles } from "../js/data.js";
import { Engine } from "../js/engine.js";

test("every district uses its ordered operational pool and clamps configuration to that pool", () => {
  for (const district of districts) {
    const pool = VEHICLE_CALLSIGNS[district.id];
    setVehiclesPerDistrict(Object.fromEntries(districts.map(item => [item.id, item.id === district.id ? pool.length + 20 : 0])));
    assert.deepEqual(vehicles.map(vehicle => vehicle.id), pool);
    assert.equal(sessionConfig.vehiclesPerDistrict[district.id], pool.length);

    for (const count of [1, 2]) {
      setVehiclesPerDistrict(Object.fromEntries(districts.map(item => [item.id, item.id === district.id ? count : 0])));
      assert.deepEqual(vehicles.map(vehicle => vehicle.id), pool.slice(0, count));
    }
  }
});

test("callsigns are vehicle ids, home districts are immutable, and only pooled special vehicles exist", () => {
  setVehiclesPerDistrict(Object.fromEntries(districts.map(district => [district.id, VEHICLE_CALLSIGNS[district.id].length])));
  assert.ok(vehicles.every(vehicle => vehicle.id === vehicle.callsign));
  assert.deepEqual(vehicles.filter(vehicle => SPECIAL_VEHICLE_CALLSIGNS.has(vehicle.id)).map(vehicle => vehicle.id).sort(), ["RT3203", "RT4302", "RT7202"]);
  assert.equal(vehicles.some(vehicle => vehicle.id === "RT3102"), false);
  const vehicle = vehicles[0], home = vehicle.homeDistrict;
  assert.throws(() => { vehicle.homeDistrict = "RZ"; }, TypeError);
  assert.equal(vehicle.homeDistrict, home);
});

test("restore sends one safe displaced vehicle home and preserves hotzone coverage", () => {
  const engine = new Engine();
  engine.reset({ operationMode: "repositionTraining", hotzoneDistrictIds: ["RZ"], vehiclesPerDistrict: Object.fromEntries(districts.map(district => [district.id, district.id === "RZ" ? 1 : 2])) });
  const displaced = vehicles.find(vehicle => vehicle.homeDistrict === "RS");
  displaced.district = "RZ";
  let events = engine.evaluateHomeReturns(Infinity);
  assert.equal(events.length, 0, "hotzone must retain its calculated minimum");

  sessionConfig.hotzoneDistrictIds = [];
  events = engine.evaluateHomeReturns(Infinity);
  assert.equal(events.find(event => event.type === "restoreStarted")?.vehicle.id, displaced.id);
  assert.equal(engine.activeRepositions.size, 1, "only one restore is planned per evaluation");
  const restore = [...engine.activeRepositions.values()][0];
  assert.equal(restore.type, "restore");
  assert.equal(restore.targetDistrictId, displaced.homeDistrict);
  engine.updateReposition(restore, Infinity);
  assert.equal(displaced.district, displaced.homeDistrict);
  assert.equal(displaced.status, "AVAILABLE");
});

test.after(() => {
  sessionConfig.hotzoneDistrictIds = [];
  sessionConfig.vehiclesPerDistrict = Object.fromEntries(districts.map(district => [district.id, 3]));
  initializeVehicles();
});
