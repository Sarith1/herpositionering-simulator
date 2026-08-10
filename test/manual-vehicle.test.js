import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { sessionConfig, simulator, vehicles } from "../js/data.js";

function preparedEngine(mode="manualVehicle") {
  const engine=new Engine();engine.reset({operationMode:mode});
  assert.equal(engine.createIncident().success,true);
  assert.equal(engine.selectPrison().success,true);
  assert.equal(engine.calculateTravelTime().success,true);
  return engine;
}

test("manual mode waits, permits changing selection, and dispatches the exact non-nearest vehicle",()=>{
  const engine=preparedEngine();const incident=simulator.activeIncident;
  const nearestDistrict=incident.district;
  const distant=vehicles.find(v=>v.district!==nearestDistrict);
  const nearest=vehicles.find(v=>v.district===nearestDistrict);
  assert.equal(engine.startVehicleSelection().success,true);
  assert.equal(vehicles.every(v=>v.status==="AVAILABLE"),true,"no vehicle leaves on Pak melding op");
  engine.selectVehicle(nearest.id);engine.selectVehicle(distant.id);
  assert.equal(simulator.vehicleSelection.selectedVehicleId,distant.id);
  const result=engine.confirmManualDispatch();
  assert.equal(result.success,true);assert.equal(distant.status,"TO_INCIDENT");assert.equal(incident.vehicleId,distant.id);
  assert.equal(nearest.status,"AVAILABLE");assert.equal(simulator.vehicleSelection.active,false);
});

test("invalid vehicles cannot be selected and cancellation/reset fully clean selection",()=>{
  const engine=preparedEngine();engine.startVehicleSelection();const vehicle=vehicles[0];vehicle.status="BUSY";
  assert.equal(engine.selectVehicle(vehicle.id).success,false);vehicle.status="AVAILABLE";
  engine.selectVehicle(vehicle.id);engine.cancelVehicleSelection();
  assert.equal(simulator.vehicleSelection.active,false);assert.equal(vehicle.status,"AVAILABLE");
  engine.startVehicleSelection();engine.selectVehicle(vehicle.id);engine.reset();
  assert.deepEqual(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,confirming:false});
});

test("automatic and autoplay retain automatic dispatch",()=>{
  let engine=preparedEngine("automatic");assert.equal(engine.dispatchVehicle().success,true);assert.ok(vehicles.some(v=>v.status==="TO_INCIDENT"));
  engine=new Engine();engine.reset({operationMode:"autoplay"});const result=engine.createIncident({automatic:true});
  assert.equal(result.success,true);assert.ok(vehicles.some(v=>v.status==="TO_INCIDENT"));assert.equal(simulator.vehicleSelection.active,false);
});

test("selection remains bound to its incident",()=>{
  const engine=preparedEngine();const first=simulator.activeIncident;engine.startVehicleSelection();
  const second={...first,id:"INC-SECOND",createdAt:first.createdAt+1,status:"OPEN",x:first.x+5};simulator.incidents.push(second);
  engine.selectIncident(second.id);const vehicle=vehicles.at(-1);engine.selectVehicle(vehicle.id);engine.confirmManualDispatch();
  assert.equal(second.vehicleId,vehicle.id);assert.equal(first.status,"OPEN");
});


test("manual confirmation stays disabled until a vehicle is selected",()=>{
  const engine=preparedEngine();
  assert.equal(engine.getControlState().selectVehicle,true);
  engine.startVehicleSelection();
  assert.equal(engine.getControlState().selectVehicle,false);
  assert.equal(engine.getControlState().confirmVehicle,false);
  engine.selectVehicle(vehicles[0].id);
  assert.equal(engine.getControlState().confirmVehicle,true);
});

test("autoplay starts paused, pauses only incident generation, and resumes",()=>{
  const engine=new Engine();engine.reset({operationMode:"autoplay",autoplayIntervalSeconds:1});
  assert.equal(simulator.autoplayPaused,true);assert.equal(simulator.nextIncidentAt,null);
  engine.toggleAutoplay();const due=simulator.nextIncidentAt;
  assert.equal(simulator.autoplayPaused,false);assert.ok(due>performance.now());
  engine.update(due);assert.equal(engine.sequence,1);
  engine.toggleAutoplay();assert.equal(simulator.nextIncidentAt,null);
  const count=engine.sequence;engine.update(due+5000);assert.equal(engine.sequence,count);
  engine.toggleAutoplay();assert.ok(simulator.nextIncidentAt>due);
});
