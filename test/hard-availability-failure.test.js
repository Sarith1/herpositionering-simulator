import test from "node:test";
import assert from "node:assert/strict";
import { Engine, MIN_AVAILABLE_VEHICLES_BEFORE_FAILURE, getTotalAvailableVehicleCount } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = counts => Object.fromEntries(districts.map((district,index)=>[district.id,counts[index]??0]));
const configuredFleet = total => fleet([total,0,0,0,0,0,0]);

for(const total of [8,7,6]){
 test(`${total} AVAILABLE vehicles ${total<=7?"immediately ends":"does not end"} the session`,()=>{
  const engine=new Engine();
  const result=engine.reset({restoreDefaults:true,operationMode:"automatic",vehiclesPerDistrict:configuredFleet(total)});
  assert.equal(getTotalAvailableVehicleCount(),total);
  assert.equal(simulator.gameOver,total<=MIN_AVAILABLE_VEHICLES_BEFORE_FAILURE);
  assert.equal(result.events.some(event=>event.type==="repositioningFailure"),total<=7);
 });
}

test("dispatch from eight to seven triggers the hard failure without a grace period",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"autoplay",vehiclesPerDistrict:configuredFleet(8)});
 const result=engine.createIncident({autoplayGenerated:true,requiredUnits:1,type:"onscene"});
 assert.equal(getTotalAvailableVehicleCount(),7);
 assert.equal(simulator.gameOver,true);
 assert.ok(result.events.some(event=>event.type==="repositioningFailure"));
 assert.equal(simulator.repositioningFailure.title,"Herpositioneren is niet meer mogelijk");
});

test("only the exact AVAILABLE status contributes to the hard threshold",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,vehiclesPerDistrict:configuredFleet(10)});
 vehicles.slice(7).forEach((vehicle,index)=>vehicle.status=["RETURNING","REPOSITIONING","BUSY"][index]);
 const events=engine.evaluateHardAvailabilityFailure(10);
 assert.equal(getTotalAvailableVehicleCount(),7);
 assert.equal(events.at(-1)?.type,"repositioningFailure");
 assert.equal(simulator.gameOver,true);
});
