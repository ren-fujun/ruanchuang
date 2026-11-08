export type Status =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "ASSIGNED"
  | "PROCESSING"
  | "REJECTED"
  | "PENDING_CONFIRM"
  | "CONFIRMED"
  | "ARCHIVED";
export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type Urgency = "NORMAL" | "URGENT" | "CRITICAL";
export interface Department {
  deptId: string;
  name: string;
  short: string;
  slaHours: number;
  handlers: { handlerId: string; name: string }[];
}
export interface User {
  userId: string;
  name: string;
  role: "COUNSELOR";
  college: string;
  scope: string;
}
export interface TicketLog {
  logId: string;
  ticketId: string;
  action: string;
  fromStatus: Status;
  toStatus: Status;
  operatorId: string;
  operatorRole: string;
  remark: string;
  createdAt: string;
}
export interface Note {
  noteId: string;
  text: string;
  actor: string;
  createdAt: string;
}
export interface Permissions {
  canReview: boolean;
  canAssign: boolean;
  canSplit: boolean;
  canUrge: boolean;
  canNote: boolean;
  canRemind: boolean;
  canArchive: boolean;
}
export interface Ticket {
  ticketId: string;
  title: string;
  content: string;
  category: string;
  location: string | null;
  urgency: Urgency;
  riskLevel: Risk;
  status: Status;
  studentId: string;
  counselorId: string | null;
  deptId: string | null;
  handlerId: string | null;
  parentTicketId: string | null;
  attachments: string[];
  aiSummary: string | null;
  aiRiskReason: string | null;
  slaDeadline: string | null;
  isOverdue: boolean;
  overdueLevel: "NORMAL" | "WARNING" | "SERIOUS";
  createdAt: string;
  updatedAt: string;
  // PDF 未完整定义的展示/操作扩展，详见 docs/接口补充与交接.md
  studentName: string;
  college: string;
  reviewed: boolean;
  suggestedDeptIds: string[];
  logs: TicketLog[];
  notes: Note[];
  solution: string | null;
  rejectReason: string | null;
  children: string[];
  permissions: Permissions;
}
export interface Page<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Trend {
  date: string;
  submitted: number;
  completed: number;
}
export interface Dashboard {
  stats: {
    pending: number;
    active: number;
    overdue: number;
    highRisk: number;
    completed: number;
    total: number;
  };
  trend: Trend[];
  priority: Ticket[];
  departments: {
    deptId: string;
    name: string;
    active: number;
    completed: number;
    total: number;
    onTime: number | null;
    avgHours: number | null;
  }[];
  categories: { name: string; value: number }[];
  risks: { name: string; value: number }[];
}
export interface Dictionaries {
  departments: Department[];
  categories: { value: string; label: string }[];
}
export interface Filters {
  status?: string;
  riskLevel?: string;
  isOverdue?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}
export interface SplitItem {
  title: string;
  content: string;
  deptId: string;
}
