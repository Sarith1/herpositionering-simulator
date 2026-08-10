import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../js/engine.js";
import { districts, simulator, vehicles } from "../js/data.js";

const fleet = count => Object.fromEntries(districts.map(district => [district.id, count]));
const advanceMission = (engine, dispatch) => {
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + 100000);
  assert.equal(dispatch.phase, "TO_PRISON");
  assert.equal(simulator.incidents.find(i => i.id === dispatch.incidentId)?.status, "HANDLED");
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + 100000);
  assert.equal(dispatch.phase, "BUSY");
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + dispatch.busySeconds * 1000 + 1);
  assert.equal(dispatch.phase, "RETURNING");
  engine.updateDispatch(dispatch, dispatch.phaseStartTime + 100000);
};

test("25 automatic input cycles dispatch their exact incident with five overlapping", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic", vehiclesPerDistrict: fleet(5) });
  const pending=[];
  for (let cycle = 0; cycle < 25; cycle++) {
    assert.equal(engine.createIncident().success, true); const incidentId = simulator.inputCycleState.incidentId;
    assert.equal(engine.selectPrison().success, true); assert.equal(engine.calculateTravelTime().success, true);
    const result = engine.dispatchVehicle(); assert.equal(result.success, true, `cycle ${cycle + 1}`);
    const incident = simulator.incidents.find(item => item.id === incidentId);
    assert.equal(incident.status, "ASSIGNED"); assert.equal(incident.vehicleId, result.vehicle.id);
    const dispatch = [...engine.activeDispatches.values()].find(item => item.incidentId === incidentId); assert.ok(dispatch);
    assert.equal(simulator.inputCycleState.step, "INCIDENT"); pending.push(dispatch);
    assert.ok(engine.activeDispatches.size>=Math.min(cycle+1,5));
    if(pending.length>=5)advanceMission(engine,pending.shift());
  }
  pending.forEach(dispatch=>advanceMission(engine,dispatch));
  assert.equal(simulator.incidentHistory.length, 25);
});

test("automatic dispatch never falls back to another OPEN incident", () => {
  const engine = new Engine(); engine.reset({ operationMode: "automatic" });
  engine.createIncident(); const staleId = simulator.inputCycleState.incidentId;
  simulator.incidents.push({ ...simulator.incidents[0], id: "INC-OTHER", status: "OPEN" });
  engine.selectPrison(); engine.calculateTravelTime(); simulator.incidents.find(i => i.id === staleId).status = "HANDLED";
  assert.throws(() => engine.dispatchVehicle(), /INVARIANT DISPATCH/);
  assert.equal(simulator.incidents.find(i => i.id === "INC-OTHER").status, "OPEN");
  assert.equal(simulator.inputCycleState.step, "DISPATCH");
});

test("application button handlers complete 25 cycles without a reload", async () => {
  const originalWindow=globalThis.window,originalDocument=globalThis.document;
  const buttons=new Map();
  class Button {addEventListener(type,handler){if(type==="click")this.handler=handler;}click(){this.handler();}}
  ["incidentBtn","prisonBtn","travelBtn","dispatchBtn","selectVehicleBtn","confirmVehicleBtn","cancelVehicleBtn","startRepositionBtn","cancelRepositionBtn","autoplayToggleBtn","resetBtn","failureResetBtn","failureNewSessionBtn","failureInspectBtn","applyConfigBtn","restoreDefaultsBtn"].forEach(id=>buttons.set(id,new Button()));
  globalThis.window={addEventListener(){}};globalThis.document={getElementById:id=>buttons.get(id)||null,querySelectorAll:()=>[]};
  try {
    const {App}=await import(`../js/app.js?buttons=${Date.now()}`),app=new App();
    app.ui={log(){},hideVehicleSelection(){},hideRepositioningFailure(){},setConfigValues(){},setPrisonConfigValues(){},updateModeConfigVisibility(){}};app.map={render(){}};app.sync=()=>{};
    app.engine.reset({operationMode:"automatic",vehiclesPerDistrict:fleet(5)});app.registerButtons();
    const pending=[];
    for(let cycle=1;cycle<=25;cycle++){
      for(const id of ["incidentBtn","prisonBtn","travelBtn","dispatchBtn"])buttons.get(id).click();
      const dispatch=[...app.engine.activeDispatches.values()].at(-1);assert.ok(dispatch,`cycle ${cycle}`);pending.push(dispatch);
      if(pending.length>=5)advanceMission(app.engine,pending.shift());
    }
    assert.equal(simulator.incidents.filter(i=>i.status==="OPEN").length,0);
  } finally {globalThis.window=originalWindow;globalThis.document=originalDocument;}
});
