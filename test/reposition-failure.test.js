import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = counts => Object.fromEntries(districts.map((district,index)=>[district.id,counts[index]??0]));

test("an uncovered district with no valid donor triggers the existing failure flow",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:fleet([0,1,1,1,1,1,1])});
 assert.equal(engine.hasCriticalCoverageFailure(),true);
 assert.equal(engine.canAnyRepositionStillImproveCoverage(),false);
 const events=engine.ensureCoverage();
 assert.equal(events.at(-1)?.type,"repositioningFailure");
 assert.equal(simulator.gameOver,true);
 assert.equal(simulator.failureInspectionMode,false);
 assert.equal(simulator.autoplayState.running,false);
 assert.equal(simulator.autoplayState.nextIncidentAt,null);
});

test("an incoming reposition prevents failure and duplicate coverage moves",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:fleet([0,2,1,1,1,1,1])});
 const event=engine.startAutomaticReposition(districts[1],districts[0]);
 assert.equal(event.type,"repositionStarted");
 const repositionCount=engine.activeRepositions.size;
 assert.equal(engine.getIncomingRepositions(districts[0].id),1);
 assert.equal(engine.getEffectiveCoverage(districts[0].id),1);
 assert.equal(engine.ensureCoverage().some(item=>item.type==="repositioningFailure"),false);
 assert.equal(engine.activeRepositions.size,repositionCount);
 assert.equal(simulator.gameOver,false);
});

test("a returning lifecycle does not cause premature failure",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:fleet([0,1,1,1,1,1,1])});
 vehicles.find(vehicle=>vehicle.district===districts[1].id).status="RETURNING";
 assert.equal(engine.canAnyRepositionStillImproveCoverage(),false);
 assert.equal(engine.ensureCoverage().some(item=>item.type==="repositioningFailure"),false);
 assert.equal(simulator.gameOver,false);
});

test("hotzone optimization without critical coverage never ends the session",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[districts[0].id],vehiclesPerDistrict:fleet([2,3,2,2,2,2,2])});
 assert.equal(engine.hasCriticalCoverageFailure(),false);
 engine.ensureCoverage();
 assert.equal(simulator.gameOver,false);
});

test("reposition training detects failure without starting an automatic move",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"repositionTraining",vehiclesPerDistrict:fleet([0,1,1,1,1,1,1])});
 const events=engine.ensureCoverage();
 assert.equal(engine.activeRepositions.size,0);
 assert.equal(events.some(item=>item.type==="repositionStarted"),false);
 assert.equal(events.some(item=>item.type==="repositioningFailure"),true);
 assert.equal(simulator.gameOver,true);
 assert.equal(engine.startManualReposition().success,false);
});

test("autoplay failure stops incident scheduling",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"autoplay",vehiclesPerDistrict:fleet([0,1,1,1,1,1,1])});
 engine.toggleAutoplay();
 assert.equal(simulator.autoplayState.running,true);
 engine.ensureCoverage();
 assert.equal(simulator.gameOver,true);
 assert.deepEqual(simulator.autoplayState,{running:false,nextIncidentAt:null,nextDelaySeconds:null});
 assert.equal(engine.createIncident({autoplayGenerated:true}).success,false);
});
