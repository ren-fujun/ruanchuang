import type { Status, Risk } from "../types";
export const statusLabels: Record<Status, string> = {
  DRAFT: "待补充草稿",
  PENDING_REVIEW: "待审核",
  ASSIGNED: "已分派",
  PROCESSING: "处理中",
  REJECTED: "待重新分派",
  PENDING_CONFIRM: "待学生确认",
  CONFIRMED: "已确认办结",
  ARCHIVED: "已归档",
};
export const riskLabels: Record<Risk, string> = {
  LOW: "低风险",
  MEDIUM: "中风险",
  HIGH: "高风险",
};
export const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "暂未设置";
// 图表测量阶段可能先传入数字刻度；只有 ISO 纯日期才进行日期缩写。
export const shortDate = (value: string | number) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.slice(5).replace("-", "/")
    : String(value);
