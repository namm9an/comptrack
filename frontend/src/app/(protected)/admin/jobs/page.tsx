"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Trash2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { listJobs, deleteJob, getJobDigests, type JobRun, type JobDigest } from "@/lib/api";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";

export default function JobHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Expandable rows
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [digestCache, setDigestCache] = useState<Record<number, JobDigest[]>>({});
  const [loadingDigests, setLoadingDigests] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    listJobs().then(setJobs).finally(() => setFetching(false));
  }, [user]);

  function refresh() {
    setFetching(true);
    listJobs().then(setJobs).finally(() => setFetching(false));
  }

  async function toggleExpand(jobId: number) {
    if (expandedId === jobId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(jobId);
    if (digestCache[jobId]) return; // already loaded
    setLoadingDigests(jobId);
    try {
      const digests = await getJobDigests(jobId);
      setDigestCache((prev) => ({ ...prev, [jobId]: digests }));
    } catch {
      setDigestCache((prev) => ({ ...prev, [jobId]: [] }));
    } finally {
      setLoadingDigests(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this job run and all its data? This cannot be undone.")) return;
    setDeleting(id);
    try {
      await deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete job");
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <div className="flex min-h-screen">
      <Navbar />
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-2">
                <ArrowLeft size={14} /> Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-slate-900">Job History</h1>
              <p className="text-sm text-slate-500 mt-1">Click any row to see which competitors were processed</p>
            </div>
            <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
              <p className="text-sm text-slate-400">No jobs run yet.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
              {jobs.map((j) => {
                const isExpanded = expandedId === j.id;
                const digests = digestCache[j.id];
                const isLoadingThis = loadingDigests === j.id;

                return (
                  <div key={j.id}>
                    {/* Main row */}
                    <div
                      onClick={() => toggleExpand(j.id)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                    >
                      {/* Expand chevron */}
                      <span className="text-slate-400 shrink-0">
                        {isExpanded
                          ? <ChevronDown size={14} />
                          : <ChevronRight size={14} />}
                      </span>

                      {/* ID */}
                      <span className="text-slate-500 font-mono text-xs w-8 shrink-0">#{j.id}</span>

                      {/* Type */}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                        j.job_type === "daily" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                      }`}>
                        {j.job_type}
                      </span>

                      {/* Status */}
                      <span className="shrink-0"><JobStatusBadge status={j.status} /></span>

                      {/* Triggered by */}
                      <span className="text-slate-500 text-xs truncate flex-1 min-w-0">
                        {j.triggered_by ?? "scheduler"}
                      </span>

                      {/* Started */}
                      <span className="text-slate-400 text-xs shrink-0 hidden sm:block">
                        {formatDate(j.started_at)}
                      </span>

                      {/* Completed */}
                      <span className="text-slate-400 text-xs w-36 shrink-0 hidden md:block">
                        {j.completed_at ? formatDate(j.completed_at) : "—"}
                      </span>

                      {/* Error */}
                      {j.error && (
                        <span className="text-red-500 text-xs max-w-[120px] truncate shrink-0" title={j.error}>
                          {j.error}
                        </span>
                      )}

                      {/* Delete */}
                      {isAdmin && j.status !== "running" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(j.id); }}
                          disabled={deleting === j.id}
                          title="Delete job"
                          className="ml-auto p-1 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    {/* Expanded digest list */}
                    {isExpanded && (
                      <div className="bg-slate-50 border-t border-slate-100 px-6 py-4">
                        {isLoadingThis ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            Loading digests…
                          </div>
                        ) : !digests || digests.length === 0 ? (
                          <p className="text-sm text-slate-400 py-2">
                            No digests were produced for this job run.
                          </p>
                        ) : (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                              {digests.length} competitor{digests.length !== 1 ? "s" : ""} processed
                            </p>
                            <div className="space-y-2">
                              {digests.map((d) => (
                                <div
                                  key={d.id}
                                  className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium text-slate-900 text-sm">{d.competitor_name}</span>
                                      <span className="text-xs text-slate-400">{d.digest_date}</span>
                                    </div>
                                    {d.digest?.summary ? (
                                      <p className="text-xs text-slate-500 line-clamp-2">{d.digest.summary}</p>
                                    ) : (
                                      <p className="text-xs text-slate-400 italic">No summary available</p>
                                    )}
                                  </div>
                                  <Link
                                    href={`/competitors/${d.competitor_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
                                  >
                                    View <ExternalLink size={11} />
                                  </Link>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
