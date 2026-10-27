"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel max-w-lg rounded-xl p-6">
      <h1 className="text-lg font-semibold">这一页没有加载出来</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        监测快照仍在本地。可以重试。评估技能要连 petro-rag-agent 时，那个服务需要在运行。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        重试
      </button>
    </div>
  );
}
