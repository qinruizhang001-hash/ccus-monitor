/**
 * The only telemetry backing this build.
 * Pages must keep labeling it 演示数据. Do not imply a live SCADA link.
 *
 * Field replacement later: implement the same read functions behind this module.
 * Candidate protocols are OPC-UA for segment tags and MQTT for alarm events.
 * This build does not open either protocol.
 */
export const telemetrySource = {
  kind: "demo" as const,
  connected: false,
  label: "演示数据",
  scada: false,
  protocols: [] as const,
};

export const TELEMETRY_EXTENSION =
  "现场接入时替换 lib/ops/telemetry-source.ts。候选是 OPC-UA（工段测点、设备状态）和 MQTT（告警与心跳）。本构建没有这两种连接器。";
