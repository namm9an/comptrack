"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getReports, type ReportItem } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDateOnly, formatTimeIST } from "@/lib/utils";

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

const CATEGORY_META: Record<string, { label: string; badge: string }> = {
  pr: {
    label: "Press Release",
    badge: "bg-blue-50 text-blue-700 border border-blue-100",
  },
  newsletter: {
    label: "Newsletter",
    badge: "bg-green-50 text-green-700 border border-green-100",
  },
  web: {
    label: "Web Activity",
    badge: "bg-amber-50 text-amber-700 border border-amber-100",
  },
  social: {
    label: "Social Media",
    badge: "bg-purple-50 text-purple-700 border border-purple-100",
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

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Single item row inside an expanded report
// ---------------------------------------------------------------------------

function ItemRow({ item }: { item: ReportItem }) {
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
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      {/* Left: category + platform badge */}
      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${meta.badge}`}>
          {meta.label}
        </span>
        {item.category === "social" && isLinkedIn && (
          <span className="text-xs font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
            in
          </span>
        )}
        {item.category === "social" && isTwitter && (
          <span className="text-xs font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded">
            𝕏
          </span>
        )}
      </div>

      {/* Middle: competitor + content */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-slate-500 mr-2">
          {item.competitor_name}
        </span>
        <span className="text-sm text-slate-800 leading-relaxed">
          {item.category === "social" ? text : item.content}
        </span>
      </div>

      {/* Right: source link */}
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors pt-0.5"
        >
          <ExternalLink size={10} />
          {sourceDomain(item.source_url)}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One report row per date — click to expand
// ---------------------------------------------------------------------------

interface ReportGroup {
  date: string;           // YYYY-MM-DD
  runTime: string;        // created_at of the first item (actual job run timestamp)
  items: ReportItem[];
}

function ReportRow({
  group,
  defaultOpen,
}: {
  group: ReportGroup;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
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
        </div>
        <span className="text-xs text-slate-400 shrink-0 ml-4">
          {group.items.length} item{group.items.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-5 pb-4 border-t border-slate-100">
          {group.items.map((item, idx) => (
            <ItemRow key={idx} item={item} />
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

  // Group items by date, applying cloud filter, newest date first
  const groups = useMemo<ReportGroup[]>(() => {
    const filtered = items.filter((i) => matchesCloud(i, cloudFilter));
    const map = new Map<string, ReportItem[]>();
    for (const item of filtered) {
      if (!map.has(item.date)) map.set(item.date, []);
      map.get(item.date)!.push(item);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, its]) => ({
        date,
        // Use the created_at of the most recent item for the run time
        runTime: its.find((i) => i.created_at)?.created_at ?? "",
        items: its,
      }));
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
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              One report per day — click to expand.
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
              <p className="text-sm text-slate-400">
                No reports found for the selected filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((grp, idx) => (
                <ReportRow
                  key={grp.date}
                  group={grp}
                  defaultOpen={idx === 0}   // latest report auto-expanded
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
