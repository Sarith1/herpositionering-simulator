import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { sessionConfig, simulator, vehicles } from "../js/data.js";

function preparedEngine(mode="manualVehicle") {
  const engine=new Engine();engine.reset({operationMode:mode,multiUnitIncidentPercentage:0});
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
  assert.equal(simulator.vehicleSelection.active,true,"selection starts after travel time");
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
  assert.deepEqual(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,selectedVehicleIds:[],confirming:false});
});

test("automatic and autoplay retain automatic dispatch",()=>{
  let engine=preparedEngine("automatic");assert.equal(engine.dispatchVehicle().success,true);assert.ok(vehicles.some(v=>v.status==="TO_INCIDENT"));
  engine=new Engine();engine.reset({operationMode:"autoplay",multiUnitIncidentPercentage:0});const result=engine.createIncident({autoplayGenerated:true});
  assert.equal(result.success,true);assert.ok(vehicles.some(v=>v.status==="TO_INCIDENT"));assert.equal(simulator.vehicleSelection.active,false);
});

test("selection remains bound to its incident",()=>{
  const engine=preparedEngine();const first=simulator.activeIncident;engine.startVehicleSelection();
  const second={...first,id:"INC-SECOND",createdAt:first.createdAt+1,status:"OPEN",x:first.x+5};simulator.incidents.push(second);
  engine.selectIncident(second.id);const vehicle=vehicles.at(-1);engine.selectVehicle(vehicle.id);engine.confirmManualDispatch();
  assert.equal(second.vehicleId,vehicle.id);assert.equal(first.status,"OPEN");
});


test("manual selection starts automatically and confirmation stays disabled until a vehicle is selected",()=>{
  const engine=preparedEngine();
  assert.equal(simulator.vehicleSelection.active,true);
  assert.equal(engine.getControlState().confirmVehicle,false);
  engine.selectVehicle(vehicles[0].id);
  assert.equal(engine.getControlState().confirmVehicle,true);
});

test("autoplay uses a new inclusive random delay after every incident and resumes with a new delay",()=>{
  const originalRandom=Math.random,values=[0,.95,.2,.7];let index=0;Math.random=()=>values[index++%values.length];
  try {
    const engine=new Engine();engine.reset({operationMode:"autoplay",multiUnitIncidentPercentage:0});
    assert.deepEqual(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});
    engine.toggleAutoplay();assert.equal(simulator.autoplayState.running,true);assert.equal(simulator.autoplayState.nextDelaySeconds,1);
    let due=simulator.autoplayState.nextIncidentAt;engine.update(due);assert.equal(engine.sequence,1);
    assert.equal(simulator.autoplayState.nextDelaySeconds>=1&&simulator.autoplayState.nextDelaySeconds<=20,true);
    engine.toggleAutoplay();assert.deepEqual(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});
    const count=engine.sequence;engine.update(due+50000);assert.equal(engine.sequence,count);
    engine.toggleAutoplay();assert.equal(simulator.autoplayState.running,true);assert.ok(simulator.autoplayState.nextIncidentAt>due);
  } finally {Math.random=originalRandom;}
});

test("twenty autoplay schedules are in range and are recalculated",()=>{
  const engine=new Engine();engine.reset({operationMode:"autoplay",multiUnitIncidentPercentage:0});
  const delays=Array.from({length:20},(_,i)=>{const original=Math.random;Math.random=()=>i/20;const delay=engine.scheduleNextIncident(1000*i);Math.random=original;return delay;});
  assert.equal(delays.every(delay=>delay>=1&&delay<=20),true);assert.ok(new Set(delays).size>1);
});

test("configured autoplay range is inclusive and survives current-session reset",()=>{
  const engine=new Engine();engine.reset({operationMode:"autoplay",autoplayMinDelaySeconds:4,autoplayMaxDelaySeconds:12});
  const original=Math.random;
  try{
    Math.random=()=>0;assert.equal(engine.scheduleNextIncident(0),4);
    Math.random=()=>.9999;assert.equal(engine.scheduleNextIncident(0),12);
    engine.reset();assert.equal(sessionConfig.autoplayMinDelaySeconds,4);assert.equal(sessionConfig.autoplayMaxDelaySeconds,12);
    engine.reset({restoreDefaults:true});assert.equal(sessionConfig.autoplayMinDelaySeconds,1);assert.equal(sessionConfig.autoplayMaxDelaySeconds,20);
  }finally{Math.random=original;}
});

test("dispatch lifecycle is OPEN to ASSIGNED to HANDLED and reset clears all scheduler state",()=>{
  const engine=preparedEngine("automatic"),incident=simulator.activeIncident;
  assert.equal(incident.status,"OPEN");const result=engine.dispatchVehicle();assert.equal(result.success,true);
  assert.equal(incident.status,"FULLY_ASSIGNED");assert.equal(engine.activeDispatches.size,1);assert.equal(result.vehicle.status,"TO_INCIDENT");
  const dispatch=[...engine.activeDispatches.values()][0];engine.updateDispatch(dispatch,dispatch.phaseStartTime+100000);
  assert.equal(incident.status,"HANDLED");assert.equal(simulator.incidents.includes(incident),true);assert.equal(simulator.incidentHistory.at(-1).status,"HANDLED");
  engine.reset();assert.equal(engine.activeDispatches.size,0);assert.deepEqual(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});
});

test("autoplay keeps generating OPEN incidents without vehicles and game over stops its scheduler",()=>{
  const engine=new Engine();engine.reset({operationMode:"autoplay",multiUnitIncidentPercentage:0});vehicles.forEach(vehicle=>vehicle.status="BUSY");
  engine.toggleAutoplay();const due=simulator.autoplayState.nextIncidentAt;engine.update(due);
  assert.equal(simulator.incidents.length,1);assert.equal(simulator.incidents[0].status,"OPEN");assert.ok(simulator.autoplayState.nextIncidentAt>due);
  engine.triggerRepositioningFailure({name:"Testdistrict"});
  assert.deepEqual(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});
  const count=engine.sequence;engine.update(due+100000);assert.equal(engine.sequence,count);
});

test("fifteen consecutive manual input cycles reset completely while dispatches stay active",()=>{
  const engine=new Engine();engine.reset({operationMode:"manualVehicle",vehiclesPerDistrict:Object.fromEntries(["RN","ZH","RS","DG","VR","GO","HW"].map(id=>[id,3]))});
  for(let cycle=0;cycle<15;cycle++){
    assert.equal(engine.createIncident().success,true,`incident ${cycle+1}`);
    assert.equal(engine.selectPrison().success,true);assert.equal(engine.calculateTravelTime().success,true);assert.equal(simulator.vehicleSelection.active,true);
    const vehicle=vehicles.find(item=>item.status==="AVAILABLE");assert.ok(vehicle);assert.equal(engine.selectVehicle(vehicle.id).success,true);assert.equal(engine.confirmManualDispatch().success,true);
    assert.deepEqual(simulator.inputCycleState,{step:"INCIDENT",incidentId:null,prisonId:null,travelTime:null,selectedVehicleId:null,selectedVehicleIds:[]});
    assert.deepEqual(simulator.vehicleSelection,{active:false,incidentId:null,selectedVehicleId:null,selectedVehicleIds:[],confirming:false});
    assert.equal(simulator.activeIncident,null);assert.equal(simulator.selectedPrison,null);assert.equal(simulator.travelTime,null);assert.equal(simulator.selectedVehicleId,null);
  }
  assert.equal(engine.activeDispatches.size,15);
});

test("manual reposition previews risk, preserves home district and uses central registry",()=>{
  const engine=new Engine();engine.reset({operationMode:"automatic"});const vehicle=vehicles[0],origin=vehicle.district,target=origin==="RN"?"ZH":"RN",home=vehicle.homeDistrict;
  assert.equal(engine.startManualReposition().success,true);assert.equal(engine.selectRepositionVehicle(vehicle.id).success,true);
  const preview=engine.selectRepositionTarget(target);assert.equal(preview.success,true);assert.ok(preview.repositionPreview.route.includes("→"));
  const started=engine.confirmManualReposition();assert.equal(started.success,true);assert.equal(vehicle.status,"REPOSITIONING");
  const reposition=[...engine.activeRepositions.values()].find(item=>item.vehicleId===vehicle.id);assert.equal(reposition.type,"manual");assert.equal(engine.incoming(target),true);
  engine.updateReposition(reposition,reposition.phaseStartTime+100000);assert.equal(vehicle.district,target);assert.equal(vehicle.homeDistrict,home);assert.equal(vehicle.status,"AVAILABLE");
});

test("manual reposition cancellation and stale vehicle confirmation are safe",()=>{
  const engine=new Engine();engine.reset();const vehicle=vehicles[0],target=vehicle.district==="RN"?"ZH":"RN";
  engine.startManualReposition();engine.selectRepositionVehicle(vehicle.id);engine.selectRepositionTarget(target);engine.cancelManualReposition();assert.equal(vehicle.status,"AVAILABLE");assert.equal(engine.activeRepositions.size,0);
  engine.startManualReposition();engine.selectRepositionVehicle(vehicle.id);engine.selectRepositionTarget(target);vehicle.status="BUSY";const result=engine.confirmManualReposition();assert.equal(result.success,false);assert.match(result.message,/\[WAARSCHUWING\].*niet meer beschikbaar/);assert.deepEqual(simulator.manualRepositionState,{phase:"selectVehicle",selectedVehicleId:null,targetDistrictId:null});
});

test("manual reposition requires both choices and duplicate confirmation starts only once",()=>{
  const engine=new Engine();engine.reset();const vehicle=vehicles[0],target=vehicle.district==="RN"?"ZH":"RN";
  engine.startManualReposition();assert.equal(engine.getControlState().manualRepositionConfirm,false);
  engine.selectRepositionVehicle(vehicle.id);assert.equal(engine.getControlState().manualRepositionConfirm,false);
  engine.selectRepositionTarget(target);assert.equal(engine.getControlState().manualRepositionConfirm,true);
  assert.equal(engine.confirmManualReposition().success,true);assert.equal(engine.confirmManualReposition().success,false);
  assert.equal([...engine.activeRepositions.values()].filter(item=>item.vehicleId===vehicle.id).length,1);
});

test("manual reposition can be selected during running autoplay and reset cleans its preview",()=>{
  const engine=new Engine();engine.reset({operationMode:"autoplay",multiUnitIncidentPercentage:0});engine.toggleAutoplay();simulator.inputCycleState.step="DISPATCH";
  const vehicle=vehicles[0],target=vehicle.district==="RN"?"ZH":"RN";assert.equal(engine.getControlState().manualRepositionStart,true);
  engine.startManualReposition();engine.selectRepositionVehicle(vehicle.id);engine.selectRepositionTarget(target);assert.ok(simulator.activeRoutes.some(route=>route.id==="manual-reposition-preview"));
  engine.reset({operationMode:"autoplay",multiUnitIncidentPercentage:0});assert.deepEqual(simulator.manualRepositionState,{phase:"idle",selectedVehicleId:null,targetDistrictId:null});assert.equal(simulator.activeRoutes.length,0);assert.equal(engine.activeRepositions.size,0);
});
