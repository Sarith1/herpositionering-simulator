import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, simulator } from "../js/data.js";

test("five simultaneous dispatches retain unique phase routes and input-cycle isolation", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic", multiUnitIncidentPercentage: 0, vehiclesPerDistrict: Object.fromEntries(districts.map(d => [d.id, 5])) });
  const ids=[];
  for(let i=0;i<5;i++) { engine.createIncident(); ids.push(simulator.inputCycleState.incidentId); engine.selectPrison(); engine.calculateTravelTime(); assert.equal(engine.dispatchVehicle().success,true); }
  assert.equal(engine.activeDispatches.size,5); assert.equal(new Set([...engine.activeDispatches.keys()]).size,5);
  assert.equal(simulator.activeRoutes.filter(route=>route.id.endsWith("-to-incident")).length,5);
  const cycleSnapshot={...simulator.inputCycleState}; engine.ensureCoverage(); assert.deepEqual(simulator.inputCycleState,cycleSnapshot);
  const first=[...engine.activeDispatches.values()][0]; engine.updateDispatch(first,first.phaseStartTime+100000);
  assert.ok(simulator.activeRoutes.some(route=>route.id===`${first.id}-to-prison`));
  assert.equal(simulator.activeRoutes.filter(route=>route.id.endsWith("-to-incident")).length,4);
  assert.equal(ids.slice(1).every(id=>simulator.incidents.find(item=>item.id===id)?.status==="FULLY_ASSIGNED"),true);
});
