import test from "node:test";
import assert from "node:assert/strict";
import { DISPATCH_DEPARTURE_DELAY_MS, Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = values => Object.fromEntries(districts.map((district,index)=>[district.id,values[index]??values[0]]));

function dispatchedEngine(requiredUnits=1){
  const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:fleet([3]),multiUnitIncidentPercentage:0,onSceneIncidentPercentage:0});
  const incident=engine.createIncident({requiredUnits,type:"detention"}).incident;engine.prepareIncident(incident);engine.assignIncident(incident);
  return {engine,incident,dispatches:[...engine.activeDispatches.values()].filter(dispatch=>dispatch.incidentId===incident.id)};
}

test("a reserved dispatch remains stationary for two seconds",()=>{
  const {engine,dispatches:[dispatch]}=dispatchedEngine();const vehicle=vehicles.find(item=>item.id===dispatch.vehicleId),start={x:vehicle.x,y:vehicle.y};
  assert.equal(dispatch.departureAt-dispatch.phaseStartTime,0);
  assert.ok(dispatch.departureAt-performance.now()<=DISPATCH_DEPARTURE_DELAY_MS);
  engine.updateDispatch(dispatch,dispatch.departureAt-1);
  assert.deepEqual({x:vehicle.x,y:vehicle.y},start);assert.equal(vehicle.status,"TO_INCIDENT");
  engine.updateDispatch(dispatch,dispatch.departureAt+1000);
  assert.notDeepEqual({x:vehicle.x,y:vehicle.y},start);
});

test("coverage evaluation is scheduled only after the last unit arrives",()=>{
  const {engine,incident,dispatches}=dispatchedEngine(2);
  engine.updateDispatch(dispatches[0],dispatches[0].departureAt+100000);
  assert.equal(incident.coverageEvaluationAt,undefined);
  const arrival=dispatches[1].departureAt+100000;engine.updateDispatch(dispatches[1],arrival);
  assert.ok(incident.coverageEvaluationAt>=arrival+2000&&incident.coverageEvaluationAt<=arrival+3000);
  assert.deepEqual(engine.evaluateScheduledCoverage(incident.coverageEvaluationAt-1),[]);
  assert.ok(engine.evaluateScheduledCoverage(incident.coverageEvaluationAt).some(event=>event.message?.includes("Reactietijd")));
});

test("cascade reposition movements run one at a time in target-first order",()=>{
  const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:fleet([3,1,1,1,1,1,0])});
  const events=engine.ensureCoverage(),first=events.find(event=>event.type==="repositionStarted");
  assert.equal(engine.activeRepositions.size,1);assert.equal(first.district.id,"ZHZ");assert.equal(engine.repositionQueue.length,2);
  let active=[...engine.activeRepositions.values()][0];engine.updateReposition(active,active.phaseStartTime+100000);
  const next=engine.startNextQueuedReposition(active.phaseStartTime+100001);
  assert.equal(engine.activeRepositions.size,1);assert.equal(next.filter(event=>event.type==="repositionStarted").length,1);
});

test("coverage failure timer does not run during arrival reaction time",()=>{
  const {engine,incident,dispatches:[dispatch]}=dispatchedEngine();
  const arrival=dispatch.departureAt+100000;engine.updateDispatch(dispatch,arrival);
  engine.coverageLossStartedAt.set(dispatch.originDistrictId,arrival-10000);
  assert.deepEqual(engine.evaluateCoverageFailure(incident.coverageEvaluationAt-1),[]);
  assert.equal(simulator.gameOver,false);
});
