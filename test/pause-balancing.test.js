import test from "node:test";
import assert from "node:assert/strict";
import { Engine, getCoverageTargets } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = values => Object.fromEntries(districts.map((district,index)=>[district.id,values[index]]));

test("autoplay pause freezes movement, deadlines, countdown and realistic clock", () => {
  const engine=new Engine();engine.reset({operationMode:"autoplay",autoplayMinDelaySeconds:4,autoplayMaxDelaySeconds:4,multiUnitIncidentPercentage:0,onSceneIncidentPercentage:0});
  engine.toggleAutoplay();
  const incident=engine.createIncident({autoplayGenerated:true,type:"detention",requiredUnits:1}).incident;
  const dispatch=[...engine.activeDispatches.values()].find(item=>item.incidentId===incident.id);
  engine.update(dispatch.phaseStartTime+1000);
  engine.toggleAutoplay();
  const vehicle=vehicles.find(item=>item.id===dispatch.vehicleId),snapshot={x:vehicle.x,y:vehicle.y,phase:dispatch.phase,phaseStartTime:dispatch.phaseStartTime,nextIncidentAt:simulator.autoplayState.nextIncidentAt,clock:engine.simulationClock.displayTime};
  assert.deepEqual(engine.update(performance.now()+10_000),[]);
  assert.deepEqual({x:vehicle.x,y:vehicle.y,phase:dispatch.phase,phaseStartTime:dispatch.phaseStartTime,nextIncidentAt:simulator.autoplayState.nextIncidentAt,clock:engine.simulationClock.displayTime},snapshot);
});

test("balanced targets minimize spread and give extra coverage to hotzones first",()=>{
  const engine=new Engine();engine.reset({operationMode:"automatic",vehiclesPerDistrict:fleet([3,3,1,1,1,1,1]),hotzoneDistrictIds:[districts[2].id,districts[3].id]});
  const targets=getCoverageTargets();
  assert.ok(Math.max(...Object.values(targets.targetByDistrict))-Math.min(...Object.values(targets.targetByDistrict))<=1);
  assert.equal(targets.targetByDistrict[districts[2].id],2);
  assert.equal(targets.targetByDistrict[districts[3].id],2);
  const events=engine.ensureCoverage();
  assert.ok(events.some(event=>event.type==="repositionStarted"));
});
