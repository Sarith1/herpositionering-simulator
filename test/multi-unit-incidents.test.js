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

test("manual dispatch requires an exact multi-selection",()=>{
  const engine=setup("manualVehicle");const incident=prepareCycle(engine,2);const available=vehicles.filter(v=>v.status==="AVAILABLE");
  engine.selectVehicle(available[0].id);assert.equal(engine.getControlState().confirmVehicle,false);
  engine.selectVehicle(available[1].id);assert.equal(engine.getControlState().confirmVehicle,true);
  engine.confirmManualDispatch();assert.deepEqual(incident.assignedVehicleIds,[available[0].id,available[1].id]);
});

test("incident clears only after all arrivals and only one unit transports",()=>{
  const engine=setup();const incident=prepareCycle(engine,3);engine.dispatchVehicle();const dispatches=[...engine.activeDispatches.values()].filter(d=>d.incidentId===incident.id);
  engine.updateDispatch(dispatches[0],Infinity);engine.updateDispatch(dispatches[1],Infinity);assert.notEqual(incident.status,"HANDLED");
  engine.updateDispatch(dispatches[2],Infinity);assert.equal(incident.status,"HANDLED");
  assert.equal(dispatches.filter(d=>d.phase==="TO_PRISON").length,1);assert.equal(dispatches.filter(d=>d.phase==="RETURNING").length,2);
  assert.equal(simulator.incidentsHandled,1);
});
