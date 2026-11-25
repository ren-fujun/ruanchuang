import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer as netServer } from "node:net";
import { createServer } from "vite";
import { chromium } from "playwright";
import { bTrialFixture } from "../fixtures/b-trial.mjs";
import { hashPassword } from "../../server/trial-auth.js";
async function freePort() {
  for (;;) {
    const s = netServer();
    s.listen(0, "127.0.0.1");
    await once(s, "listening");
    const port = s.address().port;
    await new Promise((r) => s.close(r));
    if (port >= 10000) return port;
  }
}
const data = bTrialFixture();
for (const u of data.users) {
  u.passwordHash = hashPassword("testing-pass-123");
  u.mustChangePassword = false;
}
const dir = await mkdtemp(path.join(tmpdir(), "c-feedback-"));
await writeFile(path.join(dir, "store.json"), JSON.stringify(data));
const port = await freePort(),
  base = "http://127.0.0.1:" + port;
const proc = spawn(process.execPath, ["server/index.js"], {
  windowsHide: true,
  env: {
    ...process.env,
    TRIAL_MODE: "true",
    PORT: String(port),
    ZHIHUI_DATA_FILE: path.join(dir, "store.json"),
    DEEPSEEK_API_KEY: "",
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
  const roles = [
    ["student", "20230118", "zhihui_token"],
    ["counselor", "chenyuan", "zhihui_token"],
    ["mentor", "mentor", "b_portal_token"],
    ["academic", "academic", "academic_token"],
    ["logistics", "logistics", "zhihui_token"],
  ];
  for (const [role, account, key] of roles) {
    const response = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, password: "testing-pass-123", role }),
    });
    const result = await response.json();
    assert.equal(response.status, 200, role);
    const server = await createServer({
      configFile: "apps/" + role + "/vite.config.mjs",
      server: { port: await freePort() },
    });
    await server.listen();
    servers.push(server);
    const page = await browser.newPage({
      viewport: { width: role === "student" ? 390 : 1366, height: 768 },
    });
    await page.addInitScript(
      ({ key, token }) => localStorage.setItem(key, token),
      { key, token: result.token },
    );
    await page.goto(
      "http://127.0.0.1:" +
        server.config.server.port +
        (role === "student" || role === "counselor"
          ? "/" + role + "/home"
          : "/"),
    );
    const feedback = page.locator(".trial-feedback");
    await feedback.getByRole("button", { name: "试用反馈" }).click();
    await feedback.getByLabel("描述").fill(role + " 端联调反馈。");
    await feedback.getByLabel("任务是否完成").selectOption("yes");
    await feedback.getByLabel("完成耗时（分钟）").fill("5");
    await feedback.getByRole("button", { name: "提交反馈" }).click();
    await feedback.getByText("反馈已提交").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      role + " horizontal overflow",
    );
    await page.close();
  }
  console.log("PASS 五端共享试用提示、独立会话反馈真实提交及布局");
} finally {
  await browser?.close();
  for (const s of servers) await s.close();
  proc.kill();
}
