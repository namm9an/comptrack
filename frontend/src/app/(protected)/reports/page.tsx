"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getReports, type ReportItem } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";
import { ChevronDown, ChevronRight, Newspaper, Mail, Globe, Share2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CloudFilter = "all" | "e2e_cloud" | "tir";
type DaysOption = 7 | 30 | 90;

interface CompetitorGroup {
  competitor_id: number;
  competitor_name: string;
  competitor_category: string;
  pr: ReportItem[];
  newsletter: ReportItem[];
  web: ReportItem[];
  social: ReportItem[];
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_OPTIONS: DaysOption[] = [7, 30, 90];
const CLOUD_LABELS: Record<CloudFilter, string> = {
  all: "All",
  e2e_cloud: "E2E Cloud",
  tir: "TIR",
};

const SECTIONS = [
  {
    key: "pr" as const,
    label: "Press Release & News",
    icon: Newspaper,
    iconColor: "text-blue-500",
    headerColor: "text-blue-700",
    dividerColor: "border-blue-100",
    bgColor: "bg-blue-50",
    dotColor: "bg-blue-400",
  },
  {
    key: "newsletter" as const,
    label: "Newsletter",
    icon: Mail,
    iconColor: "text-green-500",
    headerColor: "text-green-700",
    dividerColor: "border-green-100",
    bgColor: "bg-green-50",
    dotColor: "bg-green-400",
  },
  {
    key: "web" as const,
    label: "Web Activity",
    icon: Globe,
    iconColor: "text-amber-500",
    headerColor: "text-amber-700",
    dividerColor: "border-amber-100",
    bgColor: "bg-amber-50",
    dotColor: "bg-amber-400",
  },
  {
    key: "social" as const,
    label: "Social Media",
    icon: Share2,
    iconColor: "text-purple-500",
    headerColor: "text-purple-700",
    dividerColor: "border-purple-100",
    bgColor: "bg-purple-50",
    dotColor: "bg-purple-400",
  },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCompetitor(items: ReportItem[]): CompetitorGroup[] {
  const map = new Map<number, CompetitorGroup>();

  for (const item of items) {
    if (!map.has(item.competitor_id)) {
      map.set(item.competitor_id, {
        competitor_id: item.competitor_id,
        competitor_name: item.competitor_name,
        competitor_category: item.competitor_category ?? "",
        pr: [],
        newsletter: [],
        web: [],
        social: [],
        total: 0,
      });
    }
    const grp = map.get(item.competitor_id)!;
    if (item.category === "pr") { grp.pr.push(item); grp.total++; }
    else if (item.category === "newsletter") { grp.newsletter.push(item); grp.total++; }
    else if (item.category === "web") { grp.web.push(item); grp.total++; }
    else if (item.category === "social") { grp.social.push(item); grp.total++; }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.competitor_name.localeCompare(b.competitor_name)
  );
}

function matchesCloud(grp: CompetitorGroup, filter: CloudFilter): boolean {
  if (filter === "all") return true;
  const cat = grp.competitor_category.toLowerCase();
  if (filter === "e2e_cloud") return cat === "e2e_cloud" || cat === "both";
  if (filter === "tir") return cat === "tir" || cat === "both";
  return true;
}

function categoryLabel(cat: string): string {
  if (cat === "e2e_cloud") return "E2E Cloud";
  if (cat === "tir") return "TIR";
  if (cat === "both") return "Both";
  return cat;
}

// ---------------------------------------------------------------------------
// CompetitorRow — expands to show ALL 4 sections at once (no tabs)
// ---------------------------------------------------------------------------

function CompetitorRow({ grp }: { grp: CompetitorGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Clickable header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open
            ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
          <span className="font-semibold text-slate-900">{grp.competitor_name}</span>
          {grp.competitor_category && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
              {categoryLabel(grp.competitor_category)}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 shrink-0 ml-4">
          {grp.total} item{grp.total !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Full report — all 4 sections stacked */}
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {SECTIONS.map((sec) => {
            const items = grp[sec.key];
            const Icon = sec.icon;
            return (
              <div key={sec.key} className="px-5 py-4">
                {/* Section header */}
                <div className={`flex items-center gap-2 mb-3`}>
                  <Icon className={`w-4 h-4 ${sec.iconColor}`} />
                  <span className={`text-sm font-semibold ${sec.headerColor}`}>
                    {sec.label}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">
                    ({items.length})
                  </span>
                </div>

                {/* Items */}
                {items.length === 0 ? (
                  <p className="text-sm text-slate-400 italic pl-6">
                    No activity in this period.
                  </p>
                ) : (
                  <ul className="space-y-2 pl-6">
                    {items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${sec.dotColor}`} />
                        <div>
                          <p className="text-sm text-slate-700 leading-relaxed">
                            {item.content}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatDate(item.date)}
                            {item.period && (
                              <span className="ml-2 capitalize">{item.period}</span>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
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
  const [days, setDays] = useState<DaysOption>(30);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setFetching(true);
    setError(null);
    getReports({ days })
      .then(setItems)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load reports")
      )
      .finally(() => setFetching(false));
  }, [user, days]);

  const groups = useMemo(
    () => groupByCompetitor(items).filter((g) => matchesCloud(g, cloudFilter)),
    [items, cloudFilter]
  );

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
              Click any competitor to view their full intelligence report.
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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

            {/* Days filter */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {DAYS_OPTIONS.map((d) => (
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
          </div>

          {/* Competitor list */}
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
              <p className="text-sm text-slate-400">
                No reports found for the selected filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((grp) => (
                <CompetitorRow key={grp.competitor_id} grp={grp} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
