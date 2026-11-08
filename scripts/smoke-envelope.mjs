#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isUtcIso(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function unwrapEnvelope(response, stepName) {
  assert(response.status === 200, `${stepName}: 期望 HTTP 200，实际 ${response.status}`);
  assert(response.body && typeof response.body === "object", `${stepName}: 响应不是 JSON 对象`);
  assert(response.body.code === 0, `${stepName}: 期望 code=0，实际 ${response.body.code}`);
  assert(typeof response.body.msg === "string", `${stepName}: msg 必须是字符串`);
  assert(response.body.data !== null && typeof response.body.data === "object", `${stepName}: 成功响应 data 必须是对象`);
  return response.body.data;
}

async function requestJson(baseUrl, path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };
  const startedAt = performance.now();
  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`请求 ${path} 失败: ${error.message}`);
  }

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`请求 ${path} 返回了非 JSON 内容: ${text.slice(0, 200)}`);
  }

  return {
    status: response.status,
    body,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

async function login(baseUrl, role) {
  const response = await requestJson(baseUrl, "/api/auth/demo", {
    method: "POST",
    body: { role },
  });
  const data = unwrapEnvelope(response, `${role} 登录`);
  assert(typeof data.token === "string" && data.token.length > 0, `${role} 登录: data.token 不能为空`);
  assert(data.user && typeof data.user === "object", `${role} 登录: data.user 必须是对象`);
  assert(data.user.role === role, `${role} 登录: data.user.role 期望 ${role}，实际 ${data.user.role}`);
  assert(typeof data.user.id === "string" && data.user.id.length > 0, `${role} 登录: data.user.id 不能为空`);
  return { data, elapsedMs: response.elapsedMs };
}

async function listTickets(baseUrl, token, label) {
  const path = "/api/tickets?page=1&pageSize=20";
  const response = await requestJson(baseUrl, path, { token });
  const data = unwrapEnvelope(response, `${label} 工单列表`);

  assert(Array.isArray(data.tickets), `${label} 工单列表: data.tickets 必须是数组`);
  assert(data.counts && typeof data.counts === "object" && !Array.isArray(data.counts), `${label} 工单列表: data.counts 必须是对象`);
  assert(data.page === 1, `${label} 工单列表: data.page 期望 1，实际 ${data.page}`);
  assert(data.pageSize === 20, `${label} 工单列表: data.pageSize 期望 20，实际 ${data.pageSize}`);
  assert(Number.isInteger(data.total), `${label} 工单列表: data.total 必须是整数`);
  assert(typeof data.hasMore === "boolean", `${label} 工单列表: data.hasMore 必须是布尔值`);
  assert(data.tickets.length <= data.pageSize, `${label} 工单列表: 返回条数不能超过 pageSize`);

  return { data, elapsedMs: response.elapsedMs };
}

function renderMarkdown(results, baseUrl) {
  const lines = [];
  lines.push("# 冒烟联调结果");
  lines.push("");
  lines.push(`执行时间：${new Date().toISOString()}`);
  lines.push("");
  lines.push(`后端地址：\`${baseUrl}\``);
  lines.push("");
  lines.push("| 顺序 | 检查项 | 结果 | HTTP | 耗时 | 证据 |");
  lines.push("| ---: | --- | --- | ---: | ---: | --- |");
  for (const [index, result] of results.entries()) {
    lines.push(`| ${index + 1} | ${result.name} | ${result.ok ? "已通" : "待修"} | ${result.status ?? "N/A"} | ${result.elapsedMs ?? "N/A"} ms | ${result.evidence.replaceAll("|", "\\|")} |`);
  }
  lines.push("");
  lines.push("> 此文件由 `scripts/smoke-envelope.mjs` 生成，用于粘贴到 `docs/联调记录.md`，不会自动覆盖正式记录。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("用法: node scripts/smoke-envelope.mjs [--base-url http://127.0.0.1:8787] [--out docs/smoke-latest.md]");
    return;
  }

  const baseUrl = (args["base-url"] ?? process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const results = [];
  let student;
  let counselor;

  async function run(name, action) {
    try {
      const result = await action();
      results.push({
        name,
        ok: true,
        status: result.status,
        elapsedMs: result.elapsedMs,
        evidence: result.evidence,
      });
      console.log(`PASS ${name}: ${result.evidence}`);
      return result;
    } catch (error) {
      results.push({
        name,
        ok: false,
        status: error.status ?? "N/A",
        elapsedMs: error.elapsedMs ?? "N/A",
        evidence: error.message,
      });
      console.error(`FAIL ${name}: ${error.message}`);
      throw error;
    }
  }

  try {
    await run("健康检查 GET /api/health", async () => {
      const response = await requestJson(baseUrl, "/api/health");
      const data = unwrapEnvelope(response, "健康检查");
      assert(data.ok === true, `健康检查: data.ok 期望 true，实际 ${data.ok}`);
      assert(typeof data.service === "string" && data.service.length > 0, "健康检查: data.service 不能为空");
      assert(isUtcIso(data.time), `健康检查: data.time 不是 UTC ISO 时间: ${data.time}`);
      return {
        status: response.status,
        elapsedMs: response.elapsedMs,
        evidence: `code=0；data.ok=true；service=${data.service}；time=${data.time}`,
      };
    });

    student = await run("学生登录 POST /api/auth/demo", async () => {
      const result = await login(baseUrl, "student");
      return {
        status: 200,
        elapsedMs: result.elapsedMs,
        evidence: `code=0；user.role=student；user.id=${result.data.user.id}；token 非空`,
        token: result.data.token,
        user: result.data.user,
      };
    });

    counselor = await run("辅导员登录 POST /api/auth/demo", async () => {
      const result = await login(baseUrl, "counselor");
      return {
        status: 200,
        elapsedMs: result.elapsedMs,
        evidence: `code=0；user.role=counselor；user.id=${result.data.user.id}；token 非空`,
        token: result.data.token,
        user: result.data.user,
      };
    });

    const studentTickets = await run("学生工单列表 GET /api/tickets", async () => {
      const result = await listTickets(baseUrl, student.token, "学生");
      for (const ticket of result.data.tickets) {
        assert(typeof ticket.studentId === "string", `学生工单列表: 工单 ${ticket.id ?? "未知"} 缺少 studentId`);
        assert(ticket.studentId === student.user.id, `学生工单列表: 工单 ${ticket.id ?? "未知"} 不属于当前学生`);
      }
      return {
        status: 200,
        elapsedMs: result.elapsedMs,
        evidence: `code=0；tickets=${result.data.tickets.length}；total=${result.data.total}；全部属于当前学生`,
        total: result.data.total,
      };
    });

    await run("辅导员工单列表 GET /api/tickets", async () => {
      const result = await listTickets(baseUrl, counselor.token, "辅导员");
      assert(result.data.total >= studentTickets.total, "辅导员工单列表: total 小于学生总数");
      return {
        status: 200,
        elapsedMs: result.elapsedMs,
        evidence: `code=0；tickets=${result.data.tickets.length}；total=${result.data.total}；分页字段齐全`,
      };
    });
  } catch {
    // 失败结果已经写入 results，由退出码和报告体现。
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\n结果: ${passed} 项通过，${failed} 项失败。`);

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, renderMarkdown(results, baseUrl), "utf8");
    console.log(`报告已写入 ${args.out}`);
  }

  if (failed > 0) process.exitCode = 1;
}

main();
