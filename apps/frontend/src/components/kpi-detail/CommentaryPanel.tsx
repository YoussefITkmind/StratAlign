"use client";

import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Comment, Kpi } from "@/types/kpi";
import { colorForInitials } from "@/lib/kpiConfig";

export default function CommentaryPanel({ kpi, onAddComment }: { kpi: Kpi; onAddComment: (comment: Comment) => void }) {
  const [textEn, setTextEn] = useState("");
  const [textAr, setTextAr] = useState("");

  const submit = () => {
    if (!textEn.trim() && !textAr.trim()) return;
    const initials = kpi.owner.initials;
    onAddComment({
      id: `comment-${Date.now()}`,
      author: { initials, name: kpi.owner.name, color: colorForInitials(initials) },
      text: { en: textEn.trim(), ar: textAr.trim() },
      createdAt: new Date().toISOString(),
    });
    setTextEn("");
    setTextAr("");
  };

  const sorted = [...kpi.comments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <MessageSquare className="h-4 w-4 text-gray-400" /> Commentary
      </h2>

      <div className="space-y-2">
        <textarea value={textEn} onChange={(e) => setTextEn(e.target.value)} rows={2} placeholder="Add commentary explaining this period's performance..."
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        <textarea value={textAr} onChange={(e) => setTextAr(e.target.value)} dir="rtl" rows={2} placeholder="أضف تعليقًا يوضح أداء هذه الفترة..."
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        <div className="flex justify-end">
          <button onClick={submit} className="flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <Send className="h-3.5 w-3.5" /> Post
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4 border-t border-gray-100 pt-4">
        {sorted.length === 0 && <p className="text-sm text-gray-400">No commentary yet.</p>}
        {sorted.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${c.author.color}`}>{c.author.initials}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{c.author.name} <span className="ml-1.5 font-normal text-gray-400">{new Date(c.createdAt).toLocaleString()}</span></p>
              {c.text.en && <p className="mt-0.5 text-sm text-gray-600">{c.text.en}</p>}
              {c.text.ar && <p className="mt-0.5 text-sm text-gray-600" dir="rtl">{c.text.ar}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
