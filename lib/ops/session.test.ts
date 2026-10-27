import assert from "node:assert/strict";
import test from "node:test";
import { denialMessage, opsSession } from "./session";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("an unset CCUS_ROLE keeps the documented default", () => {
  withEnv({ CCUS_ROLE: undefined, CCUS_OPERATOR_NAME: undefined }, () => {
    const session = opsSession();
    assert.equal(session.role, "operator");
    assert.equal(session.actor, "值班员");
    assert.equal(session.rejectedRole, undefined);
  });
});

test("a known role is taken as written, in any case", () => {
  withEnv({ CCUS_ROLE: "viewer", CCUS_OPERATOR_NAME: undefined }, () => {
    assert.equal(opsSession().role, "viewer");
  });
  withEnv({ CCUS_ROLE: "  OPERATOR  ", CCUS_OPERATOR_NAME: undefined }, () => {
    assert.equal(opsSession().role, "operator");
  });
});

test("an unrecognised role degrades to viewer instead of escalating to operator", () => {
  // 一个想设成观察员的部署，因为少写一个字母，不该拿到批准 HITL 的权力。
  // 第一版写的是 `raw === "viewer" ? "viewer" : "operator"`，于是下面每一个都会变成最高权限。
  for (const typo of ["operater", "admin", "值班员", "root", "viewer2", "Operator!"]) {
    withEnv({ CCUS_ROLE: typo, CCUS_OPERATOR_NAME: undefined }, () => {
      const session = opsSession();
      assert.equal(session.role, "viewer", `CCUS_ROLE=${typo} 必须降级`);
      assert.equal(session.rejectedRole, typo, `CCUS_ROLE=${typo} 必须把原值带出来`);
    });
  }
});

test("the actor name comes from CCUS_OPERATOR_NAME when it is set", () => {
  withEnv({ CCUS_ROLE: "viewer", CCUS_OPERATOR_NAME: "  张工  " }, () => {
    assert.equal(opsSession().actor, "张工");
  });
  withEnv({ CCUS_ROLE: "viewer", CCUS_OPERATOR_NAME: "   " }, () => {
    assert.equal(opsSession().actor, "观察员");
  });
});

test("the denial message explains a rejected role, and stays quiet otherwise", () => {
  withEnv({ CCUS_ROLE: "operater", CCUS_OPERATOR_NAME: undefined }, () => {
    const text = denialMessage("当前是观察员，不能批准 HITL。");
    assert.match(text, /CCUS_ROLE=operater/);
    assert.match(text, /已按观察员处理/);
  });
  withEnv({ CCUS_ROLE: "viewer", CCUS_OPERATOR_NAME: undefined }, () => {
    const text = denialMessage("当前是观察员，不能批准 HITL。");
    assert.equal(text, "当前是观察员，不能批准 HITL。");
  });
});
