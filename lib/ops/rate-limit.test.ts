import assert from "node:assert/strict";
import test from "node:test";
import { riskIntervalMs, takeRateLimit } from "./rate-limit";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("the first call for a key goes through", () => {
  const result = takeRateLimit("first", 1_000);
  assert.equal(result.ok, true);
});

test("a second call inside the window is refused and reports how long to wait", () => {
  takeRateLimit("burst", 5_000);
  const second = takeRateLimit("burst", 5_000);
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.ok(second.retryAfterMs > 0);
    assert.ok(second.retryAfterMs <= 5_000);
  }
});

test("keys do not share a window", () => {
  takeRateLimit("a", 5_000);
  assert.equal(takeRateLimit("b", 5_000).ok, true);
});

test("the window reopens after the interval", async () => {
  takeRateLimit("slow", 30);
  await sleep(40);
  assert.equal(takeRateLimit("slow", 30).ok, true);
});

test("a refused call does not extend the window", async () => {
  // 拒绝不能刷新计时：否则连点会把下一次合法请求越推越远。
  takeRateLimit("hold", 60);
  await sleep(20);
  assert.equal(takeRateLimit("hold", 60).ok, false);
  await sleep(45);
  assert.equal(takeRateLimit("hold", 60).ok, true);
});

test("the configured interval is clamped to a sane floor", () => {
  const saved = process.env.CCUS_RISK_MIN_INTERVAL_MS;
  try {
    process.env.CCUS_RISK_MIN_INTERVAL_MS = "10";
    assert.equal(riskIntervalMs(), 20_000);
    process.env.CCUS_RISK_MIN_INTERVAL_MS = "45000";
    assert.equal(riskIntervalMs(), 45_000);
    process.env.CCUS_RISK_MIN_INTERVAL_MS = "abc";
    assert.equal(riskIntervalMs(), 20_000);
    delete process.env.CCUS_RISK_MIN_INTERVAL_MS;
    assert.equal(riskIntervalMs(), 20_000);
  } finally {
    if (saved === undefined) delete process.env.CCUS_RISK_MIN_INTERVAL_MS;
    else process.env.CCUS_RISK_MIN_INTERVAL_MS = saved;
  }
});
