import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseLocale, code, errorNote, localeFromLanguage, parseNote, t } from "../lib/i18n.ts";

describe("interface language", () => {
  it("keeps a saved choice, then follows the browser language", () => {
    assert.equal(chooseLocale("en", "zh-CN"), "en");
    assert.equal(chooseLocale("zh", "en-US"), "zh");
    assert.equal(chooseLocale(null, "zh-Hans"), "zh");
    assert.equal(chooseLocale(null, "zh"), "zh");
    assert.equal(chooseLocale("", "en-US"), "en");
    assert.equal(localeFromLanguage("fr-FR"), "en");
    assert.equal(localeFromLanguage(undefined), "en");
  });

  it("leaves the Chinese copy unchanged and fills placeholders", () => {
    assert.equal(t("zh", "reset"), "恢复默认");
    assert.equal(t("zh", "err.noPlayer"), "没有这个玩家。");
    assert.equal(t("zh", "savedPose", { name: "挥手" }), "已保存「挥手」。");
    assert.equal(t("en", "reset"), "Reset");
    assert.equal(t("en", "err.presetName", { n: 2 }), "Pose 2 needs a name of 1–24 characters.");
  });

  it("turns an error code back into the active language", () => {
    const packed = code("err.presetJoints", { name: "Sit" });
    assert.equal(parseNote(packed)?.key, "err.presetJoints");
    assert.equal(t("en", errorNote(new Error(packed), "err.export").key, errorNote(new Error(packed), "err.export").vars), "“Sit” is missing a joint, or a joint is outside the slider range.");
    assert.equal(errorNote(new Error("nope"), "err.export").key, "err.export");
  });
});
