import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, vehicles } from "../js/data.js";

const fleet = counts => Object.fromEntries(districts.map((district,index)=>[district.id,counts[index]||0]));

test("automatic coverage sends the richest non-hotzone donor to the lowest hotzone",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[districts[5].id],vehiclesPerDistrict:fleet([3,3,2,2,2,1,1])});
 const target=districts[5],events=engine.ensureCoverage(),reposition=events.find(event=>event.type==="repositionStarted");
 assert.ok(reposition);assert.equal(reposition.district.id,target.id);assert.ok([districts[0].id,districts[2].id].includes(reposition.origin.id));
 assert.ok(engine.getCoverageTargets().hotzoneMinimum>=2);assert.ok(engine.getEffectiveCoverage(target.id)>=2);
});

test("incoming reposition coverage prevents duplicate hotzone reservations",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[districts[5].id],vehiclesPerDistrict:fleet([2,2,2,2,2,1,1])});
 engine.ensureCoverage();const count=engine.activeRepositions.size;engine.ensureCoverage();
 assert.equal(count,0);assert.equal(engine.activeRepositions.size,0);
});

test("multiple hotzones favor the lowest covered one and training never moves vehicles",()=>{
 const [a,b,c]=districts;const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[a.id,b.id],vehiclesPerDistrict:fleet([1,3,4,1,1,1,1])});
 assert.equal(engine.ensureCoverage().find(event=>event.type==="repositionStarted")?.district.id,a.id);
 engine.reset({operationMode:"repositionTraining",hotzoneDistrictIds:[a.id],vehiclesPerDistrict:fleet([0,4,2,2,2,2,2])});engine.ensureCoverage();
 assert.equal(engine.activeRepositions.size,0);assert.equal(vehicles.filter(vehicle=>vehicle.status==="REPOSITIONING").length,0);
});
