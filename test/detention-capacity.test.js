import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { detentionComplexes, getTotalDetentionCapacity, getTotalDetentionOccupancy, sessionConfig, simulator } from "../js/data.js";

const capacities = values => Object.fromEntries(detentionComplexes.map((complex,index)=>[complex.id,values[index] ?? 0]));

function configuredEngine(capacity=capacities([10,10,10]), available=detentionComplexes.map(({id})=>id), mode="automatic") {
  const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:mode,availablePrisons:available,detentionCapacity:capacity,multiUnitIncidentPercentage:0});return engine;
}

test("effective travel time is normal below capacity and doubled when full",()=>{
  const engine=configuredEngine(capacities([10,0,0]),[detentionComplexes[0].id]);
  const incident={};simulator.detentionOccupancy[detentionComplexes[0].id]=9;
  engine.setEffectiveTravelTime(incident,["RS",detentionComplexes[0].id]);
  assert.equal(incident.travelTime,incident.baseTravelTime);assert.equal(incident.capacityExceeded,false);
  simulator.detentionOccupancy[detentionComplexes[0].id]=10;
  engine.setEffectiveTravelTime(incident,["RS",detentionComplexes[0].id]);
  assert.equal(incident.travelTime,incident.baseTravelTime*2);assert.equal(incident.capacityExceeded,true);
});

test("only available complexes contribute capacity and zero capacity doubles every trip",()=>{
  const engine=configuredEngine(capacities([8,6,10]),[detentionComplexes[0].id,detentionComplexes[2].id]);
  assert.equal(getTotalDetentionCapacity(),18);
  sessionConfig.availablePrisons=[detentionComplexes[1].id];sessionConfig.detentionCapacity[detentionComplexes[1].id]=0;
  const incident={};engine.setEffectiveTravelTime(incident,["ZHZ",detentionComplexes[1].id]);
  assert.equal(incident.travelTime,incident.baseTravelTime*2);
});

test("one multi-unit transport claims one place through BUSY and releases it before returning",()=>{
  const engine=configuredEngine();
  const incident=engine.createIncident({requiredUnits:3}).incident;engine.selectPrison();engine.calculateTravelTime();engine.dispatchVehicle();
  const dispatches=[...engine.activeDispatches.values()];dispatches.forEach(dispatch=>engine.updateDispatch(dispatch,Infinity));
  const transport=dispatches.find(dispatch=>dispatch.phase==="TO_PRISON");assert.ok(transport);assert.equal(dispatches.filter(dispatch=>dispatch.phase==="TO_PRISON").length,1);
  engine.updateDispatch(transport,Infinity);assert.equal(transport.phase,"BUSY");assert.equal(getTotalDetentionOccupancy(),1);
  const events=engine.updateDispatch(transport,Infinity);assert.equal(transport.phase,"RETURNING");assert.equal(getTotalDetentionOccupancy(),0);assert.equal(events[0].type,"prisonReleased");
});

test("current-session reset clears occupancy while retaining configured capacity",()=>{
  const configured=capacities([8,6,10]),engine=configuredEngine(configured);simulator.detentionOccupancy[detentionComplexes[0].id]=3;
  engine.reset();assert.equal(getTotalDetentionOccupancy(),0);assert.deepEqual(sessionConfig.detentionCapacity,configured);
});
