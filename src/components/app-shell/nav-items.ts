import {
  Home, CalendarDays, Building2, Building, Briefcase, Users, Handshake,
  type LucideIcon,
} from "lucide-react";
import { can, type Action, type Actor } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

type NavEntry = { item: NavItem; action?: Action; bottom: boolean };

const HOME: NavItem = { href: "/", label: "ホーム", icon: Home, match: (p) => p === "/" };
const SCHEDULE: NavItem = { href: "/schedule", label: "カレンダー", icon: CalendarDays, match: (p) => p.startsWith("/schedule") };
const PROPERTIES: NavItem = { href: "/properties", label: "現場", icon: Building, match: (p) => p.startsWith("/properties") };
const CUSTOMERS: NavItem = { href: "/customers", label: "顧客", icon: Building2, match: (p) => p.startsWith("/customers") };
const JOBS: NavItem = { href: "/jobs", label: "案件", icon: Briefcase, match: (p) => p.startsWith("/jobs") };
const WORKERS: NavItem = { href: "/workers", label: "作業者", icon: Users, match: (p) => p.startsWith("/workers") };
const PARTNERS: NavItem = { href: "/partners", label: "協力会社", icon: Handshake, match: (p) => p.startsWith("/partners") };

// 役割ではなく権限（can）で項目を絞る。bottom=true はスマホのボトムナビにも出す（4件以内＋メニュー）。
const ENTRIES: NavEntry[] = [
  { item: HOME, bottom: true },
  { item: SCHEDULE, bottom: true },
  { item: PROPERTIES, bottom: true },
  { item: CUSTOMERS, action: "customer.manage", bottom: true },
  { item: JOBS, action: "job.manage", bottom: false },
  { item: WORKERS, action: "worker.manage", bottom: false },
  { item: PARTNERS, action: "partner.manage", bottom: false },
];

function visible(actor: Actor, e: NavEntry): boolean {
  return !e.action || can(actor, e.action);
}

/** スマホのボトムナビ（末尾に「メニュー」が付く前提で4件以内） */
export function navForUser(actor: Actor): NavItem[] {
  return ENTRIES.filter((e) => e.bottom && visible(actor, e)).map((e) => e.item).slice(0, 4);
}

/** PC サイドバー（全項目） */
export function sidebarNavForUser(actor: Actor): NavItem[] {
  return ENTRIES.filter((e) => visible(actor, e)).map((e) => e.item);
}
