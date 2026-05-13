import { describe, it, expect } from "vitest";
import { scoreDeck } from "./index.js";
import { aggroVoltronFixture } from "./fixtures/aggro-voltron.resolved.js";
import { controlFixture } from "./fixtures/control.resolved.js";
import { comboFixture } from "./fixtures/combo.resolved.js";

describe("CrispiReport snapshots", () => {
  it("scores the aggro/voltron fixture", () => {
    expect(scoreDeck(aggroVoltronFixture, { archetypeOverride: "aggro/voltron" })).toMatchSnapshot();
  });

  it("scores the control fixture", () => {
    expect(scoreDeck(controlFixture, { archetypeOverride: "control" })).toMatchSnapshot();
  });

  it("scores the combo fixture", () => {
    expect(scoreDeck(comboFixture, { archetypeOverride: "combo" })).toMatchSnapshot();
  });
});
