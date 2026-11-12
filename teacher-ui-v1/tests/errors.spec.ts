import { test, expect } from "@playwright/test";
test("并发审核冲突保留说明并刷新权限，退回草稿必填原因", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "一键体验教师端" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/counselor/tickets/T202611080002");
  await page.getByRole("button", { name: "审核诉求", exact: true }).click();
  await page.getByLabel("审核说明（选填）").fill("已核实，等待安排");
  await page.evaluate(async () => {
    await fetch("/api/counselor/tickets/T202611080002/review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + localStorage.getItem("zhihui_token"),
      },
      body: JSON.stringify({ approved: true, remark: "另一操作已审核" }),
    });
  });
  await page.getByRole("button", { name: "确认审核诉求" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "当前状态不再允许此操作",
  );
  await expect(page.getByLabel("审核说明（选填）")).toHaveValue(
    "已核实，等待安排",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "分派工单", exact: true }),
  ).toBeVisible();
  await page.goto("/counselor/tickets/T202611080001");
  await page.getByRole("button", { name: "审核诉求", exact: true }).click();
  await page.getByLabel("审核结果").selectOption("false");
  await page.getByRole("button", { name: "确认审核诉求" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("退回原因").fill("请补充希望联系的时间。");
  await page.getByRole("button", { name: "确认审核诉求" }).click();
  await expect(page.locator(".detail-title .pill")).toHaveText("待补充草稿");
  await page.goto('/counselor/dashboard');
  await page.getByRole('link', { name: /高风险关注/ }).click();
  await expect(page.locator('.ticket-row')).toHaveCount(1);
  await expect(page.locator('.ticket-row .pill')).toHaveText('待补充草稿');
});
test("详情与手机视觉快照", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByRole("button", { name: "一键体验教师端" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/counselor/tickets/T202611080002");
  await expect(page.locator(".detail-title")).toBeVisible();
  await page.screenshot({ path: "docs/工单详情预览.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/counselor/dashboard");
  await expect(page.locator(".ticket-row").first()).toBeVisible();
  await page.screenshot({ path: "docs/手机适配预览.png", fullPage: true });
});
