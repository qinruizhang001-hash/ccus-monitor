import assert from "node:assert/strict";
import test from "node:test";
import { buildShiftHandover } from "./handover";
import { getMassBalance, getPlumeDemo, linepackTonnes, OPS_FIXTURE, plumeRadiusM, rollingTonnes } from "./inventory";
import { series } from "../telemetry";

test("rolling mass imbalance follows the documented formula", () => {
  const mass = getMassBalance();
  const captured = Math.round(rollingTonnes(series.captureFlow) * 10) / 10;
  const injected = Math.round(rollingTonnes(series.injection) * 10) / 10;
  assert.equal(mass.captured_t, captured);
  assert.equal(mass.injected_rolling_t, injected);
  assert.equal(mass.injected_cumulative_t, null);
  assert.equal(mass.injected_cumulative_label, "未知/需接入数据源");
  assert.equal(mass.imbalance_t, Math.round((captured - injected - OPS_FIXTURE.linepack.delta_linepack_t) * 10) / 10);
  assert.ok(mass.formula.includes("π"));
  assert.equal(mass.label, "演示质量衡算");
});

test("linepack uses the cylinder formula and the stated density", () => {
  const { diameter_m, length_m, density_kg_m3 } = OPS_FIXTURE.linepack;
  const expected = (Math.PI * (diameter_m / 2) ** 2 * length_m * density_kg_m3) / 1000;
  assert.ok(Math.abs(linepackTonnes() - expected) < 1e-9);
});

test("plume radius matches the radial volume balance and is not the snapshot reading", () => {
  const plume = getPlumeDemo();
  const base = plume.scenarios.find((item) => item.id === "base");
  const thinner = plume.scenarios.find((item) => item.id === "thinner");
  assert.ok(base && thinner);
  const hours = OPS_FIXTURE.plume.elapsed_hours;
  const expected = plumeRadiusM(hours, 0.35);
  assert.ok(Math.abs(base.radius_at_elapsed_m - Math.round(expected * 10) / 10) < 1e-9);
  const ratio = thinner.radius_at_elapsed_m / base.radius_at_elapsed_m;
  assert.ok(Math.abs(ratio - Math.sqrt(0.35 / 0.25)) < 0.01);
  assert.notEqual(base.radius_at_elapsed_m, plume.reported_plume_m);
  assert.equal(plume.pressure_footprint_m, null);
  assert.match(plume.pressure_note, /未知\/需接入数据源/);
  assert.match(plume.not_a_simulator, /不是油藏模拟器/);
});

test("handover states it is not a regulatory filing", () => {
  const note = buildShiftHandover({
    alerts: [{ id: "ALM-2041", title: "GW-07 浅层二氧化碳异常", severity: "critical" }],
    hitl: [],
    health: { summary: "评估服务演示。", reachable: true, mock: true },
  });
  assert.match(note.markdown, /本交接不是监管报送/);
  assert.match(note.markdown, /不得替代持证工程师签字/);
  assert.match(note.markdown, /未知\/需接入数据源/);
  assert.equal(note.markdown.includes("10.9999/fake"), false);
  assert.match(note.summary, /ALM-2041|严重告警 1/);
});
