import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";
import { MapView, REPOSITION_TARGET_HIT_RADIUS, REPOSITION_TARGET_LABEL_HEIGHT, REPOSITION_TARGET_LABEL_WIDTH } from "../js/map.js";

class FakeSvgNode {
  constructor(){this.attributes={};this.dataset={};this.listeners={};this.children=[];}
  set innerHTML(value){if(value==="")this.children=[];}
  setAttribute(name,value){
    this.attributes[name]=String(value);
    if(name==="data-district-id")this.dataset.districtId=String(value);
    if(name==="data-reposition-target-id")this.dataset.repositionTargetId=String(value);
  }
  addEventListener(type,handler){this.listeners[type]=handler;}
  appendChild(child){this.children.push(child);}
  append(...children){this.children.push(...children);}
  closest(selector){return selector==="[data-reposition-target-id]"&&this.dataset.repositionTargetId?this:null;}
}

test("delegated circle and label clicks dispatch their district exactly once", () => {
  const originalDocument=globalThis.document,originalCustomEvent=globalThis.CustomEvent;
  const emitted=[];
  globalThis.document={createElementNS:()=>new FakeSvgNode()};
  globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
  try {
    const engine=new Engine();engine.reset({operationMode:"automatic"});const vehicle=vehicles[0];
    engine.startManualReposition();engine.selectRepositionVehicle(vehicle.id);
    assert.equal(simulator.manualRepositionState.phase,"selectDistrict");
    const view=Object.create(MapView.prototype);view.interactionLayer=new FakeSvgNode();view.lastInteractionSignature=null;view.container={dispatchEvent:event=>emitted.push(event)};
    view.interactionLayer.addEventListener("click", event=>view.handleRepositionTargetSelection(event));
    view.syncInteractionLayer();
    const target=view.interactionLayer.children.find(node=>node.dataset.districtId!==vehicle.district);assert.ok(target);
    const hit=target.children.find(node=>node.attributes.class?.includes("reposition-target-hitarea"));assert.ok(hit);
    const labelZone=target.children.find(node=>node.attributes.class==="reposition-target-label-zone");assert.ok(labelZone);
    assert.equal(REPOSITION_TARGET_HIT_RADIUS,95);assert.equal(hit.attributes.r,"95");
    assert.equal(REPOSITION_TARGET_LABEL_WIDTH,190);assert.equal(labelZone.attributes.width,"190");
    assert.equal(REPOSITION_TARGET_LABEL_HEIGHT,55);assert.equal(labelZone.attributes.height,"55");
    assert.equal(target.listeners.click,undefined);assert.equal(hit.listeners.click,undefined);assert.equal(labelZone.listeners.click,undefined);
    assert.equal(target.attributes["pointer-events"],"all");assert.equal(hit.attributes["pointer-events"],"all");assert.equal(labelZone.attributes["pointer-events"],"all");
    for(const clickedNode of [hit,labelZone]) {
      const before=emitted.length;
      view.interactionLayer.listeners.click({target:clickedNode,preventDefault(){},stopPropagation(){}});
      assert.equal(emitted.length,before+1);
      assert.deepEqual(emitted.at(-1).detail,{districtId:target.dataset.districtId});
    }
    assert.equal(engine.selectRepositionTarget(emitted.at(-1).detail.districtId).success,true);
    assert.equal(simulator.manualRepositionState.targetDistrictId,target.dataset.districtId);
    assert.equal(engine.getControlState().manualRepositionConfirm,true);
  } finally {globalThis.document=originalDocument;globalThis.CustomEvent=originalCustomEvent;}
});

test("interaction targets remain the same DOM nodes across 500ms of frame syncs", async () => {
  const originalDocument=globalThis.document;
  globalThis.document={createElementNS:()=>new FakeSvgNode()};
  try {
    const engine=new Engine();engine.reset({operationMode:"automatic"});const vehicle=vehicles[0];
    engine.startManualReposition();engine.selectRepositionVehicle(vehicle.id);
    const view=Object.create(MapView.prototype);view.interactionLayer=new FakeSvgNode();view.lastInteractionSignature=null;
    view.syncInteractionLayer();
    const firstNode=view.interactionLayer.children[0];
    const interval=setInterval(()=>view.syncInteractionLayer(),10);
    await new Promise(resolve=>setTimeout(resolve,500));clearInterval(interval);
    assert.equal(view.interactionLayer.children[0],firstNode);
  } finally {globalThis.document=originalDocument;}
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

test("the stateful primary action completes twenty consecutive manual repositions", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic" }); const vehicle = vehicles[0], home = vehicle.homeDistrict;
  for (let trip = 0; trip < 20; trip++) {
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
