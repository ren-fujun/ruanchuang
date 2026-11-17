import { request, ApiError } from "../../lib/api";

export interface BundleItem {
  ticketId: string;
  title: string;
  status: string;
  result?: string;
  studentConfirmed?: boolean;
  reopened?: boolean;
  workStatus?: string;
  returnReason?: string;
}
export interface Bundle {
  id: string;
  title: string;
  departmentId: string;
  status: string;
  version: number;
  items: BundleItem[];
  reason?: string;
}
export interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  ownerName: string;
  available: boolean;
}
export interface Appointment {
  id: string;
  version: number;
  status: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  ownerName: string;
}
export interface AcademicCase {
  id: string;
  studentName: string;
  course: string;
  status: string;
  version: number;
  result: { value: 'passed' | 'failed'; source: string; at: string } | null;
  records: { type: string; at: string; actor: string }[];
}
export async function cRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const unavailable =
    init.method && init.method !== "GET"
      ? "该服务尚未接入，当前填写内容已保留。"
      : "该服务尚未接入，请稍后重试。";
  try {
    const result = await request<T>(path, init);
    if (!result || typeof result !== "object")
      throw new ApiError(unavailable, 501);
    return result;
  } catch (error) {
    if (error instanceof ApiError && [404, 405, 501].includes(error.status)) {
      throw new ApiError(unavailable, error.status);
    }
    throw error;
  }
}
export const write = <T>(path: string, body: unknown, method = "POST") =>
  cRequest<T>(path, { method, body: JSON.stringify(body) });
export const operationId = () => crypto.randomUUID();
