import { ExternalLink, Download } from "lucide-react";
import type { Digest } from "@/lib/api";
import { formatDate } from "@/lib/utils";

function digestToMarkdown(digest: Digest): string {
  const d = digest.digest;
  const lines: string[] = [
    `# ${d.competitor ?? "Competitor"} — ${digest.period === "daily" ? "Daily" : "Weekly"} Digest`,
    `**Date:** ${digest.digest_date}  `,
    `**Generated:** ${formatDate(digest.created_at)}`,
    "",
  ];
  if (d.summary) { lines.push("## Summary", d.summary, ""); }
  if (d.highlights?.length) {
    lines.push("## Highlights");
    d.highlights.forEach((h: string) => lines.push(`- ${h}`));
    lines.push("");
  }
  if (d.social_activity && d.social_activity !== "No data available") {
    lines.push("## Social Activity", d.social_activity, "");
  }
  if (d.news_mentions?.length) {
    lines.push("## News Mentions");
    d.news_mentions.forEach((n: string) => lines.push(`- ${n}`));
    lines.push("");
  }
  if (d.sources?.length) {
    lines.push("## Sources");
    d.sources.forEach((s: string) => lines.push(`- ${s}`));
  }
  return lines.join("\n");
}

function downloadMd(digest: Digest) {
  const md = digestToMarkdown(digest);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(digest.digest.competitor ?? "digest").toLowerCase().replace(/\s+/g, "-")}-${digest.period}-${digest.digest_date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  digest: Digest;
}

export function DigestCard({ digest }: Props) {
  const { digest: d } = digest;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
              digest.period === "daily"
                ? "bg-blue-50 text-blue-700"
                : "bg-purple-50 text-purple-700"
            }`}
          >
            {digest.period}
          </span>
          <span className="text-sm text-slate-500">{digest.digest_date}</span>
        </div>
        <span className="text-xs text-slate-400">{formatDate(digest.created_at)}</span>
      </div>

      {d.summary && (
        <p className="text-sm text-slate-700 leading-relaxed">{d.summary}</p>
      )}

      {d.highlights?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Highlights
          </p>
          <ul className="space-y-1">
            {d.highlights.map((h, i) => (
              <li key={i} className="text-sm text-slate-700 flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.social_activity && d.social_activity !== "No data available" && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Social Activity
          </p>
          <p className="text-sm text-slate-700">{d.social_activity}</p>
        </div>
      )}

      {d.news_mentions?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            News Mentions
          </p>
          <ul className="space-y-1">
            {d.news_mentions.map((n, i) => (
              <li key={i} className="text-sm text-slate-700 flex gap-2">
                <span className="text-slate-400 mt-0.5">→</span>
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.sources?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Sources
          </p>
          <div className="flex flex-wrap gap-2">
            {d.sources.slice(0, 5).map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline max-w-xs truncate"
              >
                <ExternalLink size={10} />
                {(() => { try { return new URL(src).hostname; } catch { return src; } })()}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-slate-100">
        <button
          onClick={() => downloadMd(digest)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <Download size={12} />
          Download MD
        </button>
      </div>
    </div>
  );
}
