// スケジュール（カレンダー）で使う投影型。サーバーの query.ts で作り、クライアントへ props で渡す。
// 日付は "YYYY-MM-DD"、月は "YYYY-MM" の文字列。Date オブジェクトはクライアントへ渡さない（TZ事故防止）。

export type PersonRef = {
  id: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
};

export type OccurrenceView = {
  id: string;
  version: number;
  jobId: string | null;
  ruleKind: string | null; // 定期由来なら Job.ruleKind
  ruleSummary: string | null; // describeRule の結果（定期のときのみ）
  title: string; // 表示名（title ?? 顧客短縮名 ?? 物件名）
  department: string;
  category: string;
  status: string; // OccurrenceStatus
  source: string;
  targetMonth: string;
  date: string | null; // null = 未割当レーン
  endDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel: string | null; // "前半" / "後半" など
  startTime: string | null;
  endTime: string | null;
  customer: { id: string; name: string; shortName: string | null } | null;
  property: {
    id: string;
    name: string;
    address: string | null;
    keyboxNumber: string | null;
    keyboxPlace: string | null;
    accessNote: string | null;
  } | null;
  headcount: number | null;
  unitCount: number | null;
  vehicle: string | null;
  note: string | null;
  customerNameRaw: string | null;
  assignees: PersonRef[];
  createdBy: PersonRef | null;
  /** 金額。閲覧権限がある場合のみ存在する（無い場合は undefined。null は未設定） */
  amount?: number | null;
};

export type ViewMode = "month" | "week" | "day" | "board";

export type FilterState = {
  view: ViewMode;
  date: string; // 基準日 "YYYY-MM-DD"
  dept: "ALL" | "CLEANING" | "CONSTRUCTION";
  worker: string | null;
  category: string | null;
  customer: string | null;
  status: string | null;
  mine: boolean;
  q: string;
};

export type WorkerOption = PersonRef & {
  kind: string;
  department: string | null;
  tags: string[];
  partnerName: string | null;
};

export type CustomerOption = { id: string; name: string; shortName: string | null; kana?: string | null };
export type PropertyOption = { id: string; name: string; customerId: string; address: string | null };

export type ChangeLogView = {
  id: string;
  action: string;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  scope: string | null;
  reason: string | null;
  actor: PersonRef | null;
  createdAt: string; // ISO
};

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      code?: "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION";
      latest?: OccurrenceView;
    };

export type MoveInput = {
  date: string | null;
  workerAdd?: string[];
  workerRemove?: string[];
  scope: "ONE" | "FOLLOWING";
  reason?: string;
};

export type OccurrenceInput = {
  department: string;
  category: string;
  customerId: string | null;
  propertyId: string | null;
  title: string | null;
  date: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  headcount: number | null;
  unitCount: number | null;
  vehicle: string | null;
  note: string | null;
  amount?: number | null;
  workerIds: string[];
};

export type ScheduleData = {
  filters: FilterState;
  range: { start: string; end: string }; // end は排他
  occurrences: OccurrenceView[];
  unassigned: OccurrenceView[];
  workers: WorkerOption[];
  customers: CustomerOption[];
  properties: PropertyOption[];
  showAmount: boolean;
  today: string;
  me: { id: string; name: string; role: string; department: string | null };
  defaultTimes: { start: string; end: string };
};
