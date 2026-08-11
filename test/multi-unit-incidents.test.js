import test from "node:test";
import assert from "node:assert/strict";
import { Engine, determineRequiredUnits } from "../js/engine.js";
import { sessionConfig, simulator, vehicles } from "../js/data.js";

function setup(mode="automatic", percentage=0) {
  const engine=new Engine();
  engine.reset({restoreDefaults:true, operationMode:mode, multiUnitIncidentPercentage:percentage,
    vehiclesPerDistrict:Object.fromEntries(["RN","ZH","RS","RO","RZW","RZ","ZHZ"].map(id=>[id,5]))});
  return engine;
}
function prepareCycle(engine, requiredUnits) {
  const incident=engine.createIncident({requiredUnits}).incident;
  engine.selectPrison();engine.calculateTravelTime();return incident;
}

test("configured percentage controls required units",()=>{
  sessionConfig.multiUnitIncidentPercentage=0;
  for(let i=0;i<100;i++) assert.equal(determineRequiredUnits(()=>0),1);
  sessionConfig.multiUnitIncidentPercentage=100;
  assert.equal(determineRequiredUnits((()=>{const values=[0,.79];return()=>values.shift();})()),2);
  assert.equal(determineRequiredUnits((()=>{const values=[0,.81];return()=>values.shift();})()),3);
});

test("automatic dispatch assigns every required vehicle exactly once",()=>{
  const engine=setup();const incident=prepareCycle(engine,3);const result=engine.dispatchVehicle();
  assert.equal(result.success,true);assert.equal(incident.status,"FULLY_ASSIGNED");assert.equal(incident.assignedVehicleIds.length,3);
  assert.equal(new Set(incident.assignedVehicleIds).size,3);assert.equal([...engine.activeDispatches.values()].filter(d=>d.incidentId===incident.id).length,3);
});

test("partial incidents are completed when capacity becomes available",()=>{
  const engine=setup();const incident=prepareCycle(engine,3);
  vehicles.slice(2).forEach(v=>v.status="BUSY");engine.dispatchVehicle();assert.equal(incident.status,"PARTIALLY_ASSIGNED");assert.equal(incident.assignedVehicleIds.length,2);
  vehicles[2].status="AVAILABLE";engine.update(performance.now());assert.equal(incident.status,"FULLY_ASSIGNED");assert.equal(incident.assignedVehicleIds.length,3);
});

test("manual dispatch permits a confirmed partial multi-selection",()=>{
  const engine=setup("manualVehicle");const incident=prepareCycle(engine,2);const available=vehicles.filter(v=>v.status==="AVAILABLE");
  engine.selectVehicle(available[0].id);assert.equal(engine.getControlState().confirmVehicle,true);
  engine.selectVehicle(available[1].id);assert.equal(engine.getControlState().confirmVehicle,true);
  engine.confirmManualDispatch();assert.deepEqual(incident.assignedVehicleIds,[available[0].id,available[1].id]);
});

test("twenty mixed automatic cycles never dispatch before step four and reset immediately",()=>{
  const engine=setup("automatic");
  for(let cycle=0;cycle<20;cycle++){
   const requiredUnits=cycle%3+1,before=vehicles.map(({id,x,y,status})=>({id,x,y,status}));
   const incident=engine.createIncident({requiredUnits}).incident;
   assert.deepEqual(vehicles.map(({id,x,y,status})=>({id,x,y,status})),before,`creation moved a vehicle in cycle ${cycle+1}`);
   assert.equal(engine.getControlState().prison,true);engine.selectPrison();
   assert.deepEqual(vehicles.map(({id,x,y,status})=>({id,x,y,status})),before,`prison selection moved a vehicle in cycle ${cycle+1}`);
   assert.equal(engine.getControlState().travelTime,true);engine.calculateTravelTime();
   assert.deepEqual(vehicles.map(({id,x,y,status})=>({id,x,y,status})),before,`travel calculation moved a vehicle in cycle ${cycle+1}`);
   assert.equal(engine.getControlState().dispatch,true);assert.equal(engine.dispatchVehicle().success,true);
   assert.equal(incident.assignedVehicleIds.length,requiredUnits);assert.equal(simulator.inputCycleState.step,"INCIDENT");assert.equal(engine.getControlState().incident,true);
   vehicles.forEach(vehicle=>{vehicle.status="AVAILABLE";vehicle.incident=null;vehicle.prison=null;});
  }
});

test("interactive OPEN incident is not consumed by background assignment",()=>{
 const engine=setup("automatic");const incident=engine.createIncident({requiredUnits:3}).incident;
 engine.update(performance.now());assert.equal(incident.status,"OPEN");assert.deepEqual(incident.assignedVehicleIds,[]);assert.equal(simulator.inputCycleState.incidentId,incident.id);assert.equal(simulator.inputCycleState.step,"PRISON");
});

test("incident clears only after all arrivals and only one unit transports",()=>{
  const engine=setup();const incident=prepareCycle(engine,3);engine.dispatchVehicle();const dispatches=[...engine.activeDispatches.values()].filter(d=>d.incidentId===incident.id);
  engine.updateDispatch(dispatches[0],Infinity);engine.updateDispatch(dispatches[1],Infinity);assert.notEqual(incident.status,"HANDLED");
  engine.updateDispatch(dispatches[2],Infinity);assert.equal(incident.status,"HANDLED");
  assert.equal(dispatches.filter(d=>d.phase==="TO_PRISON").length,1);assert.equal(dispatches.filter(d=>d.phase==="RETURNING").length,2);
  assert.equal(simulator.incidentsHandled,1);
});
