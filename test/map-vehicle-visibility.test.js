import test from "node:test";
import assert from "node:assert/strict";

import { Engine } from "../js/engine.js";
import { simulator, vehicles } from "../js/data.js";
import {
    DISTRICT_VISUAL_RADIUS,
    getVehicleSlotOffset,
    isVehicleVisible,
    MapView,
    ON_SCENE_VISIBLE_MS,
    VEHICLE_HIT_RADIUS,
    ORIGINAL_VEHICLE_SLOT_DISTANCE,
    VEHICLE_SLOT_DISTANCE,
    VEHICLE_VISUAL_RING_RADIUS
} from "../js/map.js";

class FakeVehicleElement {
    constructor() {
        this.attributes = {};
        this.style = {};
        this.symbol = { style: {} };
        this.callsign = {
            classList: {
                special: false,
                toggle(_className, enabled) { this.special = enabled; }
            },
            textContent: ""
        };
        this.badge = { attributes: {}, textContent: "", setAttribute(name, value) { this.attributes[name] = value; } };
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    querySelector(selector) {
        if (selector === ".vehicle-symbol") return this.symbol;
        if (selector === ".vehicle-callsign") return this.callsign;
        if (selector === ".vehicle-status-badge") return this.badge;
        return null;
    }
}

test("vehicle clusters use a compact visual ring without shrinking their hit area", () => {
    assert.equal(VEHICLE_VISUAL_RING_RADIUS, 15.5);
    assert.equal(VEHICLE_SLOT_DISTANCE, ORIGINAL_VEHICLE_SLOT_DISTANCE * 0.9);
    assert.equal(VEHICLE_SLOT_DISTANCE, 48.6);
    assert.equal(VEHICLE_HIT_RADIUS, 25);
    assert.ok(VEHICLE_HIT_RADIUS > VEHICLE_VISUAL_RING_RADIUS);
});

test("maximum district vehicle counts fit on two compact slot rings", () => {
    const distances = Array.from({ length: 11 }, (_, index) => getVehicleSlotOffset(index, 11).radius);
    assert.deepEqual([...new Set(distances)], [48.6, 81.6]);
    assert.equal(distances.filter(distance => distance === 48.6).length, 5);
    assert.equal(distances.filter(distance => distance === 81.6).length, 6);
});

test("vehicle slots evenly cover 360 degrees for every supported cluster size", () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 11]) {
        const offsets = Array.from({ length: count }, (_, index) => getVehicleSlotOffset(index, count));
        const ringSizes = count <= 6 ? [count] : [Math.floor(count / 2), Math.ceil(count / 2)];
        let start = 0;
        for (const ringSize of ringSizes) {
            const ring = offsets.slice(start, start + ringSize);
            const angles = ring.map(({ x, y }) => Math.atan2(y, x));
            const gaps = angles.map((angle, index) => {
                const next = angles[(index + 1) % angles.length];
                return (next - angle + Math.PI * 2) % (Math.PI * 2);
            });
            if (ringSize > 1) gaps.forEach(gap => assert.ok(Math.abs(gap - Math.PI * 2 / ringSize) < 1e-10));
            start += ringSize;
        }
    }
});

test("only RT1101 and RT5103 receive the special callsign style", () => {
    const engine = new Engine();
    engine.reset({ vehiclesPerDistrict: { RN: 8, RS: 3, RO: 5, RZ: 7, RZW: 8, ZHZ: 11, ZH: 4 } });

    for (const vehicle of vehicles) {
        const element = new FakeVehicleElement();
        MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y);
        assert.equal(
            element.callsign.classList.special,
            vehicle.id === "RT1101" || vehicle.id === "RT5103",
            `${vehicle.id} has the expected callsign style`
        );
    }
});

test("vehicle icon, callsign and selection group stay upright while moving", () => {
    const engine = new Engine();
    engine.reset();
    const vehicle = vehicles[0];
    const element = new FakeVehicleElement();

    vehicle.angle = 137;
    MapView.prototype.updateVehicleElement(element, vehicle, 321, 456);

    assert.equal(element.attributes.transform, "translate(321 456)");
    assert.doesNotMatch(element.attributes.transform, /rotate/);
});

test("vehicles show textual CEL and TERUG direction badges without changing callsigns", () => {
    const engine = new Engine();
    engine.reset();
    const vehicle = vehicles[0];
    const element = new FakeVehicleElement();

    vehicle.status = "TO_PRISON";
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y);
    assert.equal(element.badge.textContent, "CEL");
    assert.match(element.badge.attributes.class, /vehicle-status-badge--cel/);

    vehicle.status = "RETURNING";
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y);
    assert.equal(element.badge.textContent, "TERUG");
    assert.match(element.badge.attributes.class, /vehicle-status-badge--terug/);

    vehicle.status = "AVAILABLE";
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y);
    assert.equal(element.badge.textContent, "");
});

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

test("ON_SCENE vehicles disappear two seconds after their own arrival and reappear when returning", () => {
    const engine = new Engine();
    engine.reset();
    const vehicle = vehicles[0];
    const element = new FakeVehicleElement();
    vehicle.status = "ON_SCENE";
    vehicle.onSceneArrivedAt = 1000;

    assert.equal(isVehicleVisible(vehicle, 1000 + ON_SCENE_VISIBLE_MS - 1), true);
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y, 1000 + ON_SCENE_VISIBLE_MS);
    assert.equal(element.style.display, "none");
    assert.equal(element.style.pointerEvents, "none");
    assert.equal(element.attributes["aria-hidden"], "true");
    assert.equal(element.attributes.tabindex, "-1");

    vehicle.status = "RETURNING";
    delete vehicle.onSceneArrivedAt;
    MapView.prototype.updateVehicleElement(element, vehicle, vehicle.x, vehicle.y, 5000);
    assert.equal(element.style.display, "");
    assert.equal(element.style.pointerEvents, "");
    assert.equal(element.attributes["aria-hidden"], undefined);
});
