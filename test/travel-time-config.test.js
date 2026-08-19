import test from "node:test";
import assert from "node:assert/strict";

import { calculateTravelTimeForRange } from "../js/routing.js";
test("configured travel-time ranges bound every base calculation", () => {
    for (const [min, max] of [[90, 120], [30, 45], [150, 180]]) {
        for (let distance = 1; distance <= 6; distance += 1) {
            for (const random of [0, 0.25, 0.5, 0.75, 0.999]) {
                const route = Array.from({ length: distance + 1 }, (_, index) => String(index));
                const value = calculateTravelTimeForRange(route, min, max, () => random);
                assert.ok(value >= min && value <= max, `${value} is within ${min}–${max}`);
            }
        }
    }
});

test("long routes trend toward the configured maximum", () => {
    const short = calculateTravelTimeForRange(["A", "B"], 30, 180, () => 0.5);
    const far = calculateTravelTimeForRange(["A", "B", "C", "D", "E"], 30, 180, () => 0.5);
    assert.ok(far > short);
    assert.equal(far, 180);
});
