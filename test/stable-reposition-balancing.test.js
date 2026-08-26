import test from "node:test";
import assert from "node:assert/strict";
import { Engine, REPOSITION_REVERSAL_COOLDOWN_MS } from "../js/engine.js";
import { districts } from "../js/data.js";

const fleet = (donor, receiver) => Object.fromEntries(districts.map(district => [district.id, district.id === "RN" ? donor : district.id === "RS" ? receiver : 2]));

for (const [before, moves] of [[[3,1],1],[[2,1],0],[[3,2],0],[[4,2],1],[[4,1],1]]) {
  test(`automatic balancing applies the stable donor rule to ${before.join(" / ")}`, () => {
    const engine = new Engine();
    engine.reset({ restoreDefaults:true, operationMode:"automatic", vehiclesPerDistrict:fleet(...before) });
    const events = engine.ensureCoverage();
    assert.equal(events.filter(event => event.type === "repositionStarted").length, moves);
    if (moves) {
      assert.equal(events.find(event => event.type === "repositionStarted").origin.id, "RN");
      const move=events.find(event => event.type === "repositionStarted");
      assert.ok(engine.getEffectiveCoverage(move.origin.id) >= engine.getEffectiveCoverage(move.district.id));
    }
  });
}

test("effective coverage includes an incoming move and prevents duplicate planning", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults:true, operationMode:"automatic", vehiclesPerDistrict:fleet(3,1) });
  engine.ensureCoverage();
  assert.deepEqual([engine.getEffectiveCoverage("RN"),engine.getEffectiveCoverage("RS")],[2,2]);
  assert.equal(engine.ensureCoverage().filter(event => event.type === "repositionStarted").length,0);
});

test("a completed automatic move is not reversed during the cooldown", () => {
  const engine = new Engine();
  engine.reset({ restoreDefaults:true, operationMode:"automatic", vehiclesPerDistrict:fleet(3,1) });
  engine.ensureCoverage();
  const move=[...engine.activeRepositions.values()][0],finishedAt=move.phaseStartTime+100000;
  const events=engine.updateReposition(move,finishedAt);
  assert.equal(events.some(event=>event.type==="repositionStarted"&&event.origin.id==="RS"&&event.district.id==="RN"),false);
  assert.equal(REPOSITION_REVERSAL_COOLDOWN_MS,10000);
});

test("hotzones are tie-breakers but cannot bypass the two-unit gap", () => {
  const hotzone="RS",engine=new Engine();
  engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[hotzone],vehiclesPerDistrict:fleet(2,1)});
  assert.equal(engine.ensureCoverage().some(event=>event.type==="repositionStarted"),false);
  engine.reset({restoreDefaults:true,operationMode:"automatic",hotzoneDistrictIds:[hotzone],vehiclesPerDistrict:fleet(3,1)});
  assert.equal(engine.ensureCoverage().find(event=>event.type==="repositionStarted")?.district.id,hotzone);
});
