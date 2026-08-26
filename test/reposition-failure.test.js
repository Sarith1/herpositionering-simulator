import test from "node:test";
import assert from "node:assert/strict";
import { COVERAGE_GRACE_PERIOD_MS, Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = counts => Object.fromEntries(districts.map((district,index)=>[district.id,counts[index]??0]));
const uncoveredFleet = () => fleet([0,1,1,1,1,1,1]);

test("coverage failure starts once and fires after exactly two seconds",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:uncoveredFleet()});
 assert.deepEqual(engine.evaluateCoverageFailure(1000),[]);
 assert.equal(engine.coverageLossStartedAt.get(districts[0].id),1000);
 assert.deepEqual(engine.evaluateCoverageFailure(2999),[]);
 assert.equal(engine.coverageLossStartedAt.get(districts[0].id),1000);
 const events=engine.evaluateCoverageFailure(1000+COVERAGE_GRACE_PERIOD_MS);
 assert.equal(events.at(-1)?.type,"repositioningFailure");
 assert.equal(simulator.gameOver,true);
 assert.match(simulator.repositioningFailure.explanation,/langer dan 2 seconden/);
});

test("an available arrival within the grace period clears the timer",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:uncoveredFleet()});
 engine.evaluateCoverageFailure(1000);
 const returning=vehicles.find(vehicle=>vehicle.district===districts[1].id);
 returning.status="AVAILABLE";returning.district=districts[0].id;
 assert.deepEqual(engine.evaluateCoverageFailure(2500),[]);
 assert.equal(engine.coverageLossStartedAt.has(districts[0].id),false);
 assert.equal(simulator.gameOver,false);
});

test("a late returning vehicle does not count as available coverage",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:uncoveredFleet()});
 vehicles.find(vehicle=>vehicle.district===districts[1].id).status="RETURNING";
 engine.evaluateCoverageFailure(1000);
 engine.evaluateCoverageFailure(3000);
 assert.equal(simulator.gameOver,true);
});

test("a relevant queued or incoming reposition prevents premature failure",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:fleet([0,2,1,1,1,1,1])});
 const move=engine.startAutomaticReposition(districts[1],districts[0]);
 engine.evaluateCoverageFailure(1000);
 assert.equal(engine.getIncomingRepositions(districts[0].id),1);
 assert.deepEqual(engine.evaluateCoverageFailure(2999),[]);
 assert.equal(simulator.gameOver,false);
 engine.evaluateCoverageFailure(3000);
 assert.equal(move.type,"repositionStarted");
 assert.equal(simulator.gameOver,false);
});

test("a district needs at least two available vehicles before it can donate",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:fleet([0,1,1,1,1,1,1])});
 assert.equal(engine.canAnyDistrictDonateVehicle(),false);
 vehicles.find(vehicle=>vehicle.district===districts[1].id).status="AVAILABLE";
 // Add one independent available unit to RS to exercise the exact threshold.
 const donor={...vehicles.find(vehicle=>vehicle.district===districts[1].id),id:"DONOR-TEST",callsign:"DONOR-TEST"};vehicles.push(donor);
 assert.equal(engine.canDistrictDonateVehicle(districts[1].id),true);
 vehicles.pop();
});

test("restored coverage gets a fresh grace period after a later loss",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:fleet([0,2,1,1,1,1,1])});
 engine.evaluateCoverageFailure(1000);
 const vehicle=vehicles.find(item=>item.district===districts[1].id);vehicle.district=districts[0].id;
 engine.evaluateCoverageFailure(2000);
 vehicle.status="RETURNING";
 engine.evaluateCoverageFailure(5000);
 assert.equal(engine.coverageLossStartedAt.get(districts[0].id),5000);
 assert.deepEqual(engine.evaluateCoverageFailure(6999),[]);
 assert.equal(simulator.gameOver,false);
});

for(const mode of ["automatic","manualVehicle","autoplay","repositionTraining"]){
 test(`${mode} uses the central two-second coverage rule`,()=>{
  const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:mode,vehiclesPerDistrict:uncoveredFleet()});
  if(mode==="autoplay")engine.toggleAutoplay();
  engine.evaluateCoverageFailure(10);
  const events=engine.evaluateCoverageFailure(2010);
  assert.equal(events.at(-1)?.type,"repositioningFailure");
  assert.equal(simulator.gameOver,true);
  assert.equal(simulator.autoplayState.running,false);
  assert.equal(engine.createIncident({autoplayGenerated:true}).success,false);
 });
}

test("hotzone optimization without missing available coverage never ends the session",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[districts[0].id],vehiclesPerDistrict:fleet([2,3,2,2,2,2,2])});
 engine.ensureCoverage();
 engine.evaluateCoverageFailure(5000);
 assert.equal(simulator.gameOver,false);
});

test("engine update preserves every operational status, position and timer after game over",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:fleet([1,1,1,1,1,1,1])});
 const statuses=["TO_INCIDENT","RETURNING","REPOSITIONING","ON_SCENE","BUSY"];
 vehicles.slice(0,statuses.length).forEach((vehicle,index)=>Object.assign(vehicle,{status:statuses[index],x:100+index*17,y:200+index*13}));
 simulator.incidents.push({id:"FROZEN",status:"OPEN"});
 Object.assign(simulator.autoplayState,{running:true,nextIncidentAt:1,nextDelaySeconds:1});
 simulator.gameOver=true;
 const before=vehicles.map(({id,status,x,y})=>({id,status,x,y}));
 const incidents=simulator.incidents.length;
 assert.deepEqual(engine.update(100000),[]);
 assert.deepEqual(engine.update(110000),[]);
 assert.deepEqual(vehicles.map(({id,status,x,y})=>({id,status,x,y})),before);
 assert.equal(simulator.incidents.length,incidents);
 assert.equal(simulator.autoplayState.nextIncidentAt,1);
});
