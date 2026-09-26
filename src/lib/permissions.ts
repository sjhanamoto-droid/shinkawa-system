// 権限マトリクス（純関数。サーバー／クライアント両方から使う）
//
// 役割: OWNER(最高管理者) / OFFICE(事務・経理) / SCHEDULER(手配担当) / STAFF(スタッフ)
// - 金額（amount）は OWNER / OFFICE のみ。他の役割にはサーバー側で select しない（HTML に含めない）。
// - SCHEDULER は自分の部門（department）の予定だけ編集できる。department が null の SCHEDULER は両部門。
// - STAFF は閲覧と、自分が担当する回の「完了」だけ。

export type Actor = {
  id: string;
  role: string;
  department: string | null;
};

export type Action =
  | "occurrence.view"
  | "occurrence.create"
  | "occurrence.edit"
  | "occurrence.move"
  | "occurrence.assign"
  | "occurrence.status"
  | "occurrence.delete"
  | "changelog.view"
  | "job.manage"
  | "generate.run"
  | "customer.manage"
  | "customer.import"
  | "property.manage"
  | "worker.manage"
  | "partner.manage"
  | "vehicle.manage"
  | "settings.manage"
  | "announcement.send"
  | "claim.manage"
  | "amount.view"
  | "amount.edit";

export type Resource = {
  department?: string | null;
  assigneeIds?: string[];
  nextStatus?: string;
};

export const ALL_ACTIONS: Action[] = [
  "occurrence.view",
  "occurrence.create",
  "occurrence.edit",
  "occurrence.move",
  "occurrence.assign",
  "occurrence.status",
  "occurrence.delete",
  "changelog.view",
  "job.manage",
  "generate.run",
  "customer.manage",
  "customer.import",
  "property.manage",
  "worker.manage",
  "partner.manage",
  "vehicle.manage",
  "settings.manage",
  "announcement.send",
  "claim.manage",
  "amount.view",
  "amount.edit",
];

export function isOwner(a: Actor | null | undefined): boolean {
  return a?.role === "OWNER";
}
export function isOffice(a: Actor | null | undefined): boolean {
  return a?.role === "OFFICE";
}
export function isScheduler(a: Actor | null | undefined): boolean {
  return a?.role === "SCHEDULER";
}
export function isStaff(a: Actor | null | undefined): boolean {
  return a?.role === "STAFF";
}
/** 予定を編集できる役割（OWNER / OFFICE / SCHEDULER） */
export function isPlanner(a: Actor | null | undefined): boolean {
  return isOwner(a) || isOffice(a) || isScheduler(a);
}
/** マスタ管理・設定など管理系（OWNER / OFFICE） */
export function isManager(a: Actor | null | undefined): boolean {
  return isOwner(a) || isOffice(a);
}

export function canViewAmounts(a: Actor | null | undefined): boolean {
  return isManager(a);
}

/** その部門の予定・案件を編集できるか */
export function canEditDepartment(
  a: Actor | null | undefined,
  dept: string | null | undefined,
): boolean {
  if (!a) return false;
  if (isManager(a)) return true;
  if (isScheduler(a)) {
    if (!a.department) return true; // 部門未設定の手配担当は両方
    if (!dept) return true; // 部門のない対象（休み等）は可
    return a.department === dept;
  }
  return false;
}

export function can(a: Actor | null | undefined, action: Action, resource?: Resource): boolean {
  if (!a) return false;
  const dept = resource?.department;

  switch (action) {
    case "occurrence.view":
    case "changelog.view":
      return true;

    case "occurrence.create":
    case "occurrence.edit":
    case "occurrence.move":
    case "occurrence.assign":
    case "occurrence.delete":
    case "job.manage":
    case "generate.run":
      return canEditDepartment(a, dept);

    case "occurrence.status": {
      if (canEditDepartment(a, dept)) return true;
      if (isStaff(a)) {
        const mine = resource?.assigneeIds?.includes(a.id) ?? false;
        return mine && resource?.nextStatus === "DONE";
      }
      return false;
    }

    case "customer.manage":
    case "property.manage":
      return isPlanner(a);

    case "customer.import":
    case "worker.manage":
    case "partner.manage":
    case "vehicle.manage":
    case "settings.manage":
    case "announcement.send":
    case "claim.manage":
      return isManager(a);

    case "amount.view":
    case "amount.edit":
      return canViewAmounts(a);

    default:
      return false;
  }
}

export class PermissionError extends Error {
  code = "FORBIDDEN" as const;
  constructor(message = "この操作を行う権限がありません") {
    super(message);
    this.name = "PermissionError";
  }
}

export function assertCan(a: Actor | null | undefined, action: Action, resource?: Resource): void {
  if (!can(a, action, resource)) throw new PermissionError();
}
