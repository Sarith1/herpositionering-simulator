import test from "node:test";
import assert from "node:assert/strict";

import { detentionComplexes, districts, getDetentionComplexPosition } from "../js/data.js";
import { MapView } from "../js/map.js";

test("detention complexes have fixed public names", () => {
    assert.deepEqual(detentionComplexes.map(complex => complex.name), ["Zuidplein", "Marconiplein", "Dordrecht"]);
});

test("visual and routing destinations share official complex coordinates", () => {
    detentionComplexes.forEach(complex => {
        assert.deepEqual(MapView.prototype.getDetentionComplexPosition.call({}, complex), { x: complex.x, y: complex.y });
    });
});

test("Zuidplein is positioned between Rotterdam-Stad and Marconiplein", () => {
    const rotterdam = districts.find(district => district.id === "RS");
    const zuidplein = getDetentionComplexPosition(detentionComplexes[0]);
    const marconiplein = getDetentionComplexPosition(detentionComplexes[1]);
    const expected = { x: rotterdam.x * .55 + marconiplein.x * .45, y: rotterdam.y * .55 + marconiplein.y * .45 };
    assert.ok(Math.hypot(zuidplein.x - expected.x, zuidplein.y - expected.y) < 2);
});

test("detention complex visuals are clamped inside the right map boundary", () => {
    const position = MapView.prototype.getDetentionComplexPosition.call(
        { width: 1100 },
        { x: 1080, y: 200 }
    );

    assert.deepEqual(position, { x: 1052, y: 200 });
});
