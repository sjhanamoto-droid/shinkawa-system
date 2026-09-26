import { UserPlus, CalendarClock, CheckCircle2, Ban, Sparkles, Sun, Bell, Megaphone, type LucideIcon } from "lucide-react";
import type { IconTone } from "@/components/ui/icon-badge";

// 通知タイプごとのアイコン・色・ラベル。通知センターと起動ゲートで共有する。
// 未知タイプは既定（ベル/ブランド色）にフォールバックする。
type NotificationMeta = { icon: LucideIcon; tone: IconTone; label: string };

const META: Record<string, NotificationMeta> = {
  OCC_ASSIGNED: { icon: UserPlus, tone: "brand", label: "担当に追加" },
  OCC_MOVED: { icon: CalendarClock, tone: "amber", label: "予定の移動" },
  OCC_CONFIRMED: { icon: CheckCircle2, tone: "emerald", label: "予定の確定" },
  OCC_CANCELLED: { icon: Ban, tone: "rose", label: "予定の中止" },
  GENERATED: { icon: Sparkles, tone: "violet", label: "翌月分の生成" },
  TOMORROW: { icon: Sun, tone: "sky", label: "明日の予定" },
  ANNOUNCEMENT: { icon: Megaphone, tone: "rose", label: "全体連絡" },
};

const DEFAULT_META: NotificationMeta = { icon: Bell, tone: "brand", label: "お知らせ" };

export function notificationMeta(type: string): NotificationMeta {
  return META[type] ?? DEFAULT_META;
}
