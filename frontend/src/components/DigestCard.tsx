import { ExternalLink, Download, Users, Calendar, Zap, TrendingUp, AlertTriangle, Briefcase } from "lucide-react";
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
  if (d.key_people_activity?.length) {
    lines.push("## Key People");
    d.key_people_activity.forEach((p: { person: string; activity: string }) =>
      lines.push(`- **${p.person}**: ${p.activity}`)
    );
    lines.push("");
  }
  if (d.events_announced?.length) {
    lines.push("## Events & Announcements");
    d.events_announced.forEach((e: { name: string; date?: string; detail: string }) => {
      const dateStr = e.date ? ` (${e.date})` : "";
      lines.push(`- **${e.name}**${dateStr}: ${e.detail}`);
    });
    lines.push("");
  }
  if (d.product_moves?.length) {
    lines.push("## Product Moves");
    d.product_moves.forEach((m: string) => lines.push(`- ${m}`));
    lines.push("");
  }
  if (d.metrics_mentioned?.length) {
    lines.push("## Metrics");
    d.metrics_mentioned.forEach((m: string) => lines.push(`- ${m}`));
    lines.push("");
  }
  if (d.website_changes?.length) {
    lines.push("## Website Changes");
    d.website_changes.forEach((c: { page: string; summary: string }) =>
      lines.push(`- **${c.page}**: ${c.summary}`)
    );
    lines.push("");
  }
  if (d.hiring_signals?.available !== false && d.hiring_signals?.total_active) {
    const hs = d.hiring_signals;
    lines.push("## Hiring Signals");
    lines.push(`Total: ${hs.total_active} open roles (${hs.trend})`);
    if (hs.new_roles?.length) lines.push(`New: ${hs.new_roles.join(", ")}`);
    if (hs.removed_roles?.length) lines.push(`Removed: ${hs.removed_roles.join(", ")}`);
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

      {(d.key_people_activity?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Users size={11} /> Key People
          </p>
          <ul className="space-y-1">
            {d.key_people_activity.map((item, i) => (
              <li key={i} className="text-sm text-slate-700 flex gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span><strong className="font-medium">{item.person}</strong>: {item.activity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(d.events_announced?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Calendar size={11} /> Events & Announcements
          </p>
          <ul className="space-y-1.5">
            {d.events_announced.map((evt, i) => (
              <li key={i} className="text-sm text-slate-700">
                <span className="font-medium">{evt.name}</span>
                {evt.date && <span className="text-slate-400 text-xs ml-1.5">({evt.date})</span>}
                {evt.detail && <span className="text-slate-600"> — {evt.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(d.product_moves?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <Zap size={11} /> Product Moves
          </p>
          <ul className="space-y-1">
            {d.product_moves.map((move, i) => (
              <li key={i} className="text-sm text-slate-700 flex gap-2">
                <span className="text-violet-500 mt-0.5">•</span>
                {move}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(d.metrics_mentioned?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
            <TrendingUp size={11} /> Metrics
          </p>
          <div className="flex flex-wrap gap-1.5">
            {d.metrics_mentioned.map((m, i) => (
              <span key={i} className="bg-slate-100 text-slate-700 rounded px-2 py-0.5 text-xs font-mono">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {(d.website_changes?.length ?? 0) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle size={11} /> Website Changes
          </p>
          {d.website_changes.map((change, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 text-xs font-medium capitalize shrink-0">
                {change.page}
              </span>
              <span className="text-sm text-amber-900">{change.summary}</span>
            </div>
          ))}
        </div>
      )}

      {(() => {
        const hs = d.hiring_signals;
        if (!hs || hs.available === false || (hs.total_active ?? 0) === 0) return null;
        return (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Briefcase size={11} /> Hiring Signals
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-700 font-medium">
                  {hs.total_active} open roles
                </span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  hs.trend.startsWith("+")
                    ? "bg-green-50 text-green-700"
                    : hs.trend.startsWith("-")
                    ? "bg-red-50 text-red-700"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {hs.trend} this period
                </span>
              </div>
              {(hs.new_roles?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">New</p>
                  <div className="flex flex-wrap gap-1">
                    {hs.new_roles!.map((role, i) => (
                      <span key={i} className="bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 text-xs">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(hs.removed_roles?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Removed</p>
                  <div className="flex flex-wrap gap-1">
                    {hs.removed_roles!.map((role, i) => (
                      <span key={i} className="bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5 text-xs">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(hs.dept_breakdown ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(hs.dept_breakdown!).map(([dept, count]) => (
                    <span key={dept} className="bg-slate-100 text-slate-600 rounded px-2 py-0.5 text-xs">
                      {dept}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {d.sources?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Sources
          </p>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const seen = new Set<string>();
              return d.sources.filter((src: string) => {
                try {
                  let host = new URL(src).hostname.replace(/^www\./, "");
                  if (host === "twitter.com") host = "x.com";
                  if (seen.has(host)) return false;
                  seen.add(host);
                  return true;
                } catch { return false; }
              }).slice(0, 5).map((src: string, i: number) => {
                let label = src;
                try {
                  label = new URL(src).hostname.replace(/^www\./, "");
                  if (label === "twitter.com") label = "x.com";
                } catch {}
                return (
                  <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline max-w-xs truncate">
                    <ExternalLink size={10} />
                    {label}
                  </a>
                );
              });
            })()}
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
