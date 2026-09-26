import { Badge } from "@/components/ui/badge";
import { ANNOUNCEMENT_CATEGORY_LABEL, isAnnouncementCategory } from "@/lib/announcements";

const TONE = { GENERAL: "info", EVENT: "active", CLAIM: "danger" } as const;

export function AnnouncementCategoryBadge({ category }: { category: string }) {
  if (!isAnnouncementCategory(category)) return null;
  return <Badge tone={TONE[category]}>{ANNOUNCEMENT_CATEGORY_LABEL[category]}</Badge>;
}
