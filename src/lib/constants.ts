// シンカワシステム 区分値の定義（Prisma enum は使わず、アプリ層で制約する）
// ラベル・色をここに集約し、UI 全体で共有する。

// ── 役割（権限） ──
// OWNER(最高管理者) > OFFICE(事務・経理) > SCHEDULER(手配担当) > STAFF(スタッフ)
export type Role = "OWNER" | "OFFICE" | "SCHEDULER" | "STAFF";
export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "最高管理者",
  OFFICE: "事務・経理",
  SCHEDULER: "手配担当",
  STAFF: "スタッフ",
};
export const ROLE_OPTIONS: Role[] = ["STAFF", "SCHEDULER", "OFFICE", "OWNER"];
export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "全機能。ユーザー・権限・設定の管理。金額の閲覧",
  OFFICE: "予定の登録・移動・確定、マスタ管理、金額の閲覧・集計",
  SCHEDULER: "担当部門の予定の登録・移動・配員（金額は非表示）",
  STAFF: "自分の予定の閲覧、完了報告（金額は非表示）",
};
export function isRole(v: string): v is Role {
  return (ROLE_OPTIONS as string[]).includes(v);
}

// ── 部門 ──
export type Department = "CLEANING" | "CONSTRUCTION";
export const DEPARTMENT_LABEL: Record<Department, string> = {
  CLEANING: "クリーニング",
  CONSTRUCTION: "工事",
};
export const DEPARTMENT_OPTIONS: Department[] = ["CLEANING", "CONSTRUCTION"];
export const DEPARTMENT_COLOR: Record<Department, string> = {
  CLEANING: "#0ea5e9",
  CONSTRUCTION: "#f97316",
};
export function isDepartment(v: string | null | undefined): v is Department {
  return v === "CLEANING" || v === "CONSTRUCTION";
}

// ── 種別（サイボウズのカレンダーのラベルに合わせる。色は種別固定） ──
// 並び順＝予定の追加フォームや凡例に出る順。キーは保存値なので変えないこと（表示名は label を変える）。
export type CategoryKey =
  | "HANDOVER_CLEANING"
  | "REGULAR_CLEANING"
  | "FLOOR_CLEANING"
  | "AIRCON"
  | "POST_REFORM_CLEANING"
  | "VACANT"
  | "INTERIOR"
  | "EXTERIOR"
  | "CLOTH"
  | "SURVEY"
  | "WASTE_DISPOSAL"
  | "SUPPORT"
  | "OFF"
  | "OTHER";
export type CategoryDef = {
  label: string;
  short: string;
  color: string;
  department: Department | null; // null は両部門共通
};
export const CATEGORY: Record<CategoryKey, CategoryDef> = {
  HANDOVER_CLEANING: { label: "引渡し清掃", short: "引渡", color: "#14b8a6", department: "CLEANING" },
  REGULAR_CLEANING: { label: "定期清掃", short: "定期", color: "#10b981", department: "CLEANING" },
  FLOOR_CLEANING: { label: "床清掃", short: "床", color: "#0ea5e9", department: "CLEANING" },
  AIRCON: { label: "エアコン", short: "AC", color: "#3b82f6", department: "CLEANING" },
  POST_REFORM_CLEANING: { label: "リフォーム後清掃", short: "R後", color: "#06b6d4", department: "CLEANING" },
  VACANT: { label: "空室", short: "空室", color: "#6366f1", department: "CLEANING" },
  INTERIOR: { label: "内装工事", short: "内装", color: "#f97316", department: "CONSTRUCTION" },
  EXTERIOR: { label: "外壁工事", short: "外壁", color: "#ef4444", department: "CONSTRUCTION" },
  CLOTH: { label: "クロス工事", short: "クロス", color: "#d946ef", department: "CONSTRUCTION" },
  SURVEY: { label: "現調", short: "現調", color: "#8b5cf6", department: null },
  WASTE_DISPOSAL: { label: "産廃処分", short: "産廃", color: "#78716c", department: null },
  SUPPORT: { label: "作業応援", short: "応援", color: "#f59e0b", department: null },
  OFF: { label: "休み", short: "休", color: "#64748b", department: null },
  OTHER: { label: "その他", short: "他", color: "#94a3b8", department: null },
};
export const CATEGORY_OPTIONS = Object.keys(CATEGORY) as CategoryKey[];
export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((k) => [k, CATEGORY[k].label]),
);
export function isCategory(v: string | null | undefined): v is CategoryKey {
  return !!v && v in CATEGORY;
}
export function categoryColor(key: string | null | undefined): string {
  return (key && isCategory(key) ? CATEGORY[key].color : null) ?? "#64748b";
}
export function categoryShort(key: string | null | undefined): string {
  return key && isCategory(key) ? CATEGORY[key].short : "—";
}
// 「休み」など、担当が付いていなくても未割当扱いにしない種別
export const NON_WORK_CATEGORIES: CategoryKey[] = ["OFF"];

// ── 実施回の状態 ──
export type OccurrenceStatus = "UNASSIGNED" | "TENTATIVE" | "CONFIRMED" | "DONE" | "CANCELLED";
export const OCCURRENCE_STATUS_LABEL: Record<OccurrenceStatus, string> = {
  UNASSIGNED: "未割当",
  TENTATIVE: "仮",
  CONFIRMED: "確定",
  DONE: "完了",
  CANCELLED: "中止",
};
export const OCCURRENCE_STATUS_OPTIONS: OccurrenceStatus[] = [
  "UNASSIGNED",
  "TENTATIVE",
  "CONFIRMED",
  "DONE",
  "CANCELLED",
];
export type Tone = "survey" | "active" | "past" | "warn" | "danger" | "info";
export const OCCURRENCE_STATUS_TONE: Record<OccurrenceStatus, Tone> = {
  UNASSIGNED: "past",
  TENTATIVE: "warn",
  CONFIRMED: "active",
  DONE: "info",
  CANCELLED: "danger",
};
export function isOccurrenceStatus(v: string | null | undefined): v is OccurrenceStatus {
  return !!v && (OCCURRENCE_STATUS_OPTIONS as string[]).includes(v);
}

// ── 案件の契約種別 ──
export type ContractType = "REGULAR" | "SPOT" | "CONSTRUCTION";
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  REGULAR: "定期契約",
  SPOT: "スポット",
  CONSTRUCTION: "工事",
};
export const CONTRACT_TYPE_OPTIONS: ContractType[] = ["REGULAR", "SPOT", "CONSTRUCTION"];

export type JobStatus = "ACTIVE" | "PAUSED" | "ENDED";
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  ACTIVE: "有効",
  PAUSED: "休止",
  ENDED: "終了",
};
export const JOB_STATUS_OPTIONS: JobStatus[] = ["ACTIVE", "PAUSED", "ENDED"];

// ── 周期ルール ──
export type RuleKind =
  | "MONTHLY"
  | "TWICE_MONTHLY"
  | "WEEKLY"
  | "NTH_WEEKDAY"
  | "EVERY_N_MONTHS"
  | "SEASONAL";
export const RULE_KIND_LABEL: Record<RuleKind, string> = {
  MONTHLY: "毎月",
  TWICE_MONTHLY: "月2回（前半・後半）",
  WEEKLY: "毎週",
  NTH_WEEKDAY: "第n曜日",
  EVERY_N_MONTHS: "nか月ごと",
  SEASONAL: "季節（指定月）",
};
export const RULE_KIND_OPTIONS: RuleKind[] = [
  "MONTHLY",
  "TWICE_MONTHLY",
  "WEEKLY",
  "NTH_WEEKDAY",
  "EVERY_N_MONTHS",
  "SEASONAL",
];
export function isRuleKind(v: string | null | undefined): v is RuleKind {
  return !!v && (RULE_KIND_OPTIONS as string[]).includes(v);
}

// ── 作業者の区分 ──
export type WorkerKind = "EMPLOYEE" | "PARTTIME" | "PARTNER_STAFF" | "SUBCONTRACTOR";
export const WORKER_KIND_LABEL: Record<WorkerKind, string> = {
  EMPLOYEE: "社員",
  PARTTIME: "アルバイト",
  PARTNER_STAFF: "協力会社",
  SUBCONTRACTOR: "下請",
};
export const WORKER_KIND_OPTIONS: WorkerKind[] = [
  "EMPLOYEE",
  "PARTTIME",
  "PARTNER_STAFF",
  "SUBCONTRACTOR",
];
export const WORKER_TAG_SUGGESTIONS = [
  "アルバイト",
  "高所可",
  "床ワックス",
  "エアコン",
  "運転可",
  "夜間可",
  "土日可",
  "新人",
];

export type PartnerKind = "PARTNER" | "SUBCONTRACTOR";
export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  PARTNER: "協力会社",
  SUBCONTRACTOR: "下請",
};
export const PARTNER_KIND_OPTIONS: PartnerKind[] = ["PARTNER", "SUBCONTRACTOR"];

// ── 実施回の出所 ──
export type OccurrenceSource = "MANUAL" | "GENERATED" | "QUICK";
export const OCCURRENCE_SOURCE_LABEL: Record<OccurrenceSource, string> = {
  MANUAL: "手入力",
  GENERATED: "定期から生成",
  QUICK: "クイック登録",
};

// ── 変更履歴 ──
export type ChangeAction =
  | "CREATE"
  | "MOVE"
  | "ASSIGN"
  | "UNASSIGN"
  | "STATUS"
  | "EDIT"
  | "VEHICLE"
  | "CANCEL"
  | "DELETE"
  | "GENERATE";
export const CHANGE_ACTION_LABEL: Record<ChangeAction, string> = {
  CREATE: "作成",
  MOVE: "移動",
  ASSIGN: "担当追加",
  UNASSIGN: "担当解除",
  STATUS: "状態変更",
  EDIT: "編集",
  VEHICLE: "車両変更",
  CANCEL: "中止",
  DELETE: "削除",
  GENERATE: "生成",
};

// ── アバター色のプリセット ──
export const AVATAR_COLORS: { value: string; label: string }[] = [
  { value: "#2f63f5", label: "ブルー" },
  { value: "#1947e8", label: "ネイビー" },
  { value: "#0ea5e9", label: "スカイ" },
  { value: "#10b981", label: "グリーン" },
  { value: "#f98307", label: "オレンジ" },
  { value: "#f59e0b", label: "アンバー" },
  { value: "#8b5cf6", label: "パープル" },
  { value: "#ec4899", label: "ピンク" },
  { value: "#ef4444", label: "レッド" },
  { value: "#64748b", label: "グレー" },
];
export const DEFAULT_AVATAR_COLOR = "#2f63f5";

// ── 顧客 ──
export type RegistrationType = "PRIME" | "OWNER" | "PARTNER";
export const REGISTRATION_TYPE_LABEL: Record<RegistrationType, string> = {
  PRIME: "元請・管理会社",
  OWNER: "オーナー",
  PARTNER: "同業・協力会社",
};
export const REGISTRATION_TYPE_OPTIONS: RegistrationType[] = ["PRIME", "OWNER", "PARTNER"];

export type TradeStatus = "NEW" | "CONTINUING" | "SUSPENDED";
export const TRADE_STATUS_LABEL: Record<TradeStatus, string> = {
  NEW: "新規",
  CONTINUING: "継続",
  SUSPENDED: "取引停止",
};
export const TRADE_STATUS_COLOR: Record<TradeStatus, string> = {
  NEW: "info",
  CONTINUING: "active",
  SUSPENDED: "past",
};

export type PaymentMethod = "BANK" | "NOTE" | "DENSAI";
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  BANK: "振込",
  NOTE: "手形",
  DENSAI: "でんさい",
};

export type ContactType = "SITE" | "ACCOUNTING" | "APPROVER";
export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  SITE: "現場",
  ACCOUNTING: "経理",
  APPROVER: "決裁",
};

// ── 物件 ──
export type PropertyStatus = "ACTIVE" | "INACTIVE";
export const PROPERTY_STATUS_LABEL: Record<PropertyStatus, string> = {
  ACTIVE: "稼働中",
  INACTIVE: "終了",
};
export type KeyboxStatus = "HAS" | "NONE";
export const KEYBOX_STATUS_LABEL: Record<KeyboxStatus, string> = {
  HAS: "あり",
  NONE: "なし",
};

// ── 写真の種別 ──
export type PhotoKind = "WORK" | "SURVEY" | "DRAWING" | "KEYBOX" | "BEFORE" | "AFTER" | "OTHER" | "RECEIPT";
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  WORK: "作業",
  SURVEY: "現調",
  DRAWING: "図面",
  KEYBOX: "キーBOX",
  BEFORE: "作業前",
  AFTER: "作業後",
  OTHER: "その他",
  RECEIPT: "領収書",
};
export function isPhotoKind(v: string | null | undefined): v is PhotoKind {
  return !!v && v in PHOTO_KIND_LABEL;
}

// ── 通知の種別 ──
export type NotificationType =
  | "OCC_ASSIGNED"
  | "OCC_MOVED"
  | "OCC_CONFIRMED"
  | "OCC_CANCELLED"
  | "GENERATED"
  | "TOMORROW"
  | "SYSTEM";
export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  OCC_ASSIGNED: "担当に追加",
  OCC_MOVED: "予定の移動",
  OCC_CONFIRMED: "予定の確定",
  OCC_CANCELLED: "予定の中止",
  GENERATED: "翌月分の生成",
  TOMORROW: "明日の予定",
  SYSTEM: "お知らせ",
};

// ── 曜日 ──
export const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"] as const;

// ── ステータス色 → カラートークン ──
export const STATUS_TOKEN: Record<Tone, string> = {
  survey: "#8b5cf6",
  active: "#10b981",
  past: "#94a3b8",
  warn: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
};

// 安全に label を引く（未知値はそのまま返す）
export function labelOf<T extends string>(
  map: Record<string, string>,
  key: T | null | undefined,
): string {
  if (!key) return "—";
  return map[key] ?? key;
}

// ── 使い方のヒント ──
export const USAGE_TIPS = [
  "週ビューの左「未割当」から日付へドラッグすると予定が入ります",
  "スマホでは予定を開いて「移動」から日付・担当を変えられます",
  "上の1行入力に「9/24 直井さん 1人」と書くと仮予定になります",
];
