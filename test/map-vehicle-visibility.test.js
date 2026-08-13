import test from "node:test";
import assert from "node:assert/strict";

import { Engine } from "../js/engine.js";
import { simulator, vehicles } from "../js/data.js";
import { MapView } from "../js/map.js";

class FakeVehicleElement {
    constructor() {
        this.attributes = {};
        this.style = {};
        this.symbol = { style: {} };
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    querySelector(selector) { return selector === ".vehicle-symbol" ? this.symbol : null; }
}

test("SVG layers render complete vehicles above district labels and below incidents", () => {
    const originalDocument = globalThis.document;
    const layerIds = [];
    const svg = {
        setAttribute() {},
        classList: { add() {} },
        appendChild(layer) { layerIds.push(layer.attributes.id); }
    };
    const container = { appendChild() {} };

    globalThis.document = {
        createElementNS(_namespace, name) {
            if (name === "svg") return svg;
            return {
                attributes: {},
                setAttribute(attribute, value) { this.attributes[attribute] = value; },
                addEventListener() {}
            };
        }
    };

    try {
        MapView.prototype.createSVG.call({
            width: 1100,
            height: 800,
            container,
            createLayer: MapView.prototype.createLayer,
            handleRepositionTargetSelection() {}
        });
    } finally {
        globalThis.document = originalDocument;
    }

    assert.deepEqual(layerIds, [
        "routes",
        "hotzones",
        "districts",
        "prisons",
        "labels",
        "vehicles",
        "incidents",
        "interaction"
    ]);
});

test("BUSY vehicles are non-rendered and non-interactive until RETURNING", () => {
    const engine = new Engine();
    engine.reset({ operationMode: "manualVehicle" });
    const vehicle = vehicles[0];
    const element = new FakeVehicleElement();

    simulator.vehicleSelection.selectedVehicleIds = [vehicle.id];
    vehicle.status = "BUSY";
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y);

    assert.equal(element.style.display, "none");
    assert.equal(element.style.pointerEvents, "none");
    assert.equal(element.attributes["aria-hidden"], "true");
    assert.equal(element.attributes.tabindex, "-1");
    assert.doesNotMatch(element.attributes.class, /vehicle--selectable|vehicle--selected/);

    const detentionPosition = { x: vehicle.x, y: vehicle.y };
    vehicle.status = "RETURNING";
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y);

    assert.equal(element.style.display, "");
    assert.equal(element.style.pointerEvents, "");
    assert.equal(element.attributes["aria-hidden"], undefined);
    assert.match(element.attributes.class, /returning/);
    assert.deepEqual({ x: vehicle.x, y: vehicle.y }, detentionPosition);
});
