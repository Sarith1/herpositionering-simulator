import test from "node:test";
import assert from "node:assert/strict";
import { Engine, getRandomOnSceneBusySeconds } from "../js/engine.js";
import { sessionConfig, simulator, vehicles } from "../js/data.js";

globalThis.performance ??= { now: () => 0 };

test("on-scene ratio supports exact zero and one hundred percent", () => {
 const engine=new Engine();engine.reset({restoreDefaults:true,onSceneIncidentPercentage:0});
 for(let i=0;i<50;i++){engine.resetInputCycle();assert.equal(engine.createIncident().incident.type,"detention");}
 engine.reset({onSceneIncidentPercentage:100});
 for(let i=0;i<50;i++){engine.resetInputCycle();assert.equal(engine.createIncident().incident.type,"onscene");}
});

test("on-scene duration is generated once in the inclusive range", () => {
 assert.equal(getRandomOnSceneBusySeconds(()=>0),15);assert.equal(getRandomOnSceneBusySeconds(()=>0.999999),45);
 const engine=new Engine();engine.reset({restoreDefaults:true,onSceneIncidentPercentage:100});const incident=engine.createIncident({requiredUnits:3}).incident;
 assert.ok(incident.sceneBusyDurationSeconds>=15&&incident.sceneBusyDurationSeconds<=45);assert.equal(incident.prisonId,null);
});

test("on-scene marker hides on first arrival while multi-unit incident remains active", () => {
 const engine=new Engine();engine.reset({restoreDefaults:true,onSceneIncidentPercentage:100,
  vehiclesPerDistrict:Object.fromEntries(["RN","ZH","RS","RO","RZW","RZ","ZHZ"].map(id=>[id,3]))});
 const incident=engine.createIncident({requiredUnits:3}).incident;
 assert.equal(incident.markerVisible,true);
 engine.dispatchVehicle();
 const dispatches=[...engine.activeDispatches.values()].filter(dispatch=>dispatch.incidentId===incident.id);
 assert.equal(dispatches.length,3);
 assert.ok(dispatches.every(dispatch=>dispatch.incidentX===incident.x&&dispatch.incidentY===incident.y));
 engine.updateDispatch(dispatches[0],Infinity);
 assert.equal(incident.markerVisible,false);
 assert.equal(incident.arrivedVehicleIds.length,1);
 assert.notEqual(incident.status,"HANDLED");
 assert.equal(simulator.incidents.includes(incident),true);
 assert.equal(dispatches[0].phase,"ON_SCENE");
 assert.equal(dispatches[1].phase,"TO_INCIDENT");
 engine.updateDispatch(dispatches[1],Infinity);
 assert.equal(dispatches[1].phase,"ON_SCENE");
 assert.equal(dispatches[2].phase,"TO_INCIDENT");
 engine.updateDispatch(dispatches[2],Infinity);
 assert.equal(incident.status,"ON_SCENE");
 assert.equal(incident.arrivedVehicleIds.length,3);
});

test("detention marker remains visible on arrival", () => {
 const engine=new Engine();engine.reset({restoreDefaults:true,onSceneIncidentPercentage:0});
 const incident=engine.createIncident({requiredUnits:1}).incident;
 engine.selectPrison();engine.calculateTravelTime();engine.dispatchVehicle();
 engine.updateDispatch([...engine.activeDispatches.values()][0],Infinity);
 assert.equal(incident.markerVisible,true);
 assert.equal(incident.status,"HANDLED");
});
