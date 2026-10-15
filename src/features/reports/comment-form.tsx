"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { Textarea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { addReportComment } from "./actions";

export function ReportCommentForm({ reportId }: { reportId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const t = body.trim();
    if (!t || pending) return;
    start(async () => {
      const r = await addReportComment(reportId, t);
      if (r.error) {
        setError(r.error);
        return;
      }
      setError(null);
      setBody("");
    });
  }

  return (
    <div className="space-y-2">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="コメントを入力..." className="min-h-[72px]" maxLength={1000} />
      <div className="flex items-center justify-end gap-2">
        {error && <p className="mr-auto text-sm font-semibold text-status-danger">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={pending || !body.trim()}
          className={buttonClass()}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          送信
        </button>
      </div>
    </div>
  );
}
