// 全体連絡（純関数。サーバー／クライアント両方から使う）
import { ROLE_LABEL, ROLE_OPTIONS, type Role } from "@/lib/constants";

export type AnnouncementCategory = "GENERAL" | "EVENT" | "CLAIM";
export const ANNOUNCEMENT_CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  GENERAL: "社内連絡",
  EVENT: "行事・イベント",
  CLAIM: "クレーム・再発防止",
};
export const ANNOUNCEMENT_CATEGORY_OPTIONS: AnnouncementCategory[] = ["GENERAL", "EVENT", "CLAIM"];
export function isAnnouncementCategory(v: unknown): v is AnnouncementCategory {
  return v === "GENERAL" || v === "EVENT" || v === "CLAIM";
}

/** クレームの共有で使うひな形 */
export const CLAIM_TEMPLATE = "【発生日・現場】\n\n【クレームの内容】\n\n【原因】\n\n【対応・再発防止】\n";

/** 宛先の役割の並び（全員の次に、現場に近い順） */
export const AUDIENCE_ROLE_OPTIONS: Role[] = ROLE_OPTIONS;

/** 宛先の値を整える。全員（ALL）が入っていれば ["ALL"]。役割は既知のものだけ、重複なし */
export function normalizeAudience(values: string[]): string[] {
  if (values.includes("ALL")) return ["ALL"];
  return AUDIENCE_ROLE_OPTIONS.filter((r) => values.includes(r));
}

/** 宛先の表示（例：全員／スタッフ・手配担当） */
export function audienceLabel(audience: string[]): string {
  if (audience.includes("ALL")) return "全員";
  const roles = AUDIENCE_ROLE_OPTIONS.filter((r) => audience.includes(r));
  return roles.length ? roles.map((r) => ROLE_LABEL[r]).join("・") : "—";
}

/** その役割の人が宛先に含まれるか */
export function isInAudience(role: string, audience: string[]): boolean {
  return audience.includes("ALL") || audience.includes(role);
}

/** 全体連絡は社内連絡なので、社員・アルバイトだけに届ける（協力会社・下請のアカウントは除く） */
export const ANNOUNCEMENT_WORKER_KINDS = ["EMPLOYEE", "PARTTIME"];
export function isInternalWorker(kind: string): boolean {
  return ANNOUNCEMENT_WORKER_KINDS.includes(kind);
}

export function announcementDedupeKey(id: string): string {
  return `announce:${id}`;
}
