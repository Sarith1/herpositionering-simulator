import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("every configuration section offers hover and keyboard-accessible information", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const section of ["Sessie", "Hotzones", "Cellencomplexen", "Werkwijze", "Automatische meldingen", "Meldingen"]) {
    assert.match(html, new RegExp(`<h3>${section} <span class="config-info" tabindex="0"[^>]+data-tooltip="[^"]+">i</span></h3>`));
  }
  const css = await readFile(new URL("../css/main.css", import.meta.url), "utf8");
  assert.match(css, /\.config-info:hover::after,\.config-info:focus-visible::after/);
});
