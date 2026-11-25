import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer as netServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { seedData } from "../../server/seed.js";

const dir = await mkdtemp(path.join(tmpdir(), "c-trial-"));
const data = seedData();
const stu = data.users.find((u) => u.account === "20230118");
const cou = data.users.find((u) => u.account === "chenyuan");
stu.educationLevel = "undergraduate";
stu.counselorIds = [cou.id];
await writeFile(path.join(dir, "store.json"), JSON.stringify(data));
async function freePort() {
  for (;;) {
    const s = netServer();
    s.listen(0, "127.0.0.1");
    await once(s, "listening");
    const p = s.address().port;
    await new Promise((r) => s.close(r));
    if (p >= 10000) return p;
  }
}
const port = await freePort(),
  base = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, ["server/index.js"], {
  windowsHide: true,
  env: {
    ...process.env,
    PORT: String(port),
    ZHIHUI_DATA_FILE: path.join(dir, "store.json"),
    DEEPSEEK_API_KEY: "",
    REPAIR_RESPONSE_MINUTES: "0",
  },
});
let browser;
const servers = [];
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  process.env.PORTAL_API_URL = base;
  browser = await chromium.launch({ channel: "msedge" });
  const pages = {};
  for (const role of ["student", "counselor"]) {
    const server = await createServer({
      configFile: "apps/" + role + "/vite.config.mjs",
      server: { port: await freePort() },
    });
    await server.listen();
    servers.push(server);
    const origin = "http://127.0.0.1:" + server.config.server.port;
    const page = await browser.newPage({
      viewport: { width: role === "student" ? 390 : 1440, height: 900 },
    });
    await page.goto(origin + "/login");
    await page.getByLabel("账号").fill(role === "student" ? "20230118" : "chenyuan");
    await page.getByLabel("密码").fill("123456");
    await page.getByRole("button", {name: "登录", exact: true}).click();
    await page.waitForURL("**/" + role + "/home");
    pages[role] = { page, origin };
  }
  const student = pages.student.page,
    teacher = pages.counselor.page;
  await student.goto(pages.student.origin + "/student/assistant");
  await student.getByLabel("咨询内容").fill("宿舍水龙头漏水需要报修");
  await student.getByRole("button", { name: "发送", exact: true }).click();
  await student.getByRole("button", { name: "前往报修填写页" }).click();
  await student.waitForURL("**/student/repairs/new");
  await student.getByLabel("报修类型").selectOption("水电");
  await student.getByLabel("报修地点").fill("学生公寓 3 号楼 412");
  await student.getByLabel("故障描述").fill("洗手池持续漏水，请协助维修。");
  await student.getByRole("button", { name: "确认提交" }).click();
  await student.waitForURL((url) =>
    /\/student\/repairs\/(?!new$)[^/]+$/.test(url.pathname),
  );
  const id = student.url().split("/").pop();
  await student.getByText("待后勤分配", { exact: false }).first().waitFor();
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: "logistics",
      password: "123456",
      role: "logistics",
    }),
  });
  const token = (await login.json()).token;
  async function api(endpoint, body) {
    const r = await fetch(base + "/api" + endpoint, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    assert.ok(r.ok, JSON.stringify(data));
    return data;
  }
  let repair = (await api("/repairs/" + id)).repair;
  repair = (
    await api("/repairs/" + id + "/claim", {
      version: repair.version,
      requestId: crypto.randomUUID(),
    })
  ).repair;
  repair = (
    await api("/repairs/" + id + "/result", {
      version: repair.version,
      result: "已检查并更换水管。",
      requestId: crypto.randomUUID(),
    })
  ).repair;
  await student.reload();
  await student.getByLabel("异议原因").fill("更换后仍然持续漏水。");
  await student.getByRole("button", { name: "提出一次异议" }).click();
  await student.getByText("异议待后勤回应", { exact: false }).first().waitFor();
  repair = (await api("/repairs/" + id)).repair;
  repair = (
    await api("/repairs/" + id + "/respond", {
      version: repair.version,
      response: "已到场检查，需后续联合排查。",
      requestId: crypto.randomUUID(),
    })
  ).repair;
  await teacher.goto(pages.counselor.origin + "/counselor/repairs/" + id);
  await teacher
    .getByText("后勤说明：已到场检查，需后续联合排查。", { exact: true })
    .waitFor();
  await teacher.getByLabel("事实与协调结论").fill("已核对现场情况及双方反馈。");
  await teacher.getByLabel("后续动作").fill("安排后续联合排查。");
  await teacher.getByLabel("负责人").fill("陈老师");
  await teacher.getByLabel("后续时间").fill("2027-01-05T14:00");
  await teacher.getByRole("button", { name: "确认协调结案" }).click();
  await teacher.getByText("协调结案", { exact: false }).first().waitFor();
  await student.goto(pages.student.origin + "/student/leaves");
  await student.getByText("本科生请假", { exact: false }).waitFor();
  await student.getByLabel("开始时间").fill("2027-01-06T09:00");
  await student.getByLabel("结束时间").fill("2027-01-06T10:00");
  await student.getByLabel("请假原因").fill("参加校外实践活动。");
  await student.getByRole("button", { name: "提交请假申请" }).click();
  await student.getByText("参加校外实践活动。").waitFor();
  await teacher.goto(pages.counselor.origin + "/counselor/leaves");
  await teacher.getByText("参加校外实践活动。").waitFor();
  await teacher.getByLabel("审批意见").fill("同意请假。");
  await teacher.getByRole("button", { name: "同意请假" }).click();
  await teacher.getByText("同意请假。").waitFor();
  await student.reload();
  await student.getByText("同意请假。").waitFor();
  assert.equal(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log(
    "PASS 学生直达报修、后勤处置、一次异议、辅导员协调与本科生请假审批",
  );
} finally {
  await browser?.close();
  for (const s of servers) await s.close();
  child.kill();
}
