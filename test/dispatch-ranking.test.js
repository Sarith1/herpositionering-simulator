import test from "node:test";
import assert from "node:assert/strict";
import { districts, sessionConfig, vehicles } from "../js/data.js";
import { DISPATCH_DISTANCE_TIE_MARGIN, Engine } from "../js/engine.js";

const fleet = count => Object.fromEntries(districts.map(district => [district.id, count]));

function rankingEngine() {
  const engine = new Engine();
  engine.reset({ restoreDefaults: true, operationMode: "automatic", vehiclesPerDistrict: fleet(3) });
  vehicles.forEach(vehicle => { vehicle.status = "BUSY"; vehicle.incident = null; });
  return engine;
}

function makeAvailable(vehicle, x, y, district = vehicle.district) {
  Object.assign(vehicle, { status: "AVAILABLE", x, y, district, incident: null });
  return vehicle;
}

test("dispatch ranking uses current coordinates and lets clear proximity override special and hotzone preferences", () => {
  const engine = rankingEngine();
  sessionConfig.hotzoneDistrictIds = ["RN"];
  const special = vehicles.find(vehicle => vehicle.id === "RT1101");
  const normal = vehicles.find(vehicle => vehicle.id !== special.id);
  makeAvailable(special, 101, 100, "RN");
  makeAvailable(normal, 500, 500);

  const ranked = engine.rankAvailableVehiclesForIncident({ x: 100, y: 100, assignedVehicleIds: [] });
  assert.equal(ranked[0].vehicle.id, special.id);
  assert.equal(ranked[0].distance, 1);
  assert.equal(ranked[0].isSpecial, true);
  assert.equal(ranked[0].isHotzoneVehicle, true);
});

test("a normal vehicle may win only inside the dispatch distance tie margin", () => {
  const engine = rankingEngine();
  const special = vehicles.find(vehicle => vehicle.id === "RT1101");
  const normal = vehicles.find(vehicle => vehicle.id !== special.id);
  makeAvailable(special, 5, 0);
  makeAvailable(normal, 5.1, 0);
  const incident = { x: 0, y: 0, assignedVehicleIds: [] };

  assert.equal(DISPATCH_DISTANCE_TIE_MARGIN, 0.10);
  assert.equal(engine.rankAvailableVehiclesForIncident(incident)[0].vehicle.id, normal.id);
  normal.x = 16;
  special.x = 10;
  assert.equal(engine.rankAvailableVehiclesForIncident(incident)[0].vehicle.id, special.id);
});

test("multi-unit automatic dispatch selects exactly the three nearest available vehicles", () => {
  const engine = rankingEngine();
  const candidates = vehicles.filter(vehicle => vehicle.id !== "RT1101").slice(0, 4);
  [1.2, 1.6, 2.4, 7.2].forEach((distance, index) => makeAvailable(candidates[index], 100 + distance, 100));
  const incident = engine.createIncident({ type: "onscene", requiredUnits: 3 }).incident;
  Object.assign(incident, { x: 100, y: 100 });

  const result = engine.assignIncident(incident);
  assert.equal(result.success, true);
  assert.deepEqual(incident.assignedVehicleIds, candidates.slice(0, 3).map(vehicle => vehicle.id));
  assert.equal(candidates[3].status, "AVAILABLE");
});

test("a repositioned vehicle is ranked from its physical position rather than its home district", () => {
  const engine = rankingEngine();
  const repositioned = vehicles.find(vehicle => vehicle.homeDistrict === "RN");
  const other = vehicles.find(vehicle => vehicle.id !== repositioned.id);
  makeAvailable(repositioned, 201, 200, "RZ");
  makeAvailable(other, 300, 300);

  const ranked = engine.rankAvailableVehiclesForIncident({ x: 200, y: 200, assignedVehicleIds: [] });
  assert.equal(ranked[0].vehicle.id, repositioned.id);
  assert.equal(repositioned.homeDistrict, "RN");
  assert.equal(repositioned.district, "RZ");
});
