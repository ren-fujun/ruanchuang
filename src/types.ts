export type Role = 'student' | 'counselor'

export interface User {
  id: string
  role: Role
  name: string
  account: string
  studentNo?: string
  college: string
  major?: string
  className?: string
  grade?: string
  phone: string
  avatarTone: string
  counselor?: string
  room?: string
  title?: string
  department?: string
  scope?: string
  studentCount?: number
  onDuty?: string
}

export interface Department {
  id: string
  name: string
  short: string
  icon: string
  color: string
  soft: string
  sla: number
  contact: string
  phone: string
  active: number
  avgHours: number
  onTime: number
  completed?: number
  total?: number
  load?: number
}

export interface TimelineEvent {
  id: string
  type: string
  title: string
  desc: string
  at: string
  actor: string
}

export interface Attachment {
  name: string
  type: string
  size: string
}

export interface Rating {
  score: number
  comment: string
  tags: string[]
  at: string
}

export interface TicketAI {
  summary: string
  risk: 'low' | 'medium' | 'high'
  riskReason: string
  sentiment: string
  confidence: number
  suggestedDepartments: string[]
  coordinationReason?: string
  missingInfo?: string[]
  tags: string[]
  draft: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  category: string
  location: string
  urgency: 'normal' | 'high' | 'urgent'
  risk: 'low' | 'medium' | 'high'
  status: 'pending_review' | 'assigned' | 'processing' | 'awaiting_confirm' | 'completed'
  studentId: string
  studentName: string
  college: string
  departmentIds: string[]
  departments: Department[]
  suggestedDepartments: Department[]
  assignee?: string | null
  createdAt: string
  updatedAt: string
  dueAt: string
  slaMinutes: number
  ai: TicketAI
  attachments: Attachment[]
  rating: Rating | null
  timeline: TimelineEvent[]
  notes: { id: string; text: string; at: string; actor: string }[]
  lastUrgedAt: string | null
  source: string
  parentId: string | null
  statusLabel: string
  urgencyLabel: string
  riskLabel: string
  progress: number
  overdue: boolean
  minutesLeft: number
  isHighRisk: boolean
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  at: string
  read: boolean
  ticketId: string | null
  tone: string
}

export interface Knowledge {
  id: string
  title: string
  category: string
  keywords?: string[]
  summary: string
  answer: string
  steps: string[]
  departmentId: string
  updatedAt: string
  hot: boolean
  icon: string
}

export interface StudentHomeData {
  user: User
  stats: { active: number; awaiting: number; completed: number; total: number }
  featured: Ticket | null
  activeTickets: Ticket[]
  updates: (TimelineEvent & { ticketId: string; ticketTitle: string; category: string })[]
  knowledge: Knowledge[]
  notifications: Notification[]
  unread: number
  aiTip: string
}

export interface CounselorDashboard {
  user: User
  stats: {
    pending: number
    processing: number
    overdue: number
    highRisk: number
    todayNew: number
    active: number
    completed: number
    total: number
    avgResponse: number
    satisfaction: number
    onTimeRate: number
    closureRate: number
    dormPending: number
    dormChecked: number
  }
  brief: { headline: string; detail: string; actions: string[] }
  urgent: Ticket[]
  queue: Ticket[]
  week: { key: string; label: string; date: string; created: number; completed: number }[]
  categories: { name: string; value: number; color: string }[]
  departments: Department[]
  unread: number
  unreadMessages: Notification[]
}

export interface InsightsData {
  summary: {
    total: number
    weekly: number
    satisfaction: number
    onTimeRate: number
    closureRate: number
    highRisk: number
    avgResponse: number
  }
  week: { key: string; label: string; date: string; created: number; completed: number }[]
  categories: { name: string; value: number; color: string }[]
  departments: Department[]
  hotTags: { name: string; value: number }[]
  timeSlots: { name: string; range: string; value: number }[]
  risk: { high: number; medium: number; low: number }
  suggestion: { title: string; body: string; action: string }
}

export interface PrecheckResult {
  analysis: {
    category: string
    urgency: 'normal' | 'high' | 'urgent'
    risk: 'low' | 'medium' | 'high'
    riskReason: string
    riskHits: string[]
    sentiment: string
    summary: string
    tags: string[]
    suggestedDepartments: string[]
    suggestedDepartmentNames: string[]
    confidence: number
    draft: string
    slaMinutes: number
  }
  knowledge: {
    id: string
    title: string
    summary: string
    steps: string[]
    departmentId: string
    updatedAt: string
    matchScore: number
    related: string[]
  } | null
  answer: string
  canSelfSolve: boolean
  needsTicket: boolean
  quickReplies: string[]
}

export interface TicketDetailData {
  ticket: Ticket
  related: Ticket[]
  student: {
    id: string
    name: string
    college: string
    grade: string
    tags: string[]
    historyCount: number
  }
  permissions: {
    canReview: boolean
    canUrge: boolean
    canProgress: boolean
    canConfirm: boolean
    canRate: boolean
    canStudentUrge: boolean
  }
}

export type DormRoomStatus = 'pending' | 'checked' | 'exception' | 'absent'

export interface DormRoom {
  id: string
  building: string
  floor: number
  room: string
  students: string[]
  status: DormRoomStatus
  lastCheckAt: string | null
  lastInspector: string | null
  presentCount: number | null
  absentStudents: string[]
  issues: string[]
  todayCheckedAt: string | null
}

export interface DormRecord {
  id: string
  roomId: string
  building: string
  floor: number
  room: string
  inspectorId: string
  inspectorName: string
  checkedAt: string
  result: 'normal' | 'exception'
  presentCount: number
  absentStudents: string[]
  issues: string[]
  note: string
  attachments: { name: string; type: string; size: string }[]
}

export interface DormCheckData {
  date: string
  building: string
  floor: number
  summary: {
    total: number
    checked: number
    pending: number
    normal: number
    exception: number
    absent: number
    progress: number
  }
  rooms: DormRoom[]
  records: DormRecord[]
}

