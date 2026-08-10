import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { simulator, vehicles } from "../js/data.js";

test("the stateful primary action completes five consecutive manual repositions", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic" }); const vehicle = vehicles[0], home = vehicle.homeDistrict;
  for (let trip = 0; trip < 5; trip++) {
    const target = vehicle.district === "RN" ? "ZH" : "RN";
    assert.equal(engine.handleManualRepositionAction().success, true);
    assert.equal(simulator.manualRepositionState.phase, "selecting");
    assert.equal(engine.selectRepositionVehicle(vehicle.id).success, true);
    assert.equal(engine.selectRepositionTarget(target).success, true);
    assert.equal(simulator.manualRepositionState.phase, "ready");
    assert.equal(engine.getControlState().manualRepositionConfirm, true);
    assert.equal(engine.handleManualRepositionAction().success, true);
    assert.equal(vehicle.status, "REPOSITIONING");
    const movement = [...engine.activeRepositions.values()].find(item => item.vehicleId === vehicle.id); assert.ok(movement);
    engine.updateReposition(movement, movement.phaseStartTime + 100000);
    assert.equal(vehicle.district, target); assert.equal(vehicle.homeDistrict, home); assert.equal(vehicle.status, "AVAILABLE");
    assert.deepEqual(simulator.manualRepositionState, { phase: "idle", selectedVehicleId: null, targetDistrictId: null });
  }
});
