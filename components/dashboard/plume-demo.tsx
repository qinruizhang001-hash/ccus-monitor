import { getPlumeDemo, OPS_FIXTURE } from "@/lib/ops/inventory";
import { RESEARCH_FIXTURE } from "@/lib/research/notes";
import { plant } from "@/lib/telemetry";

export function PlumeDemo({ compact = false }: { compact?: boolean }) {
  const plume = getPlumeDemo();
  const note = RESEARCH_FIXTURE.notes.find((item) => item.id === plume.citation_id);
  const base = plume.scenarios.find((item) => item.id === "base");
  const other = plume.scenarios.find((item) => item.id === "thinner");
  if (compact) {
    return (
      <section className="panel rounded-xl p-4">
        <h2 className="text-sm font-medium">教学羽流</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {plume.model_id} · 基线 {base?.radius_at_elapsed_m} m · 对照 {other?.radius_at_elapsed_m} m。快照另一读数 {plume.reported_plume_m} m。
          压力足迹：未知/需接入数据源。
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">{plume.not_a_simulator}</p>
      </section>
    );
  }
  const radii = plume.scenarios.map((item) => item.radius_at_elapsed_m);
  const max = Math.max(...radii, plume.reported_plume_m, 1);
  return (
    <section className="panel rounded-xl p-4">
      <h2 className="text-sm font-medium">教学羽流与压力足迹</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {plume.model_name}（{plume.model_id}）。{plume.style} {plume.not_a_simulator}
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[220px_1fr]">
        <svg viewBox="0 0 220 220" className="w-full" role="img" aria-label="教学羽流半径示意">
          <rect width="220" height="220" fill="transparent" />
          {plume.scenarios.map((scenario, index) => (
            <circle
              key={scenario.id}
              cx="110"
              cy="110"
              r={(scenario.radius_at_elapsed_m / max) * 96}
              fill={index === 0 ? "rgba(62,224,197,0.18)" : "none"}
              stroke={index === 0 ? "#3ee0c5" : "#ffd36a"}
              strokeWidth="1.5"
            />
          ))}
          <circle
            cx="110"
            cy="110"
            r={(plume.reported_plume_m / max) * 96}
            fill="none"
            stroke="#ffb4bc"
            strokeDasharray="3 3"
          />
          <circle cx="110" cy="110" r="3" fill="#3ee0c5" />
        </svg>
        <div className="text-xs leading-5 text-muted-foreground">
          <p className="font-mono text-[11px]">{plume.formula}</p>
          <ul className="mt-2 space-y-1">
            {plume.scenarios.map((scenario) => (
              <li key={scenario.id}>
                {scenario.label}：860 d 半径 {scenario.radius_at_elapsed_m} m
              </li>
            ))}
            <li>虚线 {plume.reported_plume_m} m：{plume.reported_plume_note}</li>
            <li>压力足迹：未知/需接入数据源。{plume.pressure_note}</li>
          </ul>
          <svg viewBox="0 0 280 88" className="mt-3 w-full" role="img" aria-label="羽流半径随教学时间">
            {plume.scenarios.map((scenario, index) => (
              <polyline
                key={scenario.id}
                fill="none"
                stroke={index === 0 ? "#3ee0c5" : "#ffd36a"}
                strokeWidth="2"
                points={spark(scenario.series.map((point) => point.radius_m))}
              />
            ))}
          </svg>
          <div className="flex justify-between font-mono text-[10px]">
            {base?.series.map((point) => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </div>
      </div>
      <dl className="mt-3 grid gap-1 text-[11px] leading-5 text-muted-foreground sm:grid-cols-2">
        <div>孔隙度 {plume.assumptions.phi} · 厚度 {plume.assumptions.thickness_m} m · 密度 {plume.assumptions.density_kg_m3} kg/m³</div>
        <div>
          速率 {plume.assumptions.rate_t_per_h} t/h · {plume.assumptions.rate_note}
        </div>
        <div>
          {plume.assumptions.elapsed_note} 对照只把饱和度从 {OPS_FIXTURE.plume.scenarios[0]?.saturation} 改到{" "}
          {OPS_FIXTURE.plume.scenarios[1]?.saturation}。
        </div>
        <div>
          文献 {note ? `${note.standard_id}${note.doi ? ` · DOI ${note.doi}` : " · DOI 未收录"}` : "未知/需接入数据源"} · 快照{" "}
          {plant.snapshotId} / {OPS_FIXTURE.snapshot_id}
          {note ? ` / ${RESEARCH_FIXTURE.fixture_id}` : ""}
        </div>
      </dl>
    </section>
  );
}

function spark(values: number[]) {
  const max = Math.max(...values, 1);
  const width = 280;
  const height = 72;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");
}
