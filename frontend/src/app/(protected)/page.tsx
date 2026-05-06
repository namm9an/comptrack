"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { listCompetitors, suggestCompetitor, type Competitor } from "@/lib/api";
import { CompetitorCard } from "@/components/CompetitorCard";
import { Navbar } from "@/components/Navbar";
import { categoryLabel } from "@/lib/utils";

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestForm, setSuggestForm] = useState({ name: "", category: "e2e_cloud", website_url: "", notes: "" });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestDone, setSuggestDone] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      listCompetitors()
        .then(setCompetitors)
        .finally(() => setFetching(false));
    }
  }, [user]);

  async function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    setSuggesting(true);
    try {
      await suggestCompetitor({
        name: suggestForm.name,
        category: suggestForm.category as "e2e_cloud" | "tir",
        website_url: suggestForm.website_url || undefined,
        notes: suggestForm.notes || undefined,
      });
      setSuggestDone(true);
      setTimeout(() => {
        setShowSuggest(false);
        setSuggestDone(false);
        setSuggestForm({ name: "", category: "e2e_cloud", website_url: "", notes: "" });
      }, 2000);
    } finally {
      setSuggesting(false);
    }
  }

  const grouped = {
    e2e_cloud: competitors.filter((c) => c.category === "e2e_cloud"),
    tir: competitors.filter((c) => c.category === "tir"),
  };

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
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Competitor Intelligence</h1>
              <p className="text-sm text-slate-500 mt-1">
                Latest digests for E2E Cloud and TIR competitors
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => listCompetitors().then(setCompetitors)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                onClick={() => setShowSuggest(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={14} />
                Suggest competitor
              </button>
            </div>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-10">
              {(["e2e_cloud", "tir"] as const).map((cat) => (
                <section key={cat}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-base font-semibold text-slate-800">
                      {categoryLabel(cat)} Competitors
                    </h2>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {grouped[cat].length}
                    </span>
                  </div>
                  {grouped[cat].length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                      No competitors tracked in this category yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {grouped[cat].map((c) => (
                        <CompetitorCard key={c.id} competitor={c} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Suggest modal */}
      {showSuggest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Suggest a competitor</h2>
            {suggestDone ? (
              <p className="text-green-600 text-sm py-4 text-center font-medium">
                Suggestion submitted — an admin will review it.
              </p>
            ) : (
              <form onSubmit={handleSuggest} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Company name *</label>
                  <input
                    required
                    value={suggestForm.name}
                    onChange={(e) => setSuggestForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Crusoe Energy"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Category *</label>
                  <select
                    value={suggestForm.category}
                    onChange={(e) => setSuggestForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="e2e_cloud">E2E Cloud</option>
                    <option value="tir">TIR</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Website URL</label>
                  <input
                    type="url"
                    value={suggestForm.website_url}
                    onChange={(e) => setSuggestForm((f) => ({ ...f, website_url: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                  <textarea
                    value={suggestForm.notes}
                    onChange={(e) => setSuggestForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Why should we track this company?"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSuggest(false)}
                    className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={suggesting}
                    className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                  >
                    {suggesting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
