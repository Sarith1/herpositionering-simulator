import test from "node:test";
import assert from "node:assert/strict";

import { detentionComplexes } from "../js/data.js";
import { DETENTION_COMPLEX_OFFSET_X, MapView } from "../js/map.js";

test("all detention complexes use the same visual offset without changing their routing coordinates", () => {
    const map = { width: 1100 };

    detentionComplexes.forEach(complex => {
        const routingCoordinates = { x: complex.x, y: complex.y };
        const position = MapView.prototype.getDetentionComplexPosition.call(map, complex);

        assert.deepEqual(position, {
            x: complex.x + DETENTION_COMPLEX_OFFSET_X,
            y: complex.y - 62
        });
        assert.deepEqual(
            { x: complex.x, y: complex.y },
            routingCoordinates,
            `${complex.name} must retain its operational coordinates`
        );
    });
});

test("detention complex visuals are clamped inside the right map boundary", () => {
    const position = MapView.prototype.getDetentionComplexPosition.call(
        { width: 1100 },
        { x: 1080, y: 200 }
    );

    assert.deepEqual(position, { x: 1052, y: 138 });
});
