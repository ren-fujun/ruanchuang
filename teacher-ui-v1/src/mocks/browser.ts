import { http, HttpResponse, delay } from "msw";
import { setupWorker } from "msw/browser";
import type {
  Dashboard,
  Department,
  Status,
  Ticket,
  User,
  SplitItem,
} from "../types";
const user: User = {
  userId: "C1001",
  name: "陈予安",
  role: "COUNSELOR",
  college: "信息工程学院",
  scope: "2024 级 · 信息工程学院",
};
const departments: Department[] = [
  {
    deptId: "DEPT_LOGISTICS",
    name: "后勤保障处",
    short: "后勤保障",
    slaHours: 24,
    handlers: [{ handlerId: "U1003", name: "周明" }],
  },
  {
    deptId: "DEPT_DORM",
    name: "学生公寓管理中心",
    short: "宿管中心",
    slaHours: 12,
    handlers: [{ handlerId: "U1004", name: "张岚" }],
  },
  {
    deptId: "DEPT_OFFICE",
    name: "学院教务办公室",
    short: "学院办公室",
    slaHours: 48,
    handlers: [{ handlerId: "U1005", name: "李文" }],
  },
  {
    deptId: "DEPT_IT",
    name: "信息化建设中心",
    short: "信息中心",
    slaHours: 24,
    handlers: [{ handlerId: "U1006", name: "赵阳" }],
  },
  {
    deptId: "DEPT_SECURITY",
    name: "校园安全保卫处",
    short: "保卫处",
    slaHours: 4,
    handlers: [{ handlerId: "U1007", name: "王磊" }],
  },
  {
    deptId: "DEPT_PSYCH",
    name: "心理健康教育中心",
    short: "心理中心",
    slaHours: 4,
    handlers: [{ handlerId: "U1008", name: "许宁" }],
  },
];
const categories = [
  { value: "DORM_REPAIR", label: "宿舍生活" },
  { value: "CAMPUS_FACILITY", label: "校园设施" },
  { value: "ACADEMIC", label: "学籍教务" },
  { value: "FINANCE", label: "奖助资助" },
  { value: "PSYCHOLOGY", label: "心理支持" },
  { value: "SECURITY", label: "安全保卫" },
  { value: "NETWORK", label: "网络服务" },
  { value: "CANTEEN", label: "食堂服务" },
];
const iso = (hours: number) =>
  new Date(Date.now() + hours * 3600000).toISOString();
function seed(): Ticket[] {
  const subjects = [
    [
      "室友作息冲突，最近很难入睡",
      "PSYCHOLOGY",
      "HIGH",
      "PENDING_REVIEW",
      "DEPT_PSYCH",
      "林知夏",
      "最近连续几晚难以入睡，白天也无法集中精神，希望能和老师聊一聊。",
    ],
    [
      "3 号楼热水供应不稳定，盼尽快检修",
      "DORM_REPAIR",
      "LOW",
      "PENDING_REVIEW",
      "DEPT_LOGISTICS",
      "陈嘉宁",
      "近一周晚上热水忽冷忽热，同层多个宿舍都有这个情况，请安排排查。",
    ],
    [
      "校园网络频繁掉线，影响课程作业",
      "NETWORK",
      "MEDIUM",
      "PROCESSING",
      "DEPT_IT",
      "许星禾",
      "图书馆三楼无线网络经常断开，在线课程无法正常播放。",
    ],
    [
      "奖学金材料提交入口无法打开",
      "FINANCE",
      "LOW",
      "ASSIGNED",
      "DEPT_OFFICE",
      "周以安",
      "提交截止日期临近，系统页面持续提示无法连接。",
    ],
    [
      "宿舍楼道照明损坏，夜间出行不便",
      "CAMPUS_FACILITY",
      "MEDIUM",
      "PROCESSING",
      "DEPT_LOGISTICS",
      "苏明远",
      "宿舍二楼楼梯灯损坏，晚上下楼看不清台阶，存在安全隐患。",
    ],
    [
      "食堂窗口价格标示不清晰",
      "CANTEEN",
      "LOW",
      "REJECTED",
      "DEPT_DORM",
      "沈可心",
      "食堂二楼窗口部分套餐没有明码标价，希望补充标示。",
    ],
    [
      "申请补开在读证明",
      "ACADEMIC",
      "LOW",
      "PENDING_CONFIRM",
      "DEPT_OFFICE",
      "陆景和",
      "实习单位需要在读证明，希望协助开具。",
    ],
    [
      "自习室插座无法使用",
      "CAMPUS_FACILITY",
      "LOW",
      "CONFIRMED",
      "DEPT_LOGISTICS",
      "夏予晴",
      "图书馆二楼靠窗插座没有电。",
    ],
    [
      "宿舍门锁卡顿，影响正常进出",
      "DORM_REPAIR",
      "LOW",
      "ARCHIVED",
      "DEPT_DORM",
      "顾言",
      "门锁旋转困难，已申请维修。",
    ],
    [
      "操场周边照明不足",
      "SECURITY",
      "MEDIUM",
      "ASSIGNED",
      "DEPT_SECURITY",
      "江舟",
      "夜间跑步路段较暗，希望加强巡查。",
    ],
    [
      "学籍信息核对申请",
      "ACADEMIC",
      "LOW",
      "CONFIRMED",
      "DEPT_OFFICE",
      "赵一诺",
      "需要核对学籍信息中的专业名称。",
    ],
    [
      "教学楼无线网络连接异常",
      "NETWORK",
      "LOW",
      "ARCHIVED",
      "DEPT_IT",
      "程晓",
      "教学楼 A 区网络连接后无法访问课程平台。",
    ],
  ];
  return subjects.map((s, i) => {
    const status = s[3] as Status;
    const createdAt = iso(-(i * 12 + 2));
    const dept = departments.find((d) => d.deptId === s[4])!;
    return {
      ticketId: `T20261108${String(i + 1).padStart(4, "0")}`,
      title: s[0],
      content: s[6],
      category: s[1],
      location:
        i === 0
          ? "学生公寓 3 号楼"
          : "校园 · " + (i % 2 === 0 ? "图书馆" : "学生公寓"),
      urgency: i === 0 ? "CRITICAL" : i === 4 ? "URGENT" : "NORMAL",
      riskLevel: s[2] as Ticket["riskLevel"],
      status,
      studentId: `S${1001 + i}`,
      studentName: s[5],
      college: "信息工程学院",
      counselorId: user.userId,
      deptId: status === "PENDING_REVIEW" ? null : dept.deptId,
      handlerId:
        status === "PENDING_REVIEW" ? null : dept.handlers[0].handlerId,
      parentTicketId: null,
      attachments: [],
      aiSummary: s[6],
      aiRiskReason:
        i === 0
          ? "描述包含持续睡眠困扰与学习功能受影响信号，建议辅导员优先联系，必要时转介专业支持。此提示不构成诊断。"
          : s[2] === "MEDIUM"
            ? "影响持续且存在时效性，建议及时关注。"
            : "暂未发现高风险信号，按常规流程跟进。",
      slaDeadline: status === "PENDING_REVIEW" ? null : iso(i === 4 ? -3 : 18),
      isOverdue: false,
      overdueLevel: "NORMAL",
      createdAt,
      updatedAt: iso(-i),
      reviewed: status !== "PENDING_REVIEW",
      suggestedDeptIds: [dept.deptId],
      logs: [
        {
          logId: `L${i}`,
          ticketId: `T20261108${String(i + 1).padStart(4, "0")}`,
          action: "SUBMIT",
          fromStatus: "DRAFT",
          toStatus: "PENDING_REVIEW",
          operatorId: `S${1001 + i}`,
          operatorRole: "STUDENT",
          remark: "学生提交诉求，AI 已完成初步识别。",
          createdAt,
        },
      ],
      notes: [],
      solution: ["PENDING_CONFIRM", "CONFIRMED", "ARCHIVED"].includes(status)
        ? "承办部门已完成处置并反馈结果，请学生核实。"
        : null,
      rejectReason:
        status === "REJECTED"
          ? "该诉求属于食堂管理范围，请辅导员重新确认承办部门。"
          : null,
      children: [],
      permissions: {
        canReview: false,
        canAssign: false,
        canSplit: false,
        canUrge: false,
        canNote: false,
        canRemind: false,
        canArchive: false,
      },
    };
  });
}
const key = "zhihui_mock_v1_pdf";
let tickets: Ticket[] = seed();
try {
  const saved = localStorage.getItem(key);
  if (saved) tickets = JSON.parse(saved);
} catch {
  localStorage.removeItem(key);
}
const save = () => localStorage.setItem(key, JSON.stringify(tickets));
function decorate(t: Ticket): Ticket {
  const closed = ["PENDING_CONFIRM", "CONFIRMED", "ARCHIVED", "DRAFT"].includes(
    t.status,
  );
  const overdue =
    !!t.slaDeadline && Date.parse(t.slaDeadline) < Date.now() && !closed;
  return {
    ...t,
    isOverdue: overdue,
    overdueLevel: overdue ? "WARNING" : "NORMAL",
    permissions: {
      canReview:
        !t.children.length && t.status === "PENDING_REVIEW" && !t.reviewed,
      canAssign:
        !t.children.length &&
        (t.status === "REJECTED" ||
          (t.status === "PENDING_REVIEW" && t.reviewed)),
      canSplit:
        !t.parentTicketId &&
        !t.children.length &&
        ["PENDING_REVIEW", "REJECTED"].includes(t.status),
      canUrge:
        !t.children.length && ["ASSIGNED", "PROCESSING"].includes(t.status),
      canNote: !["ARCHIVED", "DRAFT"].includes(t.status),
      canRemind: t.status === "PENDING_CONFIRM",
      canArchive:
        t.status !== "ARCHIVED" &&
        (t.status === "CONFIRMED" ||
          (t.children.length > 0 &&
            t.children.every((id) =>
              tickets.some(
                (c) =>
                  c.ticketId === id &&
                  ["CONFIRMED", "ARCHIVED"].includes(c.status),
              ),
            ))),
    },
  };
}
const ok = (data: unknown) =>
  HttpResponse.json({ code: 0, msg: "success", data });
const fail = (code: number, msg: string) =>
  HttpResponse.json({ code, msg, data: null }, { status: code });
function dashboard(): Dashboard {
  const list = tickets.map(decorate);
  const completed = list.filter((t) =>
    ["CONFIRMED", "ARCHIVED"].includes(t.status),
  );
  return {
    stats: {
      pending: list.filter((t) => t.status === "PENDING_REVIEW").length,
      active: list.filter((t) => ["ASSIGNED", "PROCESSING"].includes(t.status))
        .length,
      overdue: list.filter((t) => t.isOverdue).length,
      highRisk: list.filter(
        (t) =>
          t.riskLevel === "HIGH" &&
          !["CONFIRMED", "ARCHIVED"].includes(t.status),
      ).length,
      completed: completed.length,
      total: list.length,
    },
    trend: Array.from({ length: 7 }, (_, i) => {
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
      }).format(new Date(Date.now() - (6 - i) * 86400000));
      const same = (v: string) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
          new Date(v),
        ) === date;
      return {
        date,
        submitted: list.filter((t) => same(t.createdAt)).length,
        completed: completed.filter((t) => same(t.updatedAt)).length,
      };
    }),
    priority: list
      .filter((t) => !["CONFIRMED", "ARCHIVED", "DRAFT"].includes(t.status))
      .sort(
        (a, b) =>
          Number(b.riskLevel === "HIGH") - Number(a.riskLevel === "HIGH") ||
          Number(b.isOverdue) - Number(a.isOverdue) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      )
      .slice(0, 4),
    departments: departments.map((d) => {
      const group = list.filter((t) => t.deptId === d.deptId);
      const done = completed.filter((t) => t.deptId === d.deptId);
      return {
        deptId: d.deptId,
        name: d.short,
        active: group.filter((t) =>
          ["ASSIGNED", "PROCESSING"].includes(t.status),
        ).length,
        completed: done.length,
        total: group.length,
        onTime: done.length
          ? Math.round(
              (done.filter(
                (t) =>
                  t.slaDeadline &&
                  Date.parse(t.updatedAt) <= Date.parse(t.slaDeadline),
              ).length /
                done.length) *
                100,
            )
          : null,
        avgHours: done.length
          ? Math.round(
              (done.reduce(
                (s, t) =>
                  s +
                  (Date.parse(t.updatedAt) - Date.parse(t.createdAt)) / 3600000,
                0,
              ) /
                done.length) *
                10,
            ) / 10
          : null,
      };
    }),
    categories: categories
      .map((c) => ({
        name: c.label,
        value: list.filter((t) => t.category === c.value).length,
      }))
      .filter((c) => c.value > 0),
    risks: [
      {
        name: "低风险",
        value: list.filter((t) => t.riskLevel === "LOW").length,
      },
      {
        name: "中风险",
        value: list.filter((t) => t.riskLevel === "MEDIUM").length,
      },
      {
        name: "高风险",
        value: list.filter((t) => t.riskLevel === "HIGH").length,
      },
    ],
  };
}
export const worker = setupWorker(
  http.all("/api/*", async ({ request }) => {
    await delay(180);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/login") return;
    const scenario = request.headers.get("X-Mock-Scenario");
    if (scenario === "forbidden") return fail(403, "无权访问该数据");
    if (scenario === "error") return fail(500, "服务暂不可用，请稍后重试");
    if (request.headers.get("Authorization") !== "Bearer mock-counselor-token")
      return fail(401, "登录已失效，请重新登录");
  }),
  http.post("/api/auth/login", async ({ request }) => {
    const b = (await request.json()) as { account: string; password: string };
    return b.account === "counselor01" && b.password === "demo123"
      ? ok({ token: "mock-counselor-token", user })
      : fail(401, "账号或密码错误");
  }),
  http.get("/api/auth/me", () => ok(user)),
  http.get("/api/dicts/responsibility", () => ok({ departments, categories })),
  http.get("/api/counselor/dashboard", () => ok(dashboard())),
  http.get(/\/api\/counselor\/tickets(?:\/pending)?$/, ({ request }) => {
    const url = new URL(request.url);
    const p = url.searchParams;
    if (url.pathname.endsWith("/pending")) p.set("status", "PENDING_REVIEW");
    const page = Number(p.get("page") || 1),
      pageSize = Number(p.get("pageSize") || 10);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 50
    )
      return fail(400, "分页参数不正确");
    let list = tickets
      .map(decorate)
      .filter(
        (t) =>
          (!p.get("status") ||
            p.get("status")!.split(",").includes(t.status)) &&
          (!p.get("riskLevel") || t.riskLevel === p.get("riskLevel")) &&
          (!p.get("isOverdue") || String(t.isOverdue) === p.get("isOverdue")) &&
          (!p.get("q") ||
            `${t.title} ${t.ticketId} ${t.studentName}`
              .toLowerCase()
              .includes(p.get("q")!.toLowerCase())),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (request.headers.get("X-Mock-Scenario") === "empty") list = [];
    return ok({
      list: list.slice((page - 1) * pageSize, page * pageSize),
      total: list.length,
      page,
      pageSize,
    });
  }),
  http.get("/api/counselor/tickets/:id", ({ params }) => {
    const t = tickets.find((t) => t.ticketId === params.id);
    return t ? ok(decorate(t)) : fail(404, "工单不存在或不在你的授权范围内");
  }),
  http.post(
    "/api/counselor/tickets/:id/:action",
    async ({ request, params }) => {
      const t = tickets.find((t) => t.ticketId === params.id);
      if (!t) return fail(404, "工单不存在");
      const action = String(params.action);
      const b = (await request.json()) as Record<string, unknown>;
      const permissions = decorate(t).permissions;
      const permission = {
        review: "canReview",
        assign: "canAssign",
        split: "canSplit",
        urge: "canUrge",
        notes: "canNote",
        "remind-confirm": "canRemind",
        archive: "canArchive",
      }[action] as keyof typeof permissions | undefined;
      if (!permission) return fail(404, "接口不存在");
      if (!permissions[permission])
        return fail(409, "工单状态已变化，请刷新后操作");
      const from = t.status;
      let remark = String(b.remark || "").trim();
      let logAction = action.toUpperCase();
      if (action === "review") {
        if (typeof b.approved !== "boolean") return fail(422, "请选择审核结果");
        if (!b.approved && !remark) return fail(422, "退回时请填写原因");
        t.reviewed = b.approved;
        if (!b.approved) t.status = "DRAFT";
        remark = remark || (b.approved ? "审核通过，等待分派" : "退回补充");
      }
      if (action === "assign") {
        const d = departments.find((d) => d.deptId === b.deptId);
        if (
          !d ||
          !d.handlers.some((h) => h.handlerId === b.handlerId) ||
          !Number.isFinite(b.slaHours) ||
          Number(b.slaHours) < 1 ||
          Number(b.slaHours) > 168
        )
          return fail(422, "请选择部门、经办人及 1–168 小时的时限");
        t.deptId = d.deptId;
        t.handlerId = String(b.handlerId);
        t.slaDeadline = iso(Number(b.slaHours));
        t.status = "ASSIGNED";
        t.rejectReason = null;
        remark = `分派至${d.name}。${remark}`;
      }
      if (action === "split") {
        const children = b.children as SplitItem[];
        if (
          !Array.isArray(children) ||
          children.length < 2 ||
          children.length > 5 ||
          children.some(
            (c) =>
              !c.title?.trim() ||
              c.title.length > 40 ||
              !c.content?.trim() ||
              !departments.some((d) => d.deptId === c.deptId),
          ) ||
          new Set(children.map((c) => c.title.trim())).size !== children.length
        )
          return fail(422, "请填写 2–5 个不同子项，每项包含标题、描述和部门");
        children.forEach((c, i) => {
          const id = `${t.ticketId}-${i + 1}`;
          const d = departments.find((d) => d.deptId === c.deptId)!;
          tickets.push({
            ...structuredClone(t),
            ticketId: id,
            title: c.title.trim(),
            content: c.content.trim(),
            parentTicketId: t.ticketId,
            deptId: d.deptId,
            handlerId: d.handlers[0].handlerId,
            status: "ASSIGNED",
            reviewed: true,
            slaDeadline: iso(d.slaHours),
            createdAt: iso(0),
            updatedAt: iso(0),
            children: [],
            notes: [],
            rejectReason: null,
            solution: null,
            aiSummary: null,
            logs: [
              {
                logId: crypto.randomUUID(),
                ticketId: id,
                action: "SPLIT",
                fromStatus: "PENDING_REVIEW",
                toStatus: "ASSIGNED",
                operatorId: user.userId,
                operatorRole: "COUNSELOR",
                remark: `从父工单 ${t.ticketId} 拆分`,
                createdAt: iso(0),
              },
            ],
          });
          t.children.push(id);
        });
        remark = "已拆分为独立流转子工单，父工单保留原状态。";
      }
      if (action === "urge") {
        if (!remark) return fail(422, "请填写催办说明");
        logAction = "WARN";
      }
      if (action === "notes") {
        const text = String(b.text || "").trim();
        if (!text || text.length > 1000) return fail(422, "备注需为 1–1000 字");
        t.notes.push({
          noteId: crypto.randomUUID(),
          text,
          actor: user.name,
          createdAt: iso(0),
        });
        remark = "添加内部备注";
        logAction = "NOTE";
      }
      if (action === "remind-confirm") {
        remark = "已向学生发送确认提醒";
        logAction = "REMIND";
      }
      if (action === "archive") {
        t.status = "ARCHIVED";
        remark = "工单已归档";
      }
      t.updatedAt = iso(0);
      t.logs.push({
        logId: crypto.randomUUID(),
        ticketId: t.ticketId,
        action: logAction,
        fromStatus: from,
        toStatus: t.status,
        operatorId: user.userId,
        operatorRole: "COUNSELOR",
        remark,
        createdAt: t.updatedAt,
      });
      save();
      return ok(decorate(t));
    },
  ),
);
