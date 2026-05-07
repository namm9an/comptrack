"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getReports, type ReportItem } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CloudFilter = "all" | "e2e_cloud" | "tir";
type TabKey = "pr" | "newsletter" | "web" | "social";
type DaysOption = 7 | 30 | 90;

interface CompetitorGroup {
  competitor_id: number;
  competitor_name: string;
  competitor_category: string;
  items: Record<TabKey, ReportItem[]>;
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS_OPTIONS: DaysOption[] = [7, 30, 90];

const TABS: { key: TabKey; label: string; color: string; dot: string; badge: string }[] = [
  {
    key: "pr",
    label: "PR & News",
    color: "text-blue-700",
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border border-blue-100",
  },
  {
    key: "newsletter",
    label: "Newsletter",
    color: "text-green-700",
    dot: "bg-green-500",
    badge: "bg-green-50 text-green-700 border border-green-100",
  },
  {
    key: "web",
    label: "Web Activity",
    color: "text-amber-700",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border border-amber-100",
  },
  {
    key: "social",
    label: "Social Media",
    color: "text-purple-700",
    dot: "bg-purple-500",
    badge: "bg-purple-50 text-purple-700 border border-purple-100",
  },
];

const CLOUD_LABELS: Record<CloudFilter, string> = {
  all: "All",
  e2e_cloud: "E2E Cloud",
  tir: "TIR",
};

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
        items: { pr: [], newsletter: [], web: [], social: [] },
        total: 0,
      });
    }
    const grp = map.get(item.competitor_id)!;
    const key = item.category as TabKey;
    if (key in grp.items) {
      grp.items[key].push(item);
      grp.total += 1;
    }
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

// ---------------------------------------------------------------------------
// CompetitorRow component
// ---------------------------------------------------------------------------

function CompetitorRow({ grp }: { grp: CompetitorGroup }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("pr");

  // Pick the first tab with data as the default when expanded
  useEffect(() => {
    if (open) {
      const first = TABS.find((t) => grp.items[t.key].length > 0);
      if (first) setActiveTab(first.key);
    }
  }, [open, grp]);

  const tabItems = grp.items[activeTab];
  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
      {/* Row header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span className="font-semibold text-slate-900 truncate">
            {grp.competitor_name}
          </span>
          {grp.competitor_category && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
              {grp.competitor_category === "e2e_cloud"
                ? "E2E Cloud"
                : grp.competitor_category === "tir"
                ? "TIR"
                : grp.competitor_category === "both"
                ? "Both"
                : grp.competitor_category}
            </span>
          )}
        </div>

        {/* Category count pills */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {TABS.map((t) => {
            const count = grp.items[t.key].length;
            if (count === 0) return null;
            return (
              <span
                key={t.key}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.badge}`}
              >
                {t.label.split(" ")[0]} {count}
              </span>
            );
          })}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-slate-100">
          {/* Inner tab bar */}
          <div className="flex items-center gap-1 px-5 pt-3 pb-0 bg-slate-50 border-b border-slate-100">
            {TABS.map((t) => {
              const count = grp.items[t.key].length;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px ${
                    activeTab === t.key
                      ? `bg-white border-blue-500 ${t.color}`
                      : "border-transparent text-slate-500 hover:text-slate-700 bg-transparent"
                  }`}
                >
                  {t.label}
                  {count > 0 && (
                    <span className="ml-1.5 text-xs text-slate-400">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Items list */}
          <div className="px-5 py-4 space-y-3 bg-white">
            {tabItems.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">
                No {activeTabMeta.label.toLowerCase()} items in this period.
              </p>
            ) : (
              tabItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${activeTabMeta.dot}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {item.content}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatDate(item.date)}
                      {item.period && (
                        <span className="ml-2 capitalize">{item.period}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
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

  // Fetch all categories at once; filter client-side by cloud type
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

  const groups = useMemo(() => {
    const all = groupByCompetitor(items);
    return all.filter((g) => matchesCloud(g, cloudFilter));
  }, [items, cloudFilter]);

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
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              Competitive intelligence — click any competitor to view their full report.
            </p>
          </div>

          {/* Controls row */}
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

          {/* Content */}
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
