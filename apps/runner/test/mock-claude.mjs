#!/usr/bin/env node
// 测试用 mock claude bin。
// Source of truth: design/07-qa.md §8 fixture 策略。
//
// 用法: node mock-claude.js --scenario <name>
//
// scenarios:
//   happy           — 输出 fixtures/stream-json/happy.jsonl 后退 0
//   loop            — 高速持续输出（用于行频率测试）
//   timeout         — 永不退出（直到被 SIGTERM）
//   stderr-token    — stderr 输出含 sk-ant-api03-XXX 等敏感 token
//   crash           — 立刻 exit 1 + stderr 错误
//   tampered        — 含非 JSON 行，但最终有 result

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// scenario 选择优先级：
//   1) --scenario flag
//   2) commandPrompt 中（-p 之后的字符串）含 'mockclaude:<name>' token
//   3) env CCT_MOCK_SCENARIO
//   4) 默认 'happy'
function pickScenario() {
  const explicit = arg('--scenario');
  if (explicit) return explicit;
  const prompt = arg('-p') ?? '';
  const m = prompt.match(/mockclaude:(\w[\w-]*)/);
  if (m) return m[1];
  if (process.env.CCT_MOCK_SCENARIO) return process.env.CCT_MOCK_SCENARIO;
  return 'happy';
}

const scenario = pickScenario();
const rate = Number.parseInt(arg('--rate') ?? '100', 10);

async function happy() {
  const data = await fs.readFile(
    path.join(HERE, 'fixtures/stream-json/happy.jsonl'),
    'utf8',
  );
  process.stdout.write(data);
  process.exit(0);
}

async function tampered() {
  const data = await fs.readFile(
    path.join(HERE, 'fixtures/stream-json/tampered.jsonl'),
    'utf8',
  );
  process.stdout.write(data);
  process.exit(0);
}

async function loop() {
  let n = 0;
  const interval = setInterval(() => {
    process.stdout.write(
      `{"type":"assistant","message":{"content":[{"type":"text","text":"loop ${n}"}]}}\n`,
    );
    n++;
    if (n >= rate * 2) {
      clearInterval(interval);
      process.stdout.write(
        `{"type":"result","total_cost_usd":${(0.001 * n).toFixed(6)}}\n`,
      );
      process.exit(0);
    }
  }, 1000 / rate);
}

function timeoutScenario() {
  // 一直等，但偶尔输出一行让 stdout 不为空
  setInterval(() => {
    process.stdout.write(`{"type":"assistant","message":{"content":[{"type":"text","text":"alive"}]}}\n`);
  }, 200);
  // 防止 node 自动退出
  setInterval(() => {}, 1 << 30);
}

async function stderrToken() {
  process.stderr.write(
    'WARN leaked: sk-ant-api03-LEAKME12345678ABC and Bearer abc.def.ghi-jkl extra\n',
  );
  process.stdout.write(
    `{"type":"result","total_cost_usd":0.005,"usage":{"input_tokens":10,"output_tokens":5}}\n`,
  );
  process.exit(0);
}

function crash() {
  process.stderr.write('mock-claude: simulated crash\n');
  process.exit(1);
}

switch (scenario) {
  case 'happy':
    happy();
    break;
  case 'tampered':
    tampered();
    break;
  case 'loop':
    loop();
    break;
  case 'timeout':
    timeoutScenario();
    break;
  case 'stderr-token':
    stderrToken();
    break;
  case 'crash':
    crash();
    break;
  default:
    process.stderr.write(`unknown scenario: ${scenario}\n`);
    process.exit(2);
}
