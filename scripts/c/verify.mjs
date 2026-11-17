import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { createServer } from "vite";
import { chromium } from "playwright";
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
const out = path.resolve(".tmp/c-verification/" + Date.now());
mkdirSync(out, { recursive: true });
const port = await freePort(),
  api = "http://127.0.0.1:" + port;
const child = spawn(process.execPath, ["server/index.js"], {
  windowsHide: true,
  env: {
    ...process.env,
    PORT: String(port),
    ZHIHUI_DATA_FILE: path.join(out, "store.json"),
    B_DEMO: "true",
    DEEPSEEK_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "",
  browser;
const servers = [],
  errors = [];
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
const example = JSON.parse(
  readFileSync("src/features/c/contract.examples.json", "utf8"),
);
const envelope = (data) => JSON.stringify({ code: 0, msg: "ok", data });
const fulfill = (route, data, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: envelope(data),
  });
try {
  const until = Date.now() + 15000;
  while (!logs.includes("已启动")) {
    if (child.exitCode !== null || Date.now() > until)
      throw Error(logs || "后端启动超时");
    await new Promise((r) => setTimeout(r, 100));
  }
  process.env.PORTAL_API_URL = api;
  browser = await chromium.launch({ channel: "msedge" });
  const pages = {};
  for (const role of ["student", "counselor"]) {
    const server = await createServer({
      configFile: "apps/" + role + "/vite.config.mjs",
      server: { port: await freePort() },
    });
    await server.listen();
    servers.push(server);
    const base = "http://127.0.0.1:" + server.config.server.port;
    const page = await browser.newPage({
      viewport: { width: 1536, height: 1024 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/login");
    await page
      .getByRole("button", {
        name: role === "student" ? "体验学生演示账号" : "体验辅导员演示账号",
      })
      .click();
    await page.waitForURL("**/" + role + "/home");
    await page.locator(".c-metrics").waitFor();
    await page.screenshot({ path: path.join(out, role + "-desktop.png") });
    await page.goto(
      base + "/" + (role === "student" ? "counselor" : "student") + "/home",
    );
    await page.waitForURL("**/" + role + "/home");
    pages[role] = { page, base };
  }
  const { page: student, base: studentBase } = pages.student;
  await student.goto(
    studentBase +
      "/student/new?description=" +
      encodeURIComponent("宿舍灯具损坏，需要安排维修。"),
  );
  assert.equal(
    await student.locator("textarea").inputValue(),
    "宿舍灯具损坏，需要安排维修。",
  );
  await student.getByRole("button", { name: /让 AI 先看看/ }).click();
  await student.getByText("AI 预检完成").waitFor();
  await student.getByRole("button", { name: /^(确认提交|仍要提交)$/ }).click();
  await student.getByRole("button", { name: /查看办理进度/ }).click();
  await student.waitForURL("**/student/tickets/**");
  const id = student.url().split("/").pop();
  await student.getByRole("link", { name: "补充材料", exact: true }).click();
  await student.getByLabel("补充说明").fill("补充说明：在三号楼二层东侧。");
  await student.route("**/api/tickets/*/supplements", (r) => r.fulfill({status:501, contentType:'application/json', body:JSON.stringify({message:'服务尚未接入'})}));
  await student.getByRole("button", { name: "确认提交", exact: true }).click();
  await student
    .getByRole("alert")
    .getByText(/尚未接入/)
    .waitFor();
  assert.ok(
    (await student.getByLabel("补充说明").inputValue()).includes("三号楼"),
  );
  await student.unroute("**/api/tickets/*/supplements");
  await student.getByRole("button", { name: "确认提交", exact: true }).click();
  await student.getByText("补充说明已提交", { exact: true }).waitFor();

  const { page: teacher, base: teacherBase } = pages.counselor;
  await teacher.goto(teacherBase + "/counselor/academic");
  await teacher
    .getByRole("heading", { name: "高等数学", exact: true })
    .waitFor();
  await teacher.route("**/api/b/cases", (r) =>
    fulfill(r, {
      items: [
        {
          id: "case-demo",
          studentName: "林知夏",
          course: "高等数学",
          status: "pending_contact",
          version: 2,
          result: {
            value: "failed",
            source: "测试回写",
            at: new Date().toISOString(),
          },
          records: [],
        },
      ],
    }),
  );
  await teacher.reload();
  await teacher.getByText(/未通过，继续跟进/).waitFor();
  await teacher.goto(teacherBase + "/counselor/knowledge");
  await teacher.getByLabel("标准答案标题").fill("学籍证明材料说明");
  await teacher.getByLabel("答案内容").fill("请核对用途并提供必要的申请说明。");
  await teacher.getByLabel("关键词（逗号分隔）").fill("学籍证明，申请材料");
  await teacher.getByLabel("依据来源").fill("联调样例文档");
  await teacher.getByLabel("责任部门").fill("教务处");
  await teacher.getByLabel("有效期").fill("2027-01-01T12:00");
  await teacher.getByRole("button", { name: "提交审核", exact: true }).click();
  await teacher.getByText("已提交待审核版本", { exact: true }).waitFor();
  await teacher.goto(teacherBase + "/counselor/bundles");
  await teacher.getByLabel("问题包名称").fill("设施联合维修");
  await teacher.locator("select").first().selectOption("logistics");
  const boxes = teacher.locator("fieldset input[type=checkbox]");
  await boxes.first().check();
  await boxes.nth(1).check();
  await teacher.getByLabel("我已逐条核对诉求、风险和目标部门").check();
  await teacher.route("**/api/issue-bundles", (r) => r.request().method() === 'POST' ? r.fulfill({status:501, contentType:'application/json', body:JSON.stringify({message:'服务尚未接入'})}) : r.continue());
  await teacher.getByRole("button", { name: "建立待转交问题包" }).click();
  await teacher
    .getByRole("alert")
    .filter({ hasText: "当前填写内容已保留" })
    .last()
    .waitFor();
  assert.equal(
    await teacher.getByLabel("问题包名称").inputValue(),
    "设施联合维修",
  );
  let created;
  const bundle = example.bundle.data.item;
  await teacher.unroute("**/api/issue-bundles");
  await teacher.route("**/api/issue-bundles", async (route) => {
    if (route.request().method() === "POST") {
      created = route.request().postDataJSON();
      await fulfill(route, { item: bundle });
    } else await fulfill(route, { items: [bundle] });
  });
  await teacher.route("**/api/issue-bundles/bundle-demo", (r) =>
    fulfill(r, { item: bundle }),
  );
  await teacher.getByRole("button", { name: "建立待转交问题包" }).click();
  await teacher.waitForURL("**/bundles/bundle-demo");
  assert.equal(created.ticketIds.length, 2);
  assert.equal(created.reviewed, true);
  await teacher
    .getByText("已回执 1 / 2 项，学生已确认 0 项", { exact: true })
    .waitFor();
  await teacher.getByText("处理中 · 曾反馈未解决", { exact: true }).waitFor();
  await teacher.screenshot({ path: path.join(out, "bundle-contract.png") });

  await teacher.goto(teacherBase + "/counselor/appointments");
  await teacher.getByLabel("开始时间").fill("2027-01-05T14:00");
  await teacher.getByLabel("结束时间").fill("2027-01-05T13:00");
  assert.equal(
    await teacher.getByRole("button", { name: "发布接待时段" }).isDisabled(),
    true,
  );
  await teacher.getByLabel("结束时间").fill("2027-01-05T14:30");
  await teacher.getByRole("button", { name: "发布接待时段" }).click();
  await teacher
    .getByRole("alert")
    .filter({ hasText: "当前填写内容已保留" })
    .first()
    .waitFor();

  await student.route("**/api/appointments/slots", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify(example.slots),
    }),
  );
  let conflict = true,
    bookings = [],
    lastBody;
  await student.route("**/api/appointments", async (r) => {
    if (r.request().method() === "GET") return fulfill(r, { items: bookings });
    lastBody = r.request().postDataJSON();
    if (conflict)
      return r.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify(example.conflict),
      });
    bookings = [
      {
        id: "booking-1",
        version: 1,
        status: "scheduled",
        topic: lastBody.topic,
        ...example.slots.data.items[0],
        id: "booking-1",
      },
    ];
    return fulfill(r, { item: bookings[0] });
  });
  await student.goto(studentBase + "/student/appointments");
  await student.getByLabel("可预约时段").selectOption("slot-demo");
  await student.getByLabel("预约事项").fill("学习计划沟通");
  await student.getByRole("button", { name: "提交预约" }).click();
  await student
    .getByRole("alert")
    .getByText(/数据已更新/)
    .waitFor();
  assert.equal(
    await student.getByLabel("预约事项").inputValue(),
    "学习计划沟通",
  );
  conflict = false;
  await student.getByRole("button", { name: "提交预约" }).click();
  await student.getByText("预约已提交", { exact: true }).waitFor();
  assert.equal(lastBody.slotId, "slot-demo");
  await student.route("**/api/appointments/booking-1/cancel", (r) => {
    bookings[0].status = "cancelled";
    return fulfill(r, { item: bookings[0] });
  });
  await student.getByLabel("取消说明").fill("时间需要调整");
  await student.getByRole("button", { name: "取消预约" }).click();
  await student.getByText("预约已取消", { exact: true }).waitFor();
  for (const role of ["student", "counselor"]) {
    const { page, base } = pages[role];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/" + role + "/home");
    await page.locator(".c-metrics").waitFor({ state: "attached" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(out, role + "-mobile.png"),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  // Original API suite runs after UI sessions because demo login invalidates previous tokens.
  const regression = spawn(process.execPath, ["scripts/e2e/api.mjs"], {
    windowsHide: true,
    env: { ...process.env, E2E_BASE_URL: api },
    stdio: "pipe",
  });
  let result = "";
  regression.stdout.on("data", (b) => (result += b));
  regression.stderr.on("data", (b) => (result += b));
  const code = await new Promise((resolve) => regression.on("exit", resolve));
  assert.equal(code, 0, result);
  writeFileSync(
    path.join(out, "result.txt"),
    "PASS C 双端真实读取及原API回归；缺失接口使用浏览器契约样例验证\n" + result,
  );
  console.log("PASS", out);
} finally {
  await browser?.close();
  for (const server of servers) await server.close();
  child.kill();
}
