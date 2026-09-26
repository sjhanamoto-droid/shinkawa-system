import { Building, CalendarDays, UserRound, Users } from "lucide-react";
import { PhotoGrid, type PhotoData } from "@/components/photo-grid";
import { fmtKeyLong } from "@/features/schedule/filters";

export type ClaimView = {
  title: string;
  occurredOn: string | null;
  content: string;
  cause: string | null;
  prevention: string | null;
  property: { id: string; name: string } | null;
  siteContact: string | null;
  /** 関わった人の名前（選んだ作業者＋自由記入） */
  involved: string[];
  photos: PhotoData[];
};

function Block({ label, text, strong }: { label: string; text: string | null; strong?: boolean }) {
  if (!text) return null;
  return (
    <div className={strong ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3" : ""}>
      <p className={strong ? "text-xs font-bold text-emerald-800" : "text-xs font-bold text-ink-soft"}>{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

/** クレームの中身（詳細画面と確認画面で共通） */
export function ClaimBody({ claim }: { claim: ClaimView }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-lg font-black leading-snug text-ink">{claim.title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          {claim.property && (
            <span className="flex items-center gap-1.5">
              <Building className="h-4 w-4 text-ink-faint" />
              {claim.property.name}
            </span>
          )}
          {claim.occurredOn && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-ink-faint" />
              {fmtKeyLong(claim.occurredOn)}
            </span>
          )}
          {claim.siteContact && (
            <span className="flex items-center gap-1.5">
              <UserRound className="h-4 w-4 text-ink-faint" />
              現場担当：{claim.siteContact}
            </span>
          )}
          {claim.involved.length > 0 && (
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-ink-faint" />
              関わった人：{claim.involved.join("、")}
            </span>
          )}
        </div>
      </div>
      <Block label="クレームの内容" text={claim.content} />
      <Block label="原因" text={claim.cause} />
      <Block label="対応・再発防止策" text={claim.prevention} strong />
      {claim.photos.length > 0 && <PhotoGrid photos={claim.photos} />}
    </div>
  );
}

export const CLAIM_VIEW_SELECT = {
  title: true,
  occurredOn: true,
  content: true,
  cause: true,
  prevention: true,
  siteContact: true,
  involvedUserIds: true,
  involvedOthers: true,
  property: { select: { id: true, name: true } },
  photos: { select: { id: true, caption: true, kind: true, isVideo: true, width: true, height: true }, orderBy: { createdAt: "asc" as const } },
} as const;
