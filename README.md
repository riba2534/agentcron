# AgentCron

本机部署的 Web App，用一句自然语言给 AI 配定时任务。

> 项目 codename / 内部包名 / CLI 命令保留 `cct` 前缀（`cct-runner` / `cct-doctor` / `~/.cct/` / `@cct/*` packages）以保证与既有数据库、调度记录兼容。

## 概览

- **自然语言 → 多轮澄清 → 结构化 task spec**：把模糊需求落到确定的 cron + prompt + 模型
- **跨平台调度**：macOS 用 `launchd` plist，Linux 用 `crontab` 区段，对用户视角统一
- **多模型路由**：在 `/settings/models` 手动添加 ANTHROPIC_BASE_URL / TOKEN / MODEL 配置，按任务挑模型
- **单机单用户**：SQLite 本地存储，AES-256-GCM 加密 token，主密钥存 macOS Keychain / Linux 0600 file

## 系统要求

- Node.js ≥ 20（推荐 22 LTS）
- pnpm ≥ 10
- `claude` CLI（推荐通过 `~/.local/bin/claude` 装，验证版本：`claude --version` ≥ 2.0）
- macOS 14+ 或 Ubuntu 22.04+

## 快速开始

### 1. 安装依赖

```bash
git clone <repo>
cd claude-crontab
pnpm install
```

### 2. 初始化数据库

```bash
mkdir -p ~/.cct
export CCT_DB_URL="file:$HOME/.cct/db.sqlite"
cd packages/db && pnpm prisma db push --skip-generate && pnpm prisma generate && cd ../..
```

### 3. 构建 CLI 二进制

```bash
pnpm --filter @cct/runner build
pnpm --filter @cct/doctor build
# 可选：link 到 PATH
sudo ln -sf $(pwd)/apps/runner/dist/index.js /usr/local/bin/cct-runner
sudo ln -sf $(pwd)/apps/doctor/dist/index.js /usr/local/bin/cct-doctor
```

### 4. 配置 .env

```bash
cat > apps/web/.env <<EOF
CCT_DB_URL=file:$HOME/.cct/db.sqlite
CCT_LOG_DIR=$HOME/Library/Logs/cct          # macOS
# CCT_LOG_DIR=$HOME/.local/share/cct/logs   # Linux
CCT_RUNNER_BIN=/usr/local/bin/cct-runner
CCT_CLAUDE_BIN=$HOME/.local/bin/claude
JWT_SECRET=$(openssl rand -hex 32)
EOF
```

### 5. 启动 Web

```bash
pnpm dev   # http://localhost:3030
```

### 6. 首次使用

1. 浏览器打开 http://localhost:3030
2. 注册账号（Email + 强密码）
3. 进入「设置 · 模型管理」点「新增模型」→ 填写 alias / baseUrl / token / modelId（token 落库时立刻 AES-GCM 加密）
4. 创建首个任务：输入「每天早上 9 点把 GitHub 通知整理成 3 句话」
5. 多轮澄清后确认 → 系统自动写 launchd plist / crontab 行
6. 等到点 / 详情页 [手动跑一次]

## CLI 工具

### cct-runner

被 launchd / cron 调用，用户一般不直接执行：

```bash
cct-runner --task-id <uuid>                 # 调度模式（cron 触发）
cct-runner --task-id <uuid> --manual --run-id <uuid>  # 手动触发模式（task.runNow 用）
cct-runner --tcc-probe                      # TCC 探针子命令（cct-doctor 用）
```

### cct-doctor

本机环境自检：

```bash
cct-doctor                  # 跑所有 probe（默认 check）
cct-doctor check --json     # JSON 输出（机器可读）
cct-doctor reconcile        # 一致性恢复（清孤儿 plist / ghost 区段，交互式）
cct-doctor uninstall --confirm  # 清除所有数据（双重确认：先 --confirm，再 phrase "YES UNINSTALL"）
cct-doctor uninstall --confirm --yes  # CI 友好（跳 phrase）
```

8 个 probe：claude bin / dbReachable / keychain / tcc / scheduler / runnerBin / logDir / clockSkew

## 跨平台调度

### macOS（launchd）

- 每个 enabled task 一个 plist：`~/Library/LaunchAgents/com.cct.task.<id>.plist`
- `cron → CalendarInterval` 通过 `cronToCalendar` 转换（列举式，避免 cron expression 在 launchd 失效）
- TCC 拦截：launchd 默认 spawn 的进程未拥有 Full Disk Access；cct-runner 第一次访问受保护路径会被拦
  - 处理：`System Settings → Privacy & Security → Full Disk Access` → 加入 cct-runner 二进制
  - 自检：`cct-runner --tcc-probe` 在调度模式下尝试写 `~/Documents/cct-tcc-probe.tmp`

### Linux（crontab）

- 写入 `crontab -l` 的区段标记内：`# === cct-managed BEGIN/END ===`
- 用户已有非托管行完整保留（去重逻辑严格匹配区段头尾）
- 跨进程写入用 `~/.cct/crontab.lock` 文件锁（避免并发踩踏 crontab）

## 架构

monorepo（pnpm workspace）：

| 包 | 角色 |
|---|---|
| `apps/web` | Next.js 15 + React 19 + tRPC 11；13 路由 / 6 router / 31 procedure / SSE / 8 关键页面 |
| `apps/runner` | `cct-runner` CLI（esbuild bundle 30KB）；被调度系统拉起执行任务 |
| `apps/doctor` | `cct-doctor` CLI（esbuild bundle）；本机自检 / reconcile / uninstall |
| `packages/db` | Prisma + SQLite，7 张表（User / ModelAdapter / Task / TaskRun / ClarificationSession / AuditLog / RunnerLock） |
| `packages/scheduler` | `LaunchdScheduler` / `CrontabScheduler` 双实现，统一 `Scheduler` 接口 |
| `packages/secrets` | AES-256-GCM + macOS Keychain / Linux 0600 file |
| `packages/claude-cli` | `claude` 子进程包装 + stream-json 解析 + 16-alias env 注入 + token redactor |
| `packages/shared` | zod schemas + `cct.*` 错误工厂 + cron 工具（`isValidCron` / `nextFireTimes`） |
| `packages/prompt-safe` | prompt 注入检测（关键词 deny-list）+ sanitize/hash |

## 开发命令

```bash
pnpm install             # 装所有 deps
pnpm db:push             # 同步 SQLite schema
pnpm dev                 # 启 Next.js dev server (port 3030)
pnpm build               # 全栈构建（packages → web → runner → doctor）
pnpm test                # packages 单测
pnpm typecheck           # 全部 tsc 校验（apps + packages）
pnpm lint                # biome check
pnpm format              # biome format --write
```

## 测试

### 单元测试（120 tests）

```bash
pnpm -r --filter './packages/*' --filter './apps/runner' --filter './apps/doctor' test
```

| 包 | 测试数 | 覆盖范围 |
|---|---|---|
| `packages/secrets` | 5 | AES-GCM 加解密、tampered ciphertext detection |
| `packages/prompt-safe` | 5 | prompt sanitize / matched patterns / hash |
| `packages/claude-cli` | 22 | env builder / stream-json parser / line cap / token redactor |
| `packages/scheduler` | 22 | section marker / cron→calendar / 真实 plist 写入 / crontab idempotency |
| `apps/runner` | 27 | runOnce 全流程 / budget guard / lock acquire / tee writer / uncaught handler |
| `apps/doctor` | 39 | 8 个 probe / output / runner glue / reconcile / uninstall |

### TypeScript 校验（0 errors）

```bash
pnpm typecheck
```

### 端到端（kcc 实跑）

测试脚本：`packages/db/e2e-driver.mjs`（迁过来仅为 prisma 解析路径）

跑通 12 步：register → me → importFromShell → commitImport → modelAdapter.list → task.create（prisma 直写，绕过 clarify）→ task.runNow → 轮询 TaskRun → plist 文件验证 → log 文件验证 → AuditLog → archive cleanup

实测产出（kcc / kimi-k2.6）：

```
status:        succeeded
costUsd:       0.039
inputTokens:   4645
outputTokens:  56
cacheReadTokens: 28928
summary:       你好，世界！
plist:         ~/Library/LaunchAgents/com.cct.task.<id>.plist (1372 bytes)
auditLogs:     [task.run.manual, task.run.end, task.setEnabled]
```

## 卸载

```bash
cct-doctor uninstall --confirm
# 输入 "YES UNINSTALL" 确认
# 或加 --yes 跳过 phrase（CI 友好）
```

会清除：

- 所有 `com.cct.task.*.plist` / crontab 区段
- macOS Keychain `com.cct.master` 条目 / Linux `~/.cct/master.key`
- SQLite DB 与 `journal` / `wal` / `shm` 文件

## 风险五条（PRD §5.2）的缓解

| 风险 | 缓解 |
|---|---|
| R1 提示词注入 | `prompt-safe` 包裹 + 关键词 deny-list + AuditLog `finalSpecHash` |
| R2 macOS TCC 拦截 | `cct-runner --tcc-probe` 子命令 + cct-doctor `tcc` probe |
| R3 输出膨胀 | `TeeWriter` 三级截断（DB head 100K + tail 50K / 文件 5MB / 单行 10K）+ max-budget 兜底 |
| R4 并发抢占 | `RunnerLock` 表 + `MAX_CONCURRENT_RUNS=3` 全局并发限 |
| R5 Token 泄漏 | `tokenRedactor` 4 类正则（sk-* / Bearer / Authorization / api_key=）+ uncaughtException 捕获 + Keychain 主密钥分离 |

## 已知限制（v1.0）

- v1.0 全局 `--dangerously-skip-permissions`；任务级 `--allowedTools` 留 v1.1
- 行频率告警（R3-03）留 v1.1，依赖 max-budget 兜底
- Run Drawer 在前端使用全屏路由替代 intercepting routes（设计文档 §10 推荐降级）
- 调度执行 claude 时硬编码 `--verbose`（claude CLI 要求 `--print --output-format=stream-json` 必须搭配 `--verbose`）

## License

MIT（待补 LICENSE 文件）
