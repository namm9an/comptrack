"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  getReports,
  listCompetitors,
  type ReportItem,
  type Competitor,
} from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";

type TabKey = "pr" | "newsletter" | "web" | "social";
type DaysOption = 7 | 30 | 90;

const TABS: { key: TabKey; label: string }[] = [
  { key: "pr", label: "PR & News" },
  { key: "newsletter", label: "Newsletter" },
  { key: "web", label: "Web Activity" },
  { key: "social", label: "Social Media" },
];

const DAYS_OPTIONS: DaysOption[] = [7, 30, 90];

const CATEGORY_STYLES: Record<TabKey, { badge: string; dot: string }> = {
  pr: {
    badge: "bg-blue-50 text-blue-700 border border-blue-100",
    dot: "bg-blue-500",
  },
  newsletter: {
    badge: "bg-green-50 text-green-700 border border-green-100",
    dot: "bg-green-500",
  },
  web: {
    badge: "bg-amber-50 text-amber-700 border border-amber-100",
    dot: "bg-amber-500",
  },
  social: {
    badge: "bg-purple-50 text-purple-700 border border-purple-100",
    dot: "bg-purple-500",
  },
};

export default function ReportsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>("pr");
  const [days, setDays] = useState<DaysOption>(30);
  const [competitorId, setCompetitorId] = useState<number | undefined>(undefined);

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  // Load competitors for the filter dropdown once
  useEffect(() => {
    if (user) {
      listCompetitors().then(setCompetitors).catch(() => {});
    }
  }, [user]);

  // Refetch whenever tab, days, or competitor filter changes
  useEffect(() => {
    if (!user) return;
    setFetching(true);
    setError(null);
    getReports({ category: activeTab, days, competitor_id: competitorId })
      .then(setItems)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load reports")
      )
      .finally(() => setFetching(false));
  }, [user, activeTab, days, competitorId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const styles = CATEGORY_STYLES[activeTab];
  const activeLabel = TABS.find((t) => t.key === activeTab)?.label ?? activeTab;

  return (
    <div className="flex min-h-screen">
      <Navbar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-1">
              Competitive intelligence across PR, newsletter, web, and social channels
            </p>
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            {/* Tab pill switcher */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
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

              {/* Competitor filter */}
              <select
                value={competitorId ?? ""}
                onChange={(e) =>
                  setCompetitorId(e.target.value ? Number(e.target.value) : undefined)
                }
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All competitors</option>
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
          ) : items.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-400">
                No {activeLabel.toLowerCase()} items found for the selected filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`} />
                      <Link
                        href={`/competitors/${item.competitor_id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate"
                      >
                        {item.competitor_name}
                      </Link>
                      <span className="text-slate-300 text-xs">&middot;</span>
                      <span className="text-xs text-slate-500 shrink-0">
                        {formatDate(item.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.period && (
                        <span className="text-xs text-slate-400">{item.period}</span>
                      )}
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}
                      >
                        {activeTab === "pr"
                          ? "PR"
                          : activeTab === "newsletter"
                          ? "Newsletter"
                          : activeTab === "web"
                          ? "Web"
                          : "Social"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
