"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getReports, type ReportItem } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type CloudFilter = "all" | "e2e_cloud" | "tir";
type DaysOption = 7 | 30 | 90;

const DAYS_OPTIONS: DaysOption[] = [7, 30, 90];

const CLOUD_LABELS: Record<CloudFilter, string> = {
  all: "All",
  e2e_cloud: "E2E Cloud",
  tir: "TIR",
};

const CATEGORY_META: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  pr: {
    label: "Press Release",
    badge: "bg-blue-50 text-blue-700 border border-blue-100",
    dot: "bg-blue-400",
  },
  newsletter: {
    label: "Newsletter",
    badge: "bg-green-50 text-green-700 border border-green-100",
    dot: "bg-green-400",
  },
  web: {
    label: "Web Activity",
    badge: "bg-amber-50 text-amber-700 border border-amber-100",
    dot: "bg-amber-400",
  },
  social: {
    label: "Social Media",
    badge: "bg-purple-50 text-purple-700 border border-purple-100",
    dot: "bg-purple-400",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesCloud(item: ReportItem, filter: CloudFilter): boolean {
  if (filter === "all") return true;
  const cat = (item.competitor_category ?? "").toLowerCase();
  if (filter === "e2e_cloud") return cat === "e2e_cloud" || cat === "both";
  if (filter === "tir") return cat === "tir" || cat === "both";
  return true;
}

function formatDayTab(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === yesterday.getTime()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Single item card
// ---------------------------------------------------------------------------

function ReportItemCard({ item }: { item: ReportItem }) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.pr;

  const isLinkedIn = item.content.startsWith("[LinkedIn]");
  const isTwitter =
    item.content.startsWith("[X/Twitter]") ||
    item.content.startsWith("[Twitter]");
  const text = item.content
    .replace(/^\[LinkedIn\]\s*/, "")
    .replace(/^\[X\/Twitter\]\s*/, "")
    .replace(/^\[Twitter\]\s*/, "");

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col gap-2 hover:border-slate-300 transition-colors">
      {/* Top row: category + competitor + platform badge */}
      <div className="flex items-center flex-wrap gap-2">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>
          {meta.label}
        </span>
        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
          {item.competitor_name}
        </span>
        {item.competitor_category && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            item.competitor_category === "tir"
              ? "bg-violet-50 text-violet-600 border border-violet-100"
              : "bg-sky-50 text-sky-600 border border-sky-100"
          }`}>
            {item.competitor_category === "e2e_cloud" ? "E2E Cloud"
              : item.competitor_category === "tir" ? "TIR" : "Both"}
          </span>
        )}
        {item.category === "social" && isLinkedIn && (
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
            in
          </span>
        )}
        {item.category === "social" && isTwitter && (
          <span className="text-xs font-semibold bg-slate-800 text-white px-1.5 py-0.5 rounded">
            𝕏
          </span>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-slate-800 leading-relaxed">
        {item.category === "social" ? text : item.content}
      </p>

      {/* Bottom row: date + source */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-slate-400">
          {formatDate(item.date)}
          {item.period && (
            <span className="ml-2 capitalize text-slate-300">{item.period}</span>
          )}
        </span>
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
          >
            <ExternalLink size={10} />
            {sourceDomain(item.source_url)}
          </a>
        )}
      </div>
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
      .then((data) => {
        setItems(data);
        // Auto-select the most recent date
        if (data.length > 0) {
          const latest = data.reduce((a, b) => (a.date > b.date ? a : b)).date;
          setSelectedDate(latest);
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load reports")
      )
      .finally(() => setFetching(false));
  }, [user, days]);

  // All unique dates sorted newest → oldest
  const availableDates = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.date))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [items]
  );

  // Apply filters: cloud + date
  const displayed = useMemo(
    () =>
      items
        .filter((i) => matchesCloud(i, cloudFilter))
        .filter((i) => !selectedDate || i.date === selectedDate)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [items, cloudFilter, selectedDate]
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
              Unified competitive intelligence feed across all competitors.
            </p>
          </div>

          {/* Controls row 1: cloud + days */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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

          {/* Date tabs — one tab per job run date, newest first */}
          {availableDates.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <span className="text-xs text-slate-400 mr-1">Run date:</span>
              {availableDates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedDate === d
                      ? "bg-slate-800 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {formatDayTab(d)}
                </button>
              ))}
            </div>
          )}

          {/* Feed */}
          {fetching ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-400">
                No items found for the selected filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-1">
                {displayed.length} item{displayed.length !== 1 ? "s" : ""}
              </p>
              {displayed.map((item, idx) => (
                <ReportItemCard key={idx} item={item} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
