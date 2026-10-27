import assert from "node:assert/strict";
import test from "node:test";
import { attemptsFor, fetchUpstream } from "./retry";

function stubFetch(handler: () => Promise<Response>) {
  const original = globalThis.fetch;
  const calls: number[] = [];
  globalThis.fetch = (async () => {
    calls.push(Date.now());
    return handler();
  }) as unknown as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function timeoutError() {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

test("approve is at most once, even when the caller asks for more", () => {
  assert.equal(attemptsFor("approve"), 1);
  assert.equal(attemptsFor("approve", 5), 1);
  assert.equal(attemptsFor("read"), 3);
  assert.equal(attemptsFor("post"), 2);
  assert.equal(attemptsFor("post", 4), 4);
  assert.equal(attemptsFor("read", 0), 1);
});

test("an approve request that times out is not retried", async () => {
  // 超时时客户端无法区分「请求没到上游」和「到了、也执行了、只是响应没回来」。
  // 默认重试等于赌是第一种；赌错就是同一个 thread 被批两次。
  const stub = stubFetch(async () => {
    throw timeoutError();
  });
  try {
    await assert.rejects(fetchUpstream("http://upstream/api/approve", {}, { mode: "approve", timeoutMs: 5 }));
    assert.equal(stub.calls.length, 1, "批准请求超时后只能试一次");
  } finally {
    stub.restore();
  }
});

test("an approve request is not retried even when the caller passes a bigger budget", async () => {
  const stub = stubFetch(async () => {
    throw timeoutError();
  });
  try {
    await assert.rejects(
      fetchUpstream("http://upstream/api/approve", {}, { mode: "approve", attempts: 4, timeoutMs: 5 }),
    );
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test("an approve request returns a 503 as-is instead of replaying it", async () => {
  const stub = stubFetch(async () => new Response("{}", { status: 503 }));
  try {
    const response = await fetchUpstream("http://upstream/api/approve", {}, { mode: "approve", timeoutMs: 5 });
    assert.equal(response.status, 503);
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test("a post that times out is not retried, because it may already be running", async () => {
  const stub = stubFetch(async () => {
    throw timeoutError();
  });
  try {
    await assert.rejects(fetchUpstream("http://upstream/api/analyze", {}, { mode: "post", timeoutMs: 5 }));
    assert.equal(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

test("a read that times out is retried, because reads are idempotent", async () => {
  const stub = stubFetch(async () => {
    throw timeoutError();
  });
  try {
    await assert.rejects(fetchUpstream("http://upstream/health", {}, { mode: "read", attempts: 2, timeoutMs: 5 }));
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});

test("a read request does retry a 503, because reads are idempotent", async () => {
  const stub = stubFetch(async () => new Response("{}", { status: 503 }));
  try {
    const response = await fetchUpstream("http://upstream/api/health", {}, { mode: "read", attempts: 2, timeoutMs: 5 });
    assert.equal(response.status, 503);
    assert.equal(stub.calls.length, 2);
  } finally {
    stub.restore();
  }
});
