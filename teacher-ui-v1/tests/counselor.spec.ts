import { test, expect, Page } from "@playwright/test";
async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "一键体验教师端" }).click();
  await expect(
    page.getByRole("heading", { name: "你好，陈予安老师." }),
  ).toBeVisible();
}
test("审核、分派、催办、备注及持久化", async ({ page }) => {
  await login(page);
  await page.goto("/counselor/tickets/T202611080002");
  await page.getByRole("button", { name: "审核诉求", exact: true }).click();
  await page.getByRole("button", { name: "确认审核诉求" }).click();
  await page.getByRole("button", { name: "分派工单", exact: true }).click();
  await page.getByRole("button", { name: "确认分派工单" }).click();
  await expect(page.locator(".detail-title .pill")).toHaveText("已分派");
  await page.getByRole("button", { name: "发送催办", exact: true }).click();
  await page.getByLabel("催办说明").fill("请安排今日上门核查热水供应情况。");
  await page.getByRole("button", { name: "确认发送催办" }).click();
  await expect(page.locator(".timeline")).toContainText(
    "请安排今日上门核查热水供应情况。",
  );
  await page.getByRole("button", { name: "添加内部备注", exact: true }).click();
  await page.getByLabel("备注内容").fill("已电话联系学生，等待维修反馈。");
  await page.getByRole("button", { name: "确认添加内部备注" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".notes-section")).toContainText(
    "已电话联系学生，等待维修反馈。",
  );
  await page.reload();
  await expect(page.locator(".notes-section")).toContainText(
    "已电话联系学生，等待维修反馈。",
  );
  await expect(
    page.getByRole("button", { name: "审核诉求", exact: true }),
  ).toHaveCount(0);
});
test("筛选、搜索、分页和 URL 刷新恢复", async ({ page }) => {
  await login(page);
  await page.goto("/counselor/tickets");
  await expect(page.locator(".ticket-row")).toHaveCount(10);
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".ticket-row")).toHaveCount(2);
  await page.getByLabel("风险筛选").selectOption("HIGH");
  await expect(page.locator(".ticket-row")).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel("风险筛选")).toHaveValue("HIGH");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByLabel("搜索工单").fill("不存在的诉求");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    page.getByText("没有匹配的工单，试试调整筛选条件"),
  ).toBeVisible();
});
test("复合工单拆分、父子深链与重复拆分拦截", async ({ page }) => {
  await login(page);
  await page.goto("/counselor/tickets/T202611080001");
  await page.getByRole("button", { name: "拆分复合工单", exact: true }).click();
  const items = page.locator(".split-item");
  for (let i = 0; i < 2; i++) {
    await items
      .nth(i)
      .getByLabel("标题", { exact: true })
      .fill(["协调宿舍作息", "提供心理咨询支持"][i]);
    await items
      .nth(i)
      .getByLabel("描述", { exact: true })
      .fill("请联系学生并提供必要的协同支持。");
    await items
      .nth(i)
      .getByLabel("承办部门")
      .selectOption(i ? "DEPT_PSYCH" : "DEPT_DORM");
  }
  await page.getByRole("button", { name: "确认拆分复合工单" }).click();
  await expect(page.locator(".child-ticket")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "拆分复合工单", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".detail-title .pill")).toHaveText("待审核");
  await page.locator(".child-ticket").first().click();
  await expect(page.locator(".detail-title h1")).toHaveText("协调宿舍作息");
  await expect(page.getByRole("link", { name: /查看父工单/ })).toBeVisible();
});
test("驳回重派、提醒确认、归档权限", async ({ page }) => {
  await login(page);
  await page.goto("/counselor/tickets/T202611080006");
  await expect(page.locator(".rejection")).toBeVisible();
  await page.getByRole("button", { name: "分派工单", exact: true }).click();
  await page.getByLabel("承办部门").selectOption("DEPT_LOGISTICS");
  await page.getByRole("button", { name: "确认分派工单" }).click();
  await expect(page.locator(".rejection")).toHaveCount(0);
  await page.goto("/counselor/tickets/T202611080007");
  await page.getByRole("button", { name: "提醒学生确认", exact: true }).click();
  await page.getByRole("button", { name: "确认提醒学生确认" }).click();
  await expect(page.locator(".timeline")).toContainText("已向学生发送确认提醒");
  await expect(page.locator(".detail-title .pill")).toHaveText("待学生确认");
  await expect(
    page.getByRole("button", { name: "归档工单", exact: true }),
  ).toHaveCount(0);
  await page.goto("/counselor/tickets/T202611080008");
  await page.getByRole("button", { name: "归档工单", exact: true }).click();
  await page.getByRole("button", { name: "确认归档工单" }).click();
  await expect(page.locator(".detail-title .pill")).toHaveText("已归档");
});
test("服务端冲突、越权、失效 token 与非法资源", async ({ page }) => {
  await login(page);
  const responses = await page.evaluate(async () => {
    const token = localStorage.getItem("zhihui_token");
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const send = async (path: string, init?: RequestInit) => {
      const r = await fetch("/api" + path, { headers, ...init });
      return { status: r.status, ...(await r.json()) };
    };
    return [
      await send("/counselor/tickets/T202611080009/assign", {
        method: "POST",
        body: JSON.stringify({ deptId: "DEPT_IT" }),
      }),
      await send("/counselor/tickets/missing"),
      await send("/counselor/tickets?page=0"),
      await send("/auth/me", { headers: { Authorization: "Bearer invalid" } }),
      await send("/counselor/tickets", {
        headers: { ...headers, "X-Mock-Scenario": "forbidden" },
      }),
      await send("/counselor/tickets", {
        headers: { ...headers, "X-Mock-Scenario": "error" },
      }),
    ];
  });
  expect(responses.map((r) => r.status)).toEqual([
    409, 404, 400, 401, 403, 500,
  ]);
  await page.goto("/counselor/tickets/missing");
  await expect(page.getByText("工单不存在或不在你的授权范围内")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("zhihui_token", "invalid"));
  await page.reload();
  await expect(page).toHaveURL(/login/);
});
for (const width of [360, 390, 1440])
  test(`${width}px 页面无横向溢出与无控制台异常`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => { errors.push(e.message); console.error(e.stack); });
    await page.setViewportSize({ width, height: 1000 });
    await login(page);
    for (const route of [
      "dashboard",
      "tickets",
      "tickets/T202611080001",
      "insights",
    ]) {
      await page.goto("/counselor/" + route);
      await expect(page.locator(".card").first()).toBeVisible();
      await page.waitForTimeout(300);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
    }
    expect(errors).toEqual([]);
  });
test("截图：桌面工作台", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1200 });
  await login(page);
  await expect(page.locator(".ticket-row").first()).toBeVisible();
  await page.screenshot({ path: "docs/教师工作台预览.png", fullPage: true });
});
