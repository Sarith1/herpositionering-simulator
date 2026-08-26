import test from "node:test";
import assert from "node:assert/strict";
import { Engine, getHotzoneCoverageState } from "../js/engine.js";
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

test("central hotzone state rounds the physical AVAILABLE average upward",()=>{
 const engine=new Engine();engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[districts[1].id],vehiclesPerDistrict:fleet([2,1,2,2,1,1,1])});
 const state=getHotzoneCoverageState();
 assert.equal(state.totalAvailable,10);assert.equal(state.hotzoneMinimum,2);
 assert.equal(state.underMinimumHotzones[0].district.id,districts[1].id);
});

test("hotzone parity corrects 4 / 2 but does not invert 3 / 2",()=>{
 const engine=new Engine(),hotzone=districts[1];
 engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[hotzone.id],vehiclesPerDistrict:fleet([4,2,2,2,1,1,1])});
 let move=engine.ensureCoverage().find(event=>event.type==="repositionStarted");
 assert.equal(move?.origin.id,districts[0].id);assert.equal(move?.district.id,hotzone.id);
 assert.deepEqual([engine.getEffectiveCoverage(districts[0].id),engine.getEffectiveCoverage(hotzone.id)],[3,3]);
 engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[hotzone.id],vehiclesPerDistrict:fleet([3,2,2,2,2,1,1])});
 move=engine.ensureCoverage().find(event=>event.type==="repositionStarted");
 assert.notEqual(move?.origin.id,districts[0].id);
});
