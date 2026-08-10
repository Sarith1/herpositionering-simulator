import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { simulator, vehicles } from "../js/data.js";
import { MapView } from "../js/map.js";

class FakeSvgNode {
  constructor(){this.attributes={};this.dataset={};this.listeners={};this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==="data-district-id")this.dataset.districtId=String(value);}
  addEventListener(type,handler){this.listeners[type]=handler;}
  appendChild(child){this.children.push(child);}
  click(){this.listeners.click?.({});}
}

test("the top SVG interaction layer dispatches the exact district clicked", () => {
  const originalDocument=globalThis.document,originalCustomEvent=globalThis.CustomEvent;
  const emitted=[];
  globalThis.document={createElementNS:()=>new FakeSvgNode()};
  globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
  try {
    const engine=new Engine();engine.reset({operationMode:"automatic"});const vehicle=vehicles[0];
    engine.startManualReposition();engine.selectRepositionVehicle(vehicle.id);
    assert.equal(simulator.manualRepositionState.phase,"selectDistrict");
    const view=Object.create(MapView.prototype);view.interactionLayer=new FakeSvgNode();view.container={dispatchEvent:event=>emitted.push(event)};
    view.drawDistrictInteractions();
    const hit=view.interactionLayer.children.find(node=>node.dataset.districtId!==vehicle.district);assert.ok(hit);
    hit.click();assert.deepEqual(emitted.at(-1).detail,{districtId:hit.dataset.districtId});
    assert.equal(engine.selectRepositionTarget(emitted.at(-1).detail.districtId).success,true);
    assert.equal(simulator.manualRepositionState.targetDistrictId,hit.dataset.districtId);
    assert.equal(engine.getControlState().manualRepositionConfirm,true);
  } finally {globalThis.document=originalDocument;globalThis.CustomEvent=originalCustomEvent;}
});

test("the stateful primary action completes ten consecutive manual repositions", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic" }); const vehicle = vehicles[0], home = vehicle.homeDistrict;
  for (let trip = 0; trip < 10; trip++) {
    const target = vehicle.district === "RN" ? "ZH" : "RN";
    assert.equal(engine.handleManualRepositionAction().success, true);
    assert.equal(simulator.manualRepositionState.phase, "selectVehicle");
    assert.equal(engine.selectRepositionVehicle(vehicle.id).success, true);
    assert.equal(simulator.manualRepositionState.phase, "selectDistrict");
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
