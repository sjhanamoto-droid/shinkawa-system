"use client";

import { SectionTabs } from "./section-tabs";
import { useShellUser } from "./shell-user";
import { isInternalWorker } from "@/lib/announcements";
import { can } from "@/lib/permissions";

/** 作業者・協力会社 */
export function PeopleTabs() {
  return (
    <SectionTabs
      tabs={[
        { href: "/workers", label: "作業者" },
        { href: "/partners", label: "協力会社・下請" },
      ]}
    />
  );
}

/** 通知・全体連絡・クレーム再発防止 */
export function InboxTabs() {
  const ctx = useShellUser();
  const user = ctx?.user;
  const showClaims = !!user && (can({ id: user.id, role: user.role, department: user.department }, "claim.manage") || isInternalWorker(user.kind ?? "EMPLOYEE"));
  return (
    <SectionTabs
      tabs={[
        { href: "/notifications", label: "通知", badge: ctx?.unreadCount },
        { href: "/announcements", label: "全体連絡" },
        ...(showClaims ? [{ href: "/claims", label: "クレーム再発防止" }] : []),
      ]}
    />
  );
}
