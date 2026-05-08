"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getReports, type ReportItem } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDateOnly, formatTimeIST } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CloudFilter = "all" | "e2e_cloud" | "tir";
type DaysOption = 7 | 30;

interface CompanyGroup {
  competitor_id: number;
  competitor_name: string;
  competitor_category: string;
  pr: ReportItem[];
  newsletter: ReportItem[];
  web: ReportItem[];
  social: ReportItem[];
}

interface ReportGroup {
  date: string;
  runTime: string;
  companies: CompanyGroup[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLOUD_LABELS: Record<CloudFilter, string> = {
  all: "All",
  e2e_cloud: "E2E Cloud",
  tir: "TIR",
};

const SECTION_LABELS: Record<string, string> = {
  pr: "Press Release & News",
  newsletter: "Newsletter",
  web: "Web Activity",
  social: "Social Media",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesCloud(cat: string, filter: CloudFilter): boolean {
  if (filter === "all") return true;
  const c = (cat ?? "").toLowerCase();
  if (filter === "e2e_cloud") return c === "e2e_cloud" || c === "both";
  if (filter === "tir") return c === "tir" || c === "both";
  return true;
}

function buildGroups(items: ReportItem[], cloudFilter: CloudFilter): ReportGroup[] {
  // date → company_id → CompanyGroup
  const dateMap = new Map<string, Map<number, CompanyGroup>>();
  const runTimes = new Map<string, string>();

  for (const item of items) {
    if (!matchesCloud(item.competitor_category ?? "", cloudFilter)) continue;

    if (!dateMap.has(item.date)) dateMap.set(item.date, new Map());
    const compMap = dateMap.get(item.date)!;

    // Track earliest created_at per date as the run time
    if (item.created_at && !runTimes.has(item.date)) {
      runTimes.set(item.date, item.created_at);
    }

    if (!compMap.has(item.competitor_id)) {
      compMap.set(item.competitor_id, {
        competitor_id: item.competitor_id,
        competitor_name: item.competitor_name,
        competitor_category: item.competitor_category ?? "",
        pr: [], newsletter: [], web: [], social: [],
      });
    }
    const grp = compMap.get(item.competitor_id)!;
    if (item.category === "pr") grp.pr.push(item);
    else if (item.category === "newsletter") grp.newsletter.push(item);
    else if (item.category === "web") grp.web.push(item);
    else if (item.category === "social") grp.social.push(item);
  }

  return Array.from(dateMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, compMap]) => ({
      date,
      runTime: runTimes.get(date) ?? "",
      companies: Array.from(compMap.values()).sort((a, b) =>
        a.competitor_name.localeCompare(b.competitor_name)
      ),
    }));
}

// ---------------------------------------------------------------------------
// Markdown generation — a Claude prompt
// ---------------------------------------------------------------------------

function generateMarkdown(group: ReportGroup): string {
  const dateLabel = formatDateOnly(group.date);

  const lines: string[] = [
    `You are a competitive intelligence analyst for E2E Networks, an Indian GPU cloud provider.`,
    `Below is competitive intelligence data automatically tracked on ${dateLabel}.`,
    `Please help me:`,
    `1. Identify the most important developments across all competitors`,
    `2. Highlight anything E2E Networks should be aware of or respond to`,
    `3. Summarise the key themes and what stands out this period`,
    ``,
    `---`,
    ``,
    `# Competitive Intelligence — ${dateLabel}`,
    ``,
  ];

  for (const company of group.companies) {
    const catLabel = company.competitor_category === "e2e_cloud" ? "E2E Cloud"
      : company.competitor_category === "tir" ? "TIR" : company.competitor_category;

    lines.push(`## ${company.competitor_name}${catLabel ? ` (${catLabel})` : ""}`);
    lines.push(``);

    const sections: [string, ReportItem[]][] = [
      ["Press Release & News", company.pr],
      ["Newsletter", company.newsletter],
      ["Web Activity", company.web],
      ["Social Media", company.social],
    ];

    for (const [label, items] of sections) {
      if (items.length === 0) continue;
      lines.push(`### ${label}`);
      for (const item of items) {
        const text = item.content
          .replace(/^\[LinkedIn\]\s*/, "[LinkedIn] ")
          .replace(/^\[X\/Twitter\]\s*/, "[X/Twitter] ")
          .replace(/^\[Twitter\]\s*/, "[X/Twitter] ");
        lines.push(`- ${text}`);
      }
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(``);
  }

  return lines.join("\n");
}

function downloadMd(group: ReportGroup) {
  const md = generateMarkdown(group);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `comptrack-report-${group.date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Company block inside expanded report
// ---------------------------------------------------------------------------

function CompanyBlock({ company }: { company: CompanyGroup }) {
  const catLabel = company.competitor_category === "e2e_cloud" ? "E2E Cloud"
    : company.competitor_category === "tir" ? "TIR"
    : company.competitor_category === "both" ? "Both"
    : "";

  const sections: [keyof typeof SECTION_LABELS, ReportItem[]][] = [
    ["pr", company.pr],
    ["newsletter", company.newsletter],
    ["web", company.web],
    ["social", company.social],
  ];

  const hasAnyData = sections.some(([, items]) => items.length > 0);

  return (
    <div className="border border-slate-100 rounded-lg p-4">
      {/* Company header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-semibold text-slate-900">{company.competitor_name}</span>
        {catLabel && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            company.competitor_category === "tir"
              ? "bg-violet-50 text-violet-700 border border-violet-100"
              : "bg-sky-50 text-sky-700 border border-sky-100"
          }`}>
            {catLabel}
          </span>
        )}
      </div>

      {!hasAnyData ? (
        <p className="text-sm text-slate-400 italic">No data collected this period.</p>
      ) : (
        <div className="space-y-3">
          {sections.map(([key, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  {SECTION_LABELS[key]}
                </p>
                <ul className="space-y-1">
                  {items.map((item, idx) => {
                    const isLinkedIn = item.content.startsWith("[LinkedIn]");
                    const isTwitter = item.content.startsWith("[X/Twitter]") || item.content.startsWith("[Twitter]");
                    const text = item.content
                      .replace(/^\[LinkedIn\]\s*/, "")
                      .replace(/^\[X\/Twitter\]\s*/, "")
                      .replace(/^\[Twitter\]\s*/, "");

                    // Build platform link: LinkedIn page or Twitter profile
                    const linkedinHref = item.competitor_linkedin_url ?? null;
                    const twitterHref = item.competitor_twitter_handle
                      ? `https://x.com/${item.competitor_twitter_handle.replace(/^@/, "")}`
                      : null;

                    return (
                      <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                        {key === "social" && isLinkedIn ? (
                          linkedinHref ? (
                            <a
                              href={linkedinHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View LinkedIn profile"
                              className="shrink-0 mt-0.5 text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded leading-none hover:bg-blue-200 transition-colors"
                            >
                              in
                            </a>
                          ) : (
                            <span className="shrink-0 mt-0.5 text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded leading-none">in</span>
                          )
                        ) : key === "social" && isTwitter ? (
                          twitterHref ? (
                            <a
                              href={twitterHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View X / Twitter profile"
                              className="shrink-0 mt-0.5 text-xs font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded leading-none hover:bg-slate-700 transition-colors"
                            >
                              𝕏
                            </a>
                          ) : (
                            <span className="shrink-0 mt-0.5 text-xs font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded leading-none">𝕏</span>
                          )
                        ) : (
                          <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full bg-slate-400" />
                        )}
                        <span className="leading-relaxed">{key === "social" ? text : item.content}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report row — one per date
// ---------------------------------------------------------------------------

function ReportRow({ group, defaultOpen }: { group: ReportGroup; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-3 flex-1 text-left"
        >
          {open
            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <div>
            <span className="font-semibold text-slate-900">
              Report · {formatDateOnly(group.date)}
            </span>
            {group.runTime && (
              <span className="ml-2 text-xs text-slate-400">
                {formatTimeIST(group.runTime)}
              </span>
            )}
          </div>
          <span className="ml-3 text-xs text-slate-400">
            {group.companies.length} {group.companies.length === 1 ? "company" : "companies"}
          </span>
        </button>

        {/* Download .md */}
        <button
          onClick={() => downloadMd(group)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors ml-3 shrink-0"
          title="Download as Claude prompt (.md)"
        >
          <Download size={12} />
          .md
        </button>
      </div>

      {/* Expanded: one block per company */}
      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3">
          {group.companies.map((company) => (
            <CompanyBlock key={company.competitor_id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [cloudFilter, setCloudFilter] = useState<CloudFilter>("all");
  const [days, setDays] = useState<DaysOption>(7);
  const [pickedDate, setPickedDate] = useState<string>("");   // YYYY-MM-DD or ""
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // When a specific date is picked we fetch 1 day; otherwise use days range
  useEffect(() => {
    if (!user) return;
    setFetching(true);
    setError(null);
    getReports({ days: pickedDate ? 90 : days })
      .then(setItems)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load reports")
      )
      .finally(() => setFetching(false));
  }, [user, days, pickedDate]);

  const groups = useMemo(() => {
    let filtered = items;
    if (pickedDate) filtered = items.filter((i) => i.date === pickedDate);
    return buildGroups(filtered, cloudFilter);
  }, [items, cloudFilter, pickedDate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Navbar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              One report per day — click to read, download .md to analyse in Claude.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Cloud toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {(["all", "e2e_cloud", "tir"] as CloudFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setCloudFilter(f)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    cloudFilter === f
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {CLOUD_LABELS[f]}
                </button>
              ))}
            </div>

            {/* Days filter — hidden when a specific date is picked */}
            {!pickedDate && (
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {([7, 30] as DaysOption[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      days === d
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            )}

            {/* Date picker */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={pickedDate}
                onChange={(e) => setPickedDate(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {pickedDate && (
                <button
                  onClick={() => setPickedDate("")}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                  title="Clear date filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Report list */}
          {fetching ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-400">No reports found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((grp, idx) => (
                <ReportRow key={grp.date} group={grp} defaultOpen={idx === 0} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
