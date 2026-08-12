import test from "node:test";
import assert from "node:assert/strict";

import { repositionRules } from "../js/map.js";

test("repositioning rules are maintained in one ordered configuration", () => {
    assert.deepEqual(
        repositionRules.map(({ number, title }) => ({ number, title })),
        [
            { number: 1, title: "Van binnen naar buiten" },
            { number: 2, title: "Hotzones goed gedekt" },
            { number: 3, title: "Nog aan te vullen" },
            { number: 4, title: "Meer info" }
        ]
    );
    assert.equal(repositionRules[2].placeholder, true);
    assert.equal(repositionRules[3].expandable, true);
    assert.match(repositionRules[3].description, /automatische als handmatige herpositionering/);
});
