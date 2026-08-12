import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, sessionConfig } from "../js/data.js";
import { MapView } from "../js/map.js";

class FakeSvgNode {
  constructor(){this.attributes={};this.dataset={};this.children=[];}
  set innerHTML(value){if(value==="")this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);}
  appendChild(child){this.children.push(child);}
  append(...children){this.children.push(...children);}
}

test("hotzones are validated, preserved by session reset, and cleared by defaults", () => {
  const engine=new Engine();
  engine.reset({hotzoneDistrictIds:["RS","RZ","RS","UNKNOWN"]});
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,["RS","RZ"]);

  engine.reset();
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,["RS","RZ"]);

  engine.reset({restoreDefaults:true});
  assert.deepEqual(sessionConfig.hotzoneDistrictIds,[]);
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
