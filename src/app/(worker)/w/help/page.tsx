import { requireUser } from "@/lib/session";
import { WorkerSubPage } from "@/features/worker/ui/sub-page";

export const dynamic = "force-dynamic";

const TIPS: { title: string; body: string }[] = [
  { title: "ホーム", body: "今日の現場が札で出ます。作業が終わる頃になると「日報を書く」が大きく出ます。早く終わったときは下の「日報を書く」からいつでも書けます。" },
  { title: "日報", body: "現場 → 時間 → 交通費 → 経費 → 報告 の順に進み、最後に確認して送ります。途中で閉じても、入力した内容はこの端末に残ります。" },
  { title: "時間", body: "＋−で10分ずつ動かせます。数字を押すと直接入力できます。日付をまたぐときは「翌日」を選びます。" },
  { title: "交通費", body: "高速は乗った・降りたインターと車を選びます。電車・バスは往復の合計を入れます。無ければ「交通費はなし」を選んでください。" },
  { title: "領収書", body: "撮るとすぐ一覧に入り、裏で金額を読み取ります。待たずに次を撮れます。黄色の行は金額を確かめて直してください。" },
  { title: "提出したあと", body: "日報タブ・精算書から、提出した日報を開いて直せます。直した記録は管理者に残ります。" },
  { title: "困ったとき", body: "パスワードを忘れた・うまく動かないときは、事務所へ連絡してください。" },
];

export default async function WorkerHelp() {
  const me = await requireUser();
  return (
    <WorkerSubPage userId={me.id} title="使い方" backHref="/w/menu">
      <ul className="space-y-3">
        {TIPS.map((t) => (
          <li key={t.title} className="rounded-[14px] bg-[var(--w-soft-bg)] px-4 py-4">
            <p className="text-[17px] font-semibold text-[var(--w-primary-dark)]">{t.title}</p>
            <p className="mt-1 text-[16px] leading-7 text-[var(--w-text-sub)]">{t.body}</p>
          </li>
        ))}
      </ul>
    </WorkerSubPage>
  );
}
