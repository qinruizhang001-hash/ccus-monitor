# 碳衡 · CCUS 全流程监测

中文值班界面，用来看一条 CCUS 全流程示范链。站点里只有一个 AI 入口：「碳衡助手」。它是主管，按问题调用技能，不在界面上并列多个机器人。

监测数字是内置演示快照，不接现场 SCADA。封存风险评估不在这个仓库里重写：技能 `run_risk_assessment` 按 HTTP 调用 [petro-rag-agent](https://github.com/qinruizhang001-hash/petro-rag-agent) 已有的 FastAPI。那边的 LangGraph、LightRAG 和物理闸门都留在那个项目里。

## 模块

| 页面 | 看什么 |
| --- | --- |
| 总览 | 捕集 → 运输 → 注入封存 → MVA 的状态条、KPI、24 小时曲线、活跃告警、质量平衡 |
| 捕集 | 捕集率、再生能耗、烟气侧线与溶剂负荷 |
| 运输 | 首末站压力、B3 段压差、泄漏风险指数、站场 |
| 注入与封存 | 注入速率、井口/井底压力、库容。羽流半径是演示地质模型 |
| MVA 监测 | 传感器健康、GW-07 土壤气、微地震背景 |
| 告警 | 按严重级别和状态筛选，级别按钮带数量。点「交给碳衡助手」会打开助手并填入该告警 |
| 碳衡助手 | 唯一对话入口。主管调用技能后，在气泡里标出技能名和返回 |

演示工况（快照 2026-10-26 14:40）：捕集率约 91.4%，再生能耗 3.15 GJ/t（高于 2.70 的目标），管段 B3 压差 0.42 MPa，GW-07 土壤气 1240 ppm。

## 本地运行这个前端

需要 Node.js 22+。

```bash
cp .env.example .env.local
npm install
npm run dev
```

开发服务器默认在 <http://localhost:3000>。指定端口：

```bash
npm run dev -- --port 4317
```

生产构建：

```bash
npm run build
npm start
```

没有 petro-rag-agent 时，总览、工段和告警仍然可用。助手若调用风险评估技能，会显示明确的未连接说明。

## 架构：一个主管 + 技能

浏览器只和 `POST /api/assistant` 说话。这条路由是 Vercel AI SDK 的一个主管（`streamText` + 工具定义，系统提示是中文值班主管）。

配置了 `OPENAI_API_KEY` 时，由模型决定调用哪项技能。没配密钥时，同一条路由按问题在服务端直接调用同一套技能（界面标成「本地调度」），监测演示和技能卡片仍然可用。这不是第二个助手。

| 技能 | 做什么 |
| --- | --- |
| `get_overview` | 读演示总览：状态、KPI、质量平衡、活跃告警 |
| `get_segment_metrics` | 读捕集 / 运输 / 注入封存 / MVA 的指标 |
| `list_alerts` | 列出告警，可按严重级别、状态、工段 |
| `explain_alert` | 解释指定编号：读数、趋势、工段现状、不该过度推断的边界、核查步骤 |
| `run_risk_assessment` | 转发 petro-rag-agent `POST /api/analyze`，边收 SSE 边显示节点、物理/质量闸门和不确定性 |
| `check_backend_health` | `GET {BASE}/health` |
| `draft_ops_report` | 用当前演示 KPI 和告警在本地写中文值班日报，可下载 Markdown。不能代替持证工程师签字 |
| `ccus_research_notes` | 只读 `content/ccus-research-notes.json` 里的知识卡。没有核对到的 DOI 不写 |
| `grounding_check` | 出口核对。技能没返回的数字、井号、标准号改成「未知/需接入数据源」，并在回复下标出依据 |
| `get_mass_balance` | 演示质量衡算：滚动捕集、管存、滚动注入、已封存、不平衡。没有累计注入表就写未知 |
| `get_containment_status` | 一次井筒 / 二次盖层 / 三次监测。监测告警不是盖层失效 |
| `get_transport_integrity` | 首末站压力、管存、ESD/阀室、泄漏风险指数 |
| `get_plume_demo` | 教学径向体积衡算。不是油藏模拟器。压力足迹缺参数则为未知 |
| `draft_shift_handover` | 交接班 Markdown。不是监管报送 |

`/risk` 会转到 `/assistant`。风险评估卡片里可以另行发起人工复核（`POST /api/petro/hitl`、`GET /api/petro/review/:threadId`、`POST /api/petro/approve`）。流式评估返回的 `thread_id` 不能拿来批准。后端不在线时，这几步停在中文说明里，监测页照常。

总览上的「演示质量衡算」用 24 个小时点的捕集和注入求和，管存按圆柱体积和教学密度计算。公式在卡片里。累计注入计量表没有单独测点，显示未知。遏制盘把环空、盖层上方压力和土壤气分成一次井筒、二次盖层、三次监测。ALM-2041 只挂在三次监测。运输条只引用快照里的泄漏风险指数。注入页的羽流图是 `demo-radial-volume-20261027`，对照 Nordbotten、Celia、Bachu 2005 的径向展布思路，不是油藏模拟器；压力足迹缺渗透率，显示未知。交接班可以下载 Markdown，页上写明不是监管报送。

总览和工段页可以切换近 6 / 12 / 24 小时，并打开「演示刷新」：只轻微拨动曲线最后一个点，标明不是 SCADA。

## 一起跑 petro-rag-agent

那个仓库是本地优先的 CCUS 风险评估系统（LangGraph 多智能体 + LightRAG + FastAPI + Streamlit，Docker / nginx）。不要把 Python 工程拷进本仓库。

公开入口只有 nginx 的 **8080**：

- `/api/*` → FastAPI（`/api/*` 需要 `Authorization: Bearer <API_TOKEN>`，除非对方没设 token）
- `/health`、`/docs` → FastAPI，健康检查不鉴权
- 其余路径 → Streamlit

按对方 README 启动（需要 Docker、宿主机 Ollama，以及不在 git 里的 reranker 权重）：

```bash
git clone https://github.com/qinruizhang001-hash/petro-rag-agent.git
cd petro-rag-agent
# 编辑 .env.docker：API_TOKEN 换成随机串；CLOUD_API_KEY 可选
docker compose up -d --build
curl -s http://localhost:8080/health
```

然后在本仓库的 `.env.local` 里让两边对上：

```bash
PETRO_RAG_BASE_URL=http://localhost:8080
PETRO_RAG_API_TOKEN=与 API_TOKEN 相同的值
PETRO_RAG_MOCK=0
```

改完环境变量后重启 `npm run dev`。总览和顶栏会显示评估服务正常或降级（降级时进程还在，某个依赖探针失败）。

本站服务端转发这些接口，浏览器不持有 token：

| 本站 | 上游 |
| --- | --- |
| `POST /api/petro/analyze` | `POST /api/analyze`，SSE 原样转出去 |
| `POST /api/petro/hitl` | `POST /api/analyze/hitl` |
| `POST /api/petro/approve` | `POST /api/approve` |
| `GET /api/petro/review/:threadId` | `GET /api/review/:threadId` |
| `GET /api/petro/health` | 先 `GET {BASE}/health`，没有 JSON 再试 `/api/health` |
| `GET /api/petro/chart` | `GET {BASE}/charts/...`（经 8080 时 nginx 不一定转发 `/charts`，图可能只在直连 8000 时出现） |

助手里的风险评估技能会边收 SSE 边更新同一张技能卡片：节点进度、成稿片段、物理校验、质量闸门、不确定性。流式评估返回的 `thread_id` 不能拿来批准。卡片上的「发起人工复核」走 HITL 三个接口；服务不在线时显示未连接，不另开一个助手。一次完整评估在对方机器上常常要一两分钟以上。

直连 FastAPI 调试时，把 `PETRO_RAG_BASE_URL` 设为 `http://127.0.0.1:8000`。

## 不连后端时的演示流

```bash
PETRO_RAG_MOCK=1
```

此时风险评估技能不访问网络，按同样的 SSE 字段回一段标明「演示流」的报告，方便 `npm run build` 和界面联调。监测曲线不依赖这个开关。描述里写上 `400 bar` 或 `40 MPa` 时，演示流会走一条物理闸门阻断。

## 环境变量

见 `.env.example`。不要把 `.env.local` 或 token 提交到 git。

| 变量 | 作用 |
| --- | --- |
| `PETRO_RAG_BASE_URL` | petro-rag-agent 入口，默认 `http://localhost:8080` |
| `PETRO_RAG_API_TOKEN` | 对应上游 `API_TOKEN`，只在服务端 |
| `PETRO_RAG_MOCK` | `1` 为内置演示流 |
| `OPENAI_API_KEY` | 主管使用的模型密钥。留空则本地按意图调用技能 |
| `OPENAI_MODEL` | 默认 `gpt-4o-mini` |
| `OPENAI_BASE_URL` | 可选，兼容 OpenAI 接口的网关 |
| `CCUS_ROLE` | `operator`（默认）或 `viewer`。观察员不能批准 HITL，也不能确认严重告警。**写错的值一律按 `viewer` 处理**，见「权限」 |
| `CCUS_OPERATOR_NAME` | 写进审计的名字，默认值班员 |
| `CCUS_RISK_MIN_INTERVAL_MS` | 两次风险评估最短间隔，默认 20000 |
| `PETRO_RAG_HITL_TTL_MS` | HITL 待确认时限，默认 30 分钟。超时拒绝批准，不会自动通过 |

## 运维手册

这份界面可以放在 SCADA 旁边看，但**现在的曲线和 KPI 全是演示数据**。每块都标着「演示数据」、快照时间和 `Asia/Shanghai`。没有 OPC-UA，也没有 MQTT。要接现场，替换 `lib/ops/telemetry-source.ts` 里的读取实现，不要在页面上先写成实时。

### 部署

```bash
cp .env.example .env.local
# 编辑令牌、CCUS_ROLE、PETRO_RAG_MOCK
npm install
npm run build
npm start
```

进程起来后先看本站健康，而不是只看页面：

```bash
curl -s http://127.0.0.1:3000/api/health
```

`status` 为 `ok` 表示 Next 进程和评估依赖都正常。评估服务离线或降级时，本站仍返回 HTTP 200，`status` 为 `degraded`，`petro` 里有中文原因和恢复步骤。监测页继续用演示快照。

### 什么是演示，什么是上游

| 数据 | 现在 | 现场以后 |
| --- | --- | --- |
| 捕集、管输、注入、MVA、告警原文 | 仓库里的演示快照 | 替换 telemetry source。候选协议：OPC-UA（测点）、MQTT（告警） |
| 告警确认 / 静默 / 升级 | 本进程 `.data/alert-audit.jsonl`，只追加 | 仍可由本站记审计，测点复位必须走 SCADA |
| 标准与 MVA 知识卡 | `content/ccus-research-notes.json` | 不从对话里补论文或 DOI |
| 风险评估正文 | `PETRO_RAG_MOCK=1` 为内置演示流；`0` 为 petro-rag-agent | 同一套 HTTP，不在本仓库重写模型 |
| HITL 通过 / 驳回 | 只接受本进程登记过的 HITL 线程 | 上游 `/api/approve`。流式 `thread_id` 在这里直接 409 |

系统**不会自动批准**。演示流里的 `human_review.approved` 也是空的。

### 权限

`CCUS_ROLE=operator`：可以确认严重告警、静默、批准 HITL。  
`CCUS_ROLE=viewer`：可以看、可以升级、可以驳回；批准和严重告警确认会 403。改角色后要重启 Next。

**没设** `CCUS_ROLE` 走上面这个默认（operator）。**设了但认不出来**是另一回事：`operater`、`admin`、`值班员` 这些值一律按观察员处理，顶栏和告警页会显示「CCUS_ROLE=xxx 无法识别」。

为什么不能兜底成 operator：一个想设成观察员的部署，因为少写一个字母，反而拿到批准 HITL 和确认严重告警的权力 —— 而这不会报错、不会写日志、界面上一切正常。认不出来的值和「没配」不是同一种状态，不能合并成一个分支。

告警卡片获得焦点后：`A` 确认，`E` 升级，`S` 打开静默确认。静默必须写原因。严重告警还要勾选第二次核对，并输入告警编号，服务端核对 `confirm === 告警编号` 且 `secondConfirm === true`。默认静默 8 小时。到期后界面显示「静默已到期（日志未改写）」，不会回写旧行。静默不会清测点。

审计文件是 `.data/alert-audit.jsonl`。每一行有 `seq`、`at`、`alertId`、`action`、`actor`、`role`、`note`、`silencedUntil`、`confirm`、`secondConfirm`、`prevHash`、`hash`。旧的 `.data/alert-ops.json` 若还在，且 jsonl 为空，会按时间顺序导入一次，原文件保留。

#### 哈希链是校验过的，不只是写下来的

写入时算 `sha256` 和 `prevHash` 只保证「写的时候是这样」。**读的时候必须重算**，否则那两列只是日志里的两串十六进制。`verifyChain()` 三条都查，缺一条就有一种篡改能通过：

| 查什么 | 抓什么 |
| --- | --- |
| 重算摘要 | 改一行里的任何字段（例如把 `ack` 改成 `escalate`） |
| `prevHash` 是否等于上一行的 `hash` | 换掉某行的 `hash`、掐头去尾 |
| `seq` 是否从 1 连续递增 | 删掉一行、把两行换顺序 |

三条都不通过时的行为：

- `GET /api/ops/alerts` 的响应带 `chain: { ok, lines, malformed, brokenAt, reason }`。`chain` 为 `null` 表示还没读到，**不等于正常**。
- 告警页顶部出现红色横幅，写明断在第几行、为什么。CSV 导出多一列 `audit_chain`，正常时是 `ok(12)`，断链时是 `broken@3`。
- **拒绝继续追加**：往断链上再写一行，等于给前面所有行背书，新行的 `prevHash` 会指向最后一条「看起来有效」的行，断裂处被盖在中间，之后再也验不出来。处置请求会返回 500 `audit_chain_broken` 并说明怎么处理。
- 读不出来的行（写到一半断电）计入 `malformed` 并指出行号，不会被当成空行跳过。审计链上「谁在什么时候基于什么理由做了什么」，坏行恰恰是最该被看见的那一行。

链条坏了怎么办：先备份文件，再逐行核对。不要直接删掉坏行 —— 删掉也验不过，`seq` 会断。要重建，得从断点之后重算所有 `prevHash` 与 `hash`，并且明确记下这是一次重建。

知识卡快照是 `ccus-notes-fixture-20261027`。演示遥测快照是 `demo-bx-ccus-20261026T1440+08`。助手正文里的数字必须能对上技能返回或这两份快照。对不上就写「未知/需接入数据源」。风险评估只转述 petro-rag-agent 或演示流返回的字段。质量闸门通过也不等于持证工程师签字。

### 自检

```bash
npm run typecheck   # next typegen && tsc --noEmit
npm run lint
npm test            # 收集 lib/ app/ components/ 下的 *.test.ts
npm run licenses    # 441 个依赖的许可证
npm run build
npm run verify      # 前三条一起跑
```

`typecheck` 必须先 `next typegen`：Next 16 把 `LayoutProps<"/">` 这类全局类型写进 `.next/types`，干净检出里没有它，直接 `tsc --noEmit` 一定报 `TS2304`。这不是类型错误，是少跑了一步生成。

测试共 56 项，覆盖：审计链的三条篡改路径与坏行计数、拒绝追加、HITL 状态机的每个出口（未登记 / 分析流 / 超时 410 / 已通过 409 / 失败态 409 / 驳回后可再批）、角色兜底方向、批准与流式评估「至多一次」、限频窗口、意图路由不会返回空技能表、质量衡算与羽流公式、出口数字核对。

许可证审计在 441 个包里查强 copyleft（AGPL / GPL / SSPL）。这件事不会在 `npm install` 时报警，也不会出现在任何构建日志里，只会在分发打包产物的那天变成法务问题。

### 风险评估和 HITL

1. 技能或 `POST /api/petro/analyze` 走 SSE。卡片上的请求号（`req_...`）和响应头 `X-Request-Id` 是同一次调用。
2. 20 秒内重复评估会被拒绝。这是限频，不是新的结论。
3. 流中断、超时、401、上游离线：中文说明加恢复步骤，没有 `done` 就没有结论。
4. 分析流的 `thread_id` 记成 `analyze`。`POST /api/petro/approve` 看到它，或者根本不认识它，都拒绝。
5. 「发起人工复核」才登记 HITL，状态是待确认。驳回后仍可再确认。通过前界面会再问一次。
6. 超过 `PETRO_RAG_HITL_TTL_MS` 变为超时，不能补批。

令牌缺失或 401：核对服务端 `PETRO_RAG_API_TOKEN`，不要把令牌放到浏览器。

批准请求**只发一次**，任何失败都不重试 —— 包括超时。超时的时候客户端没法区分「请求没到上游」和「到了、也执行了、只是响应没回来」，默认重试等于赌是前一种；赌错就是同一个 thread 被批两次。

同样的规则适用于流式评估和发起 HITL：**超时和网络中断不重试**，只有收到 5xx 才重发（那种情况请求确实没被处理）。健康检查和读取则什么都会重试，按 0.4s、1.2s、2.8s 退避，因为读是幂等的。批准超时后的正确动作是去上游查这个 thread 的状态，不是再点一次。

### 备份

HITL 登记在 `.data/hitl-threads.json`，告警审计在 `.data/alert-audit.jsonl`。这些文件都不要提交。迁机器或重启前拷走整个 `.data/`。文件在而演示进程重启后，HITL 仍按原线程拒绝分析流、允许已登记的 HITL；演示报告正文需要文件里还留着当时的输入。没有这份文件时，旧线程一律不能批准，应重新发起。jsonl 只追加，备份时不要改行。

告警 CSV：告警页「导出 CSV」，或 `GET /api/ops/alerts/export`。值班日报仍可下载 Markdown；卡片上的「打印 / PDF」用浏览器的打印对话框另存为 PDF。

## 技术栈

Next.js（App Router）+ TypeScript + Tailwind CSS + Vercel AI SDK。界面零件按 shadcn 的方式用 Radix 和 `class-variance-authority` 写。曲线用 Recharts。
