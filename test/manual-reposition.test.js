import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";
import { MapView, REPOSITION_TARGET_HIT_RADIUS, REPOSITION_TARGET_LABEL_HEIGHT, REPOSITION_TARGET_LABEL_WIDTH } from "../js/map.js";

class FakeSvgNode {
  constructor(){this.attributes={};this.dataset={};this.listeners={};this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==="data-district-id")this.dataset.districtId=String(value);}
  addEventListener(type,handler){this.listeners[type]=handler;}
  appendChild(child){this.children.push(child);}
  append(...children){this.children.push(...children);}
  click(){this.listeners.click?.({preventDefault(){},stopPropagation(){}});}
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
    view.syncInteractionLayer();
    const target=view.interactionLayer.children.find(node=>node.dataset.districtId!==vehicle.district);assert.ok(target);
    const hit=target.children.find(node=>node.attributes.class?.includes("reposition-target-hitarea"));assert.ok(hit);
    const labelZone=target.children.find(node=>node.attributes.class==="reposition-target-label-zone");assert.ok(labelZone);
    assert.equal(REPOSITION_TARGET_HIT_RADIUS,95);assert.equal(hit.attributes.r,"95");
    assert.equal(REPOSITION_TARGET_LABEL_WIDTH,190);assert.equal(labelZone.attributes.width,"190");
    assert.equal(REPOSITION_TARGET_LABEL_HEIGHT,55);assert.equal(labelZone.attributes.height,"55");
    assert.ok(target.listeners.click);assert.equal(hit.listeners.click,undefined);assert.equal(labelZone.listeners.click,undefined);
    target.click();assert.deepEqual(emitted.at(-1).detail,{districtId:target.dataset.districtId});
    assert.equal(engine.selectRepositionTarget(emitted.at(-1).detail.districtId).success,true);
    assert.equal(simulator.manualRepositionState.targetDistrictId,target.dataset.districtId);
    assert.equal(engine.getControlState().manualRepositionConfirm,true);
  } finally {globalThis.document=originalDocument;globalThis.CustomEvent=originalCustomEvent;}
});

test("all seven districts can reliably become a reposition target", () => {
  const engine=new Engine();
  for (const target of districts) {
    engine.reset({operationMode:"automatic"});
    const vehicle=vehicles.find(item=>item.district!==target.id);
    assert.ok(vehicle, `vehicle outside ${target.id}`);
    assert.equal(engine.startManualReposition().success,true);
    assert.equal(engine.selectRepositionVehicle(vehicle.id).success,true);
    assert.equal(engine.selectRepositionTarget(target.id).success,true);
    assert.equal(simulator.manualRepositionState.targetDistrictId,target.id);
    assert.equal(engine.getControlState().manualRepositionConfirm,true);
  }
});

test("the stateful primary action completes fifteen consecutive manual repositions", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic" }); const vehicle = vehicles[0], home = vehicle.homeDistrict;
  for (let trip = 0; trip < 15; trip++) {
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
