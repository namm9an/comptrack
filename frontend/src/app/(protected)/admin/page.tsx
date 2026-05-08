"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Play, Pencil, Activity, Cpu } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  listCompetitors,
  createCompetitor,
  updateCompetitor,
  deactivateCompetitor,
  listSuggestions,
  reviewSuggestion,
  getStats,
  getLlmUsage,
  triggerJob,
  type Competitor,
  type Suggestion,
  type Stats,
  type LlmUsageStats,
} from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { categoryLabel, formatDate, formatTimeIST } from "@/lib/utils";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [llmUsage, setLlmUsage] = useState<LlmUsageStats | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "", category: "e2e_cloud", website_url: "", twitter_handle: "", linkedin_url: "",
    careers_url: "", pricing_url: "", product_url: "",
  });
  const [adding, setAdding] = useState(false);

  const [editTarget, setEditTarget] = useState<Competitor | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", category: "e2e_cloud", website_url: "", twitter_handle: "", linkedin_url: "",
    careers_url: "", pricing_url: "", product_url: "",
  });
  const [editing, setEditing] = useState(false);

  const [triggering, setTriggering] = useState<number | "all" | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) { router.replace("/login"); return; }
    if (!loading && user?.role !== "admin") { router.replace("/"); return; }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.role !== "admin") return;
    Promise.all([
      listCompetitors(true).then(setCompetitors),
      listSuggestions("pending").then(setSuggestions),
      getStats().then(setStats),
      getLlmUsage().then(setLlmUsage).catch(() => null),
    ]).finally(() => setFetching(false));
  }, [user]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const c = await createCompetitor({
        name: addForm.name,
        category: addForm.category as "e2e_cloud" | "tir" | "both",
        website_url: addForm.website_url || undefined,
        twitter_handle: addForm.twitter_handle || undefined,
        linkedin_url: addForm.linkedin_url || undefined,
        careers_url: addForm.careers_url || undefined,
        pricing_url: addForm.pricing_url || undefined,
        product_url: addForm.product_url || undefined,
      });
      setCompetitors((prev) => [...prev, c]);
      setShowAdd(false);
      setAddForm({ name: "", category: "e2e_cloud", website_url: "", twitter_handle: "", linkedin_url: "", careers_url: "", pricing_url: "", product_url: "" });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to add competitor");
    } finally {
      setAdding(false);
    }
  }

  function openEdit(c: Competitor) {
    setEditTarget(c);
    setEditForm({
      name: c.name,
      category: c.category,
      website_url: c.website_url ?? "",
      twitter_handle: c.twitter_handle ?? "",
      linkedin_url: c.linkedin_url ?? "",
      careers_url: c.careers_url ?? "",
      pricing_url: c.pricing_url ?? "",
      product_url: c.product_url ?? "",
    });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditing(true);
    try {
      const updated = await updateCompetitor(editTarget.id, {
        name: editForm.name,
        category: editForm.category as "e2e_cloud" | "tir" | "both",
        website_url: editForm.website_url || undefined,
        twitter_handle: editForm.twitter_handle || undefined,
        linkedin_url: editForm.linkedin_url || undefined,
        careers_url: editForm.careers_url || undefined,
        pricing_url: editForm.pricing_url || undefined,
        product_url: editForm.product_url || undefined,
      });
      setCompetitors((prev) => prev.map((c) => c.id === updated.id ? updated : c));
      setEditTarget(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update competitor");
    } finally {
      setEditing(false);
    }
  }

  async function handleDeactivate(id: number) {
    if (!confirm("Deactivate this competitor? It won't be tracked in future jobs.")) return;
    await deactivateCompetitor(id);
    setCompetitors((prev) => prev.map((c) => c.id === id ? { ...c, active: false } : c));
  }

  async function handleReview(id: number, status: "approved" | "rejected") {
    await reviewSuggestion(id, status);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    if (status === "approved") {
      listCompetitors(true).then(setCompetitors);
    }
  }

  async function handleTriggerAll(jobType: "daily" | "weekly") {
    setTriggering("all");
    try {
      await triggerJob(null, jobType);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to trigger job");
    } finally {
      setTriggering(null);
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

  if (fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Navbar />
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-500 mt-1">Manage competitors, review suggestions, trigger jobs</p>
          </div>

          {/* Stats row */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                ["Active competitors", stats.active_competitors],
                ["Total jobs", stats.total_jobs],
                ["Total digests", stats.total_digests],
                ["Users", stats.total_users],
                ["Pending suggestions", stats.pending_suggestions],
              ].map(([label, value]) => (
                <div key={label as string} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-slate-900">{value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Trigger all jobs + Job History link */}
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Trigger Jobs (all active competitors)</h2>
              <a
                href="/admin/jobs"
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Activity size={12} />
                View job history
              </a>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleTriggerAll("daily")}
                disabled={triggering !== null}
                className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Play size={13} />
                {triggering === "all" ? "Running…" : "Run daily job"}
              </button>
              <button
                onClick={() => handleTriggerAll("weekly")}
                disabled={triggering !== null}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Play size={13} />
                {triggering === "all" ? "Running…" : "Run weekly job"}
              </button>
            </div>
          </section>

          {/* LLM Token Usage */}
          {llmUsage && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Cpu size={15} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-800">LLM Token Usage</h2>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Today", value: llmUsage.today_tokens.toLocaleString() },
                  { label: "Last 7 days", value: llmUsage.week_tokens.toLocaleString() },
                  { label: "Last 30 days", value: llmUsage.month_tokens.toLocaleString() },
                  { label: "All time", value: llmUsage.total_tokens.toLocaleString() },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                    <p className="text-lg font-bold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Prompt vs completion split */}
              <div className="flex items-center gap-6 text-xs text-slate-500">
                <span>Total calls: <strong className="text-slate-800">{llmUsage.total_calls.toLocaleString()}</strong></span>
                <span>Prompt: <strong className="text-slate-800">{llmUsage.prompt_tokens.toLocaleString()}</strong></span>
                <span>Completion: <strong className="text-slate-800">{llmUsage.completion_tokens.toLocaleString()}</strong></span>
              </div>

              {/* Per-model breakdown */}
              {llmUsage.by_model.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">By model</p>
                  <div className="space-y-1.5">
                    {llmUsage.by_model.map((m) => (
                      <div key={m.model} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <span className="font-medium text-slate-700 truncate max-w-xs">{m.model}</span>
                        <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0 ml-4">
                          <span>{m.calls} calls</span>
                          <span className="font-semibold text-slate-800">{m.total.toLocaleString()} tokens</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent calls */}
              {llmUsage.recent.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent calls (last 20)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-100">
                          <th className="pb-1.5 font-medium">Model</th>
                          <th className="pb-1.5 font-medium">Type</th>
                          <th className="pb-1.5 font-medium text-right">Prompt</th>
                          <th className="pb-1.5 font-medium text-right">Completion</th>
                          <th className="pb-1.5 font-medium text-right">Total</th>
                          <th className="pb-1.5 font-medium text-right">Time (IST)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {llmUsage.recent.map((r, idx) => (
                          <tr key={idx} className="text-slate-600">
                            <td className="py-1.5 truncate max-w-32">{r.model.split("/").pop()}</td>
                            <td className="py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.call_type === "json" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                                {r.call_type}
                              </span>
                            </td>
                            <td className="py-1.5 text-right">{r.prompt_tokens.toLocaleString()}</td>
                            <td className="py-1.5 text-right">{r.completion_tokens.toLocaleString()}</td>
                            <td className="py-1.5 text-right font-medium text-slate-800">{r.total_tokens.toLocaleString()}</td>
                            <td className="py-1.5 text-right text-slate-400">{formatTimeIST(r.called_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {llmUsage.total_calls === 0 && (
                <p className="text-sm text-slate-400 italic">No LLM calls recorded yet. Token tracking starts from the next job run.</p>
              )}
            </section>
          )}

          {/* Pending suggestions */}
          {suggestions.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-800 mb-3">
                Pending Suggestions ({suggestions.length})
              </h2>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div key={s.id}
                    className="bg-white border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {categoryLabel(s.category)} · Suggested by {s.suggested_by} · {formatDate(s.created_at)}
                      </p>
                      {s.website_url && <p className="text-xs text-blue-600 mt-0.5">{s.website_url}</p>}
                      {s.notes && <p className="text-sm text-slate-600 mt-1">{s.notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleReview(s.id, "approved")}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button
                        onClick={() => handleReview(s.id, "rejected")}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Competitors table */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">
                All Competitors ({competitors.length})
              </h2>
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus size={13} /> Add competitor
              </button>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["Name", "Category", "Website", "Status", "Added", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {competitors.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                      <td className="px-4 py-3 text-slate-600">{categoryLabel(c.category)}</td>
                      <td className="px-4 py-3">
                        {c.website_url ? (
                          <a href={c.website_url} target="_blank" rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-xs truncate max-w-32 block">
                            {c.website_url.replace(/^https?:\/\//, "")}
                          </a>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                          {c.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <a href={`/competitors/${c.id}`}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">
                            View
                          </a>
                          <button
                            onClick={() => openEdit(c)}
                            className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded flex items-center gap-0.5"
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          {c.active && (
                            <button
                              onClick={() => handleDeactivate(c.id)}
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {/* Add competitor modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Add competitor</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              {[
                { label: "Company name *", key: "name", required: true, placeholder: "e.g. Crusoe Energy" },
                { label: "Website URL", key: "website_url", placeholder: "https://..." },
                { label: "Twitter/X handle", key: "twitter_handle", placeholder: "@handle" },
                { label: "LinkedIn URL", key: "linkedin_url", placeholder: "https://linkedin.com/company/..." },
              ].map(({ label, key, required, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
                  <input
                    required={required}
                    value={addForm[key as keyof typeof addForm]}
                    onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Careers page URL</label>
                <input
                  type="url"
                  value={addForm.careers_url ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, careers_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://company.com/careers"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Pricing page URL</label>
                <input
                  type="url"
                  value={addForm.pricing_url ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, pricing_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://company.com/pricing"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Product page URL</label>
                <input
                  type="url"
                  value={addForm.product_url ?? ""}
                  onChange={(e) => setAddForm((f) => ({ ...f, product_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://company.com/product"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">Category *</label>
                <div className="flex gap-4">
                  {(["e2e_cloud", "tir", "both"] as const).map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="add-category" value={cat}
                        checked={addForm.category === cat}
                        onChange={() => setAddForm((f) => ({ ...f, category: cat }))}
                        className="accent-blue-600" />
                      <span className="text-sm text-slate-700">
                        {cat === "e2e_cloud" ? "E2E Cloud" : cat === "tir" ? "TIR" : "Both"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={adding}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {adding ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit competitor modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Edit competitor</h2>
            <form onSubmit={handleEdit} className="space-y-3">
              {[
                { label: "Company name *", key: "name", required: true, placeholder: "e.g. Crusoe Energy" },
                { label: "Website URL", key: "website_url", placeholder: "https://..." },
                { label: "Twitter/X handle", key: "twitter_handle", placeholder: "@handle" },
                { label: "LinkedIn URL", key: "linkedin_url", placeholder: "https://linkedin.com/company/..." },
              ].map(({ label, key, required, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-slate-600 block mb-1">{label}</label>
                  <input
                    required={required}
                    value={editForm[key as keyof typeof editForm]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Careers page URL</label>
                <input
                  type="url"
                  value={editForm.careers_url ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, careers_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://company.com/careers"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Pricing page URL</label>
                <input
                  type="url"
                  value={editForm.pricing_url ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, pricing_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://company.com/pricing"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Product page URL</label>
                <input
                  type="url"
                  value={editForm.product_url ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, product_url: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://company.com/product"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-2">Category *</label>
                <div className="flex gap-4">
                  {(["e2e_cloud", "tir", "both"] as const).map((cat) => (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="edit-category" value={cat}
                        checked={editForm.category === cat}
                        onChange={() => setEditForm((f) => ({ ...f, category: cat }))}
                        className="accent-blue-600" />
                      <span className="text-sm text-slate-700">
                        {cat === "e2e_cloud" ? "E2E Cloud" : cat === "tir" ? "TIR" : "Both"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditTarget(null)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={editing}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
                  {editing ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
