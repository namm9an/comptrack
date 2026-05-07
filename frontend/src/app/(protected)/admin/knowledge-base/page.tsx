"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Sparkles, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  listKnowledgeBase,
  generateKnowledgeBase,
  listCompetitors,
  type KBEntry,
  type Competitor,
} from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";

function formatMonth(monthStr: string): string {
  if (!monthStr) return monthStr;
  // Expects "YYYY-MM" format
  const [year, month] = monthStr.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-IN", { month: "long", year: "numeric" });
}

type ExpandMap = Record<string, boolean>;

function BulletList({ items }: { items: string[] }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-slate-400 italic">None reported.</p>;
  }
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

interface CollapsibleSectionProps {
  title: string;
  sectionKey: string;
  expandMap: ExpandMap;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  sectionKey,
  expandMap,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const open = expandMap[sectionKey] ?? false;
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => onToggle(sectionKey)}
        className="flex items-center gap-2 w-full px-5 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-slate-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-slate-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-slate-700">{title}</span>
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorId, setCompetitorId] = useState<number | undefined>(undefined);
  const [fetching, setFetching] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const [expandMap, setExpandMap] = useState<ExpandMap>({});

  useEffect(() => {
    if (!loading && !user) { router.replace("/login"); return; }
    if (!loading && user?.role !== "admin") { router.replace("/"); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    listCompetitors().then(setCompetitors).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    setFetching(true);
    listKnowledgeBase(competitorId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setFetching(false));
  }, [user, competitorId]);

  function toggleSection(key: string) {
    setExpandMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setGenerateSuccess(false);
    try {
      await generateKnowledgeBase(competitorId);
      setGenerateSuccess(true);
      // Refresh entries after generation
      const updated = await listKnowledgeBase(competitorId);
      setEntries(updated);
      setTimeout(() => setGenerateSuccess(false), 4000);
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  // Sort entries by month descending
  const sorted = [...entries].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="flex min-h-screen">
      <Navbar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Page header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1>
              <p className="text-sm text-slate-500 mt-1">
                Monthly competitive intelligence summaries
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {generating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Generate
                </>
              )}
            </button>
          </div>

          {/* Feedback banners */}
          {generateSuccess && (
            <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              Knowledge base entries generated successfully for the current month.
            </div>
          )}
          {generateError && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {generateError}
            </div>
          )}

          {/* Competitor filter */}
          <div className="flex items-center gap-3 mb-6">
            <label className="text-sm font-medium text-slate-600">Filter by competitor:</label>
            <select
              value={competitorId ?? ""}
              onChange={(e) =>
                setCompetitorId(e.target.value ? Number(e.target.value) : undefined)
              }
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {competitors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          {fetching ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-500 font-medium">No knowledge base entries yet.</p>
              <p className="text-sm text-slate-400 mt-1">
                Click Generate to create entries for the current month.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((entry) => {
                const keyBase = `${entry.id}`;
                return (
                  <div
                    key={entry.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                  >
                    {/* Card header */}
                    <div className="px-5 py-4 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-base font-semibold text-slate-900">
                            {entry.competitor_name}{" "}
                            <span className="text-slate-400 font-normal">—</span>{" "}
                            {formatMonth(entry.month)}
                          </h2>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Generated by {entry.generated_by}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Executive summary */}
                    <div className="px-5 py-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Executive Summary
                      </p>
                      <p className="text-sm text-slate-800 leading-relaxed">
                        {entry.content.executive_summary || (
                          <span className="text-slate-400 italic">No summary available.</span>
                        )}
                      </p>
                    </div>

                    {/* Collapsible sections */}
                    <CollapsibleSection
                      title="Key Developments"
                      sectionKey={`${keyBase}-key`}
                      expandMap={expandMap}
                      onToggle={toggleSection}
                    >
                      <BulletList items={entry.content.key_developments} />
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="Product Launches"
                      sectionKey={`${keyBase}-product`}
                      expandMap={expandMap}
                      onToggle={toggleSection}
                    >
                      <BulletList items={entry.content.product_launches} />
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="News Coverage"
                      sectionKey={`${keyBase}-news`}
                      expandMap={expandMap}
                      onToggle={toggleSection}
                    >
                      <BulletList items={entry.content.news_coverage} />
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="Hiring Trends"
                      sectionKey={`${keyBase}-hiring`}
                      expandMap={expandMap}
                      onToggle={toggleSection}
                    >
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {entry.content.hiring_trends || (
                          <span className="text-slate-400 italic">No data available.</span>
                        )}
                      </p>
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="Social Media Highlights"
                      sectionKey={`${keyBase}-social`}
                      expandMap={expandMap}
                      onToggle={toggleSection}
                    >
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {entry.content.social_media_highlights || (
                          <span className="text-slate-400 italic">No data available.</span>
                        )}
                      </p>
                    </CollapsibleSection>

                    <CollapsibleSection
                      title="Competitive Intelligence"
                      sectionKey={`${keyBase}-ci`}
                      expandMap={expandMap}
                      onToggle={toggleSection}
                    >
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {entry.content.competitive_intelligence || (
                          <span className="text-slate-400 italic">No data available.</span>
                        )}
                      </p>
                    </CollapsibleSection>

                    {/* Card footer */}
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                      <p className="text-xs text-slate-400">
                        Generated on {formatDate(entry.generated_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
