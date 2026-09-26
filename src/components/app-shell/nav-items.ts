import {
  Home, CalendarDays, ClipboardList, Building2, Building, Briefcase, Users, Handshake, Car, Bell, ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { can, type Action, type Actor } from "@/lib/permissions";
import { isInternalWorker } from "@/lib/announcements";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

/** internal = 社員・アルバイトと管理者だけ（協力会社・下請のアカウントには出さない） */
type NavEntry = { item: NavItem; action?: Action; bottom: boolean; internal?: boolean };
type NavActor = Actor & { kind?: string };

const HOME: NavItem = { href: "/", label: "ホーム", icon: Home, match: (p) => p === "/" };
const SCHEDULE: NavItem = { href: "/schedule", label: "カレンダー", icon: CalendarDays, match: (p) => p.startsWith("/schedule") };
const REPORTS: NavItem = { href: "/reports", label: "日報", icon: ClipboardList, match: (p) => p.startsWith("/reports") };
const PROPERTIES: NavItem = { href: "/properties", label: "現場", icon: Building, match: (p) => p.startsWith("/properties") };
const CUSTOMERS: NavItem = { href: "/customers", label: "顧客", icon: Building2, match: (p) => p.startsWith("/customers") };
const JOBS: NavItem = { href: "/jobs", label: "案件", icon: Briefcase, match: (p) => p.startsWith("/jobs") };
const WORKERS: NavItem = { href: "/workers", label: "作業者", icon: Users, match: (p) => p.startsWith("/workers") };
const PARTNERS: NavItem = { href: "/partners", label: "協力会社", icon: Handshake, match: (p) => p.startsWith("/partners") };
const VEHICLES: NavItem = { href: "/vehicles", label: "車両", icon: Car, match: (p) => p.startsWith("/vehicles") };
const NOTIFICATIONS: NavItem = {
  href: "/notifications",
  label: "通知",
  icon: Bell,
  match: (p) => p.startsWith("/notifications") || p.startsWith("/announcements"),
};
const CLAIMS: NavItem = { href: "/claims", label: "クレーム再発防止", icon: ShieldAlert, match: (p) => p.startsWith("/claims") };

// 役割ではなく権限（can）で項目を絞る。bottom=true はスマホのボトムナビにも出す（4件以内＋メニュー）。
const ENTRIES: NavEntry[] = [
  { item: HOME, bottom: true },
  { item: SCHEDULE, bottom: true },
  { item: REPORTS, bottom: true },
  { item: JOBS, action: "job.manage", bottom: false },
  { item: PROPERTIES, bottom: true },
  { item: CUSTOMERS, action: "customer.manage", bottom: true },
  { item: WORKERS, action: "worker.manage", bottom: false },
  { item: PARTNERS, action: "partner.manage", bottom: false },
  { item: VEHICLES, action: "vehicle.manage", bottom: false },
  { item: NOTIFICATIONS, bottom: false },
  { item: CLAIMS, bottom: false, internal: true },
];

function visible(actor: NavActor, e: NavEntry): boolean {
  if (e.internal && !can(actor, "claim.manage") && !isInternalWorker(actor.kind ?? "EMPLOYEE")) return false;
  return !e.action || can(actor, e.action);
}

/** スマホのボトムナビ（末尾に「メニュー」が付く前提で4件以内） */
export function navForUser(actor: NavActor): NavItem[] {
  return ENTRIES.filter((e) => e.bottom && visible(actor, e)).map((e) => e.item).slice(0, 4);
}

/** PC サイドバー（全項目） */
export function sidebarNavForUser(actor: NavActor): NavItem[] {
  return ENTRIES.filter((e) => visible(actor, e)).map((e) => e.item);
}
