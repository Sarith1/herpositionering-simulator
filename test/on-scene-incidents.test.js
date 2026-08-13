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
