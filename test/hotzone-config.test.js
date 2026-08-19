import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { DEFAULT_SESSION_CONFIG, districts, sessionConfig } from "../js/data.js";
import { MapView } from "../js/map.js";

class FakeSvgNode {
  constructor(){this.attributes={};this.dataset={};this.children=[];}
  set innerHTML(value){if(value==="")this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  appendChild(child){this.children.push(child);}
  append(...children){this.children.push(...children);}
}

test("hotzones are validated, preserved by session reset, and restored by defaults", () => {
  const engine=new Engine();
  engine.reset({hotzoneDistrictIds:["RS","RZ","RS","UNKNOWN"]});
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,["RS","RZ"]);

  engine.reset();
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,["RS","RZ"]);

  engine.reset({restoreDefaults:true});
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,["RS","RO","RZ"]);
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,DEFAULT_SESSION_CONFIG.hotzoneDistrictIds);
});

test("central session defaults contain the standard incident and travel settings", () => {
  const engine=new Engine();
  engine.reset({restoreDefaults:true});
  assert.equal(sessionConfig.hotzoneIncidentPercentage,70);
  assert.equal(sessionConfig.multiUnitIncidentPercentage,15);
  assert.equal(sessionConfig.onSceneIncidentPercentage,15);
  assert.equal(sessionConfig.travelTimeMinSeconds,100);
  assert.equal(sessionConfig.travelTimeMaxSeconds,180);

  engine.reset({hotzoneIncidentPercentage:25,multiUnitIncidentPercentage:35,onSceneIncidentPercentage:45,travelTimeMinSeconds:60,travelTimeMaxSeconds:80});
  engine.reset();
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,["RS","RO","RZ"]);
  assert.equal(sessionConfig.hotzoneIncidentPercentage,25);
  assert.equal(sessionConfig.multiUnitIncidentPercentage,35);
  assert.equal(sessionConfig.onSceneIncidentPercentage,45);
  assert.equal(sessionConfig.travelTimeMinSeconds,60);
  assert.equal(sessionConfig.travelTimeMaxSeconds,80);
});

test("the map draws exactly one non-interactive marker per configured hotzone", () => {
  const originalDocument=globalThis.document;
  globalThis.document={createElementNS:()=>new FakeSvgNode()};
  try {
    const engine=new Engine();
    engine.reset({hotzoneDistrictIds:districts.map(district=>district.id)});
    const view=Object.create(MapView.prototype);
    view.hotzoneLayer=new FakeSvgNode();
    view.drawHotzones();

    assert.equal(view.hotzoneLayer.children.length,7);
    for(const marker of view.hotzoneLayer.children){
      assert.equal(marker.attributes.class,"hotzone-marker");
      assert.equal(marker.attributes["aria-hidden"],"true");
      assert.deepEqual(marker.children.map(child=>child.attributes.r),["72","58"]);
    }
  } finally {
    globalThis.document=originalDocument;
  }
});
