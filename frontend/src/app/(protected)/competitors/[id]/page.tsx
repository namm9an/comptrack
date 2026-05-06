"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Globe, Linkedin, Play, User, Plus, Trash2, Calendar, ChevronDown } from "lucide-react";
import { XIcon } from "@/components/XIcon";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  getCompetitor,
  listDigests,
  triggerJob,
  addIndividual,
  removeIndividual,
  listJobs,
  listJobPostings,
  type Competitor,
  type Digest,
  type JobRun,
  type Individual,
  type JobPosting,
} from "@/lib/api";
import { DigestCard } from "@/components/DigestCard";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";

export default function CompetitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [competitor, setCompetitor] = useState<Competitor | null>(null);
  const [digests, setDigests] = useState<Digest[]>([]);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [triggering, setTriggering] = useState<"daily" | "weekly" | null>(null);
  const [lastJob, setLastJob] = useState<JobRun | null>(null);
  const [fetching, setFetching] = useState(true);

  const [showAddInd, setShowAddInd] = useState(false);
  const [indForm, setIndForm] = useState({ name: "", title: "", twitter_handle: "", linkedin_url: "" });
  const [addingInd, setAddingInd] = useState(false);

  // Digest tab state
  const [digestTab, setDigestTab] = useState<"daily" | "weekly">("daily");
  const [selectedDate, setSelectedDate] = useState<string>("");   // YYYY-MM-DD
  const [selectedMonth, setSelectedMonth] = useState<string>(""); // YYYY-MM

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !id) return;
    const numId = parseInt(id);
    Promise.all([getCompetitor(numId), listDigests(numId)])
      .then(([comp, digs]) => {
        setCompetitor(comp);
        setIndividuals(comp.individuals ?? []);
        setDigests(digs);
        if (comp.careers_url) {
          listJobPostings(numId).then(setJobPostings).catch((err: unknown) => {
            console.error("Failed to load job postings:", err);
          });
        }
      })
      .finally(() => setFetching(false));
  }, [user, id]);

  async function handleTrigger(jobType: "daily" | "weekly") {
    if (!competitor) return;
    setTriggering(jobType);
    try {
      const job = await triggerJob(competitor.id, jobType);
      setLastJob(job);

      const poll = setInterval(async () => {
        const jobs = await listJobs(competitor.id);
        const current = jobs.find((j) => j.id === job.id);
        if (current) {
          setLastJob(current);
          if (current.status === "completed" || current.status === "failed") {
            clearInterval(poll);
            setTriggering(null);
            const digs = await listDigests(competitor.id);
            setDigests(digs);
          }
        }
      }, 3000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to trigger job");
      setTriggering(null);
    }
  }

  async function handleAddIndividual(e: React.FormEvent) {
    e.preventDefault();
    if (!competitor) return;
    setAddingInd(true);
    try {
      const ind = await addIndividual(competitor.id, {
        name: indForm.name,
        title: indForm.title || undefined,
        twitter_handle: indForm.twitter_handle || undefined,
        linkedin_url: indForm.linkedin_url || undefined,
      });
      setIndividuals((prev) => [...prev, ind]);
      setShowAddInd(false);
      setIndForm({ name: "", title: "", twitter_handle: "", linkedin_url: "" });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to add individual");
    } finally {
      setAddingInd(false);
    }
  }

  async function handleRemoveIndividual(ind: Individual) {
    if (!competitor) return;
    if (!confirm(`Remove ${ind.name} from tracked individuals?`)) return;
    await removeIndividual(competitor.id, ind.id);
    setIndividuals((prev) => prev.filter((i) => i.id !== ind.id));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (fetching) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!competitor) return null;

  return (
    <div className="flex min-h-screen">
      <Navbar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
            >
              <ArrowLeft size={14} /> Dashboard
            </Link>

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-slate-900">{competitor.name}</h1>
                  {!competitor.active && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  {competitor.website_url && (
                    <a href={competitor.website_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-600">
                      <Globe size={13} /> Website
                    </a>
                  )}
                  {competitor.twitter_handle && (
                    <a href={`https://x.com/${competitor.twitter_handle}`} target="_blank"
                      rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                      <XIcon size={13} /> @{competitor.twitter_handle}
                    </a>
                  )}
                  {competitor.linkedin_url && (
                    <a href={competitor.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-600">
                      <Linkedin size={13} /> LinkedIn
                    </a>
                  )}
                </div>
              </div>

              {user?.role === "admin" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTrigger("daily")}
                    disabled={triggering !== null}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Play size={13} />
                    {triggering === "daily" ? "Running…" : "Run daily"}
                  </button>
                  <button
                    onClick={() => handleTrigger("weekly")}
                    disabled={triggering !== null}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Play size={13} />
                    {triggering === "weekly" ? "Running…" : "Run weekly"}
                  </button>
                </div>
              )}
            </div>

            {lastJob && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <JobStatusBadge status={lastJob.status} />
                <span>Job #{lastJob.id} · {formatDate(lastJob.started_at)}</span>
                {lastJob.error && (
                  <span className="text-red-600 text-xs">{lastJob.error}</span>
                )}
              </div>
            )}
          </div>

          {/* Tracked individuals */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">
                Tracked Individuals {individuals.length > 0 && `(${individuals.length})`}
              </h2>
              {user?.role === "admin" && (
                <button
                  onClick={() => setShowAddInd(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
                >
                  <Plus size={11} /> Add person
                </button>
              )}
            </div>
            {individuals.length === 0 ? (
              <p className="text-sm text-slate-400 italic">
                No individuals tracked yet.{user?.role === "admin" && " Add a CEO, CTO, or other key person above."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {individuals.map((ind) => (
                  <div key={ind.id}
                    className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 group">
                    <User size={13} className="text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{ind.name}</p>
                      {ind.title && <p className="text-xs text-slate-500">{ind.title}</p>}
                    </div>
                    {user?.role === "admin" && (
                      <button
                        onClick={() => handleRemoveIndividual(ind)}
                        className="ml-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Digest history */}
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-4">
              Digest History ({digests.length})
            </h2>

            {digests.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-400">No digests yet.</p>
                {user?.role === "admin" && (
                  <p className="text-xs text-slate-400 mt-1">Trigger a job above to collect data.</p>
                )}
              </div>
            ) : (
              <>
                {/* Tab bar */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                    {(["daily", "weekly"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => { setDigestTab(tab); setSelectedDate(""); setSelectedMonth(""); }}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${
                          digestTab === tab
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {/* Filter */}
                  {digestTab === "daily" ? (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      {selectedDate && (
                        <button
                          onClick={() => setSelectedDate("")}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ChevronDown size={14} className="text-slate-400" />
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                      {selectedMonth && (
                        <button
                          onClick={() => setSelectedMonth("")}
                          className="text-xs text-slate-400 hover:text-slate-600"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Digest list */}
                {(() => {
                  const filtered = digests
                    .filter((d) => d.period === digestTab)
                    .filter((d) => {
                      if (digestTab === "daily" && selectedDate) return d.digest_date === selectedDate;
                      if (digestTab === "weekly" && selectedMonth) return d.digest_date.startsWith(selectedMonth);
                      return true;
                    });

                  return filtered.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl">
                      <p className="text-sm text-slate-400">
                        {selectedDate || selectedMonth
                          ? "No digests match the selected filter."
                          : `No ${digestTab} digests yet.`}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filtered.map((d) => (
                        <DigestCard key={d.id} digest={d} />
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </section>

          {/* Open Roles */}
          {(competitor.careers_url || jobPostings.length > 0) && (
            <section className="mt-10">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Open Roles</h2>
                {jobPostings.length > 0 && (
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {jobPostings.length}
                  </span>
                )}
              </div>

              {!competitor.careers_url ? (
                <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                  No careers page configured for this competitor.
                </p>
              ) : jobPostings.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">
                  No open positions tracked yet — will populate after next job run.
                </p>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {["Role", "Department", "Location", "First seen"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {jobPostings.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            {job.url ? (
                              <a href={job.url} target="_blank" rel="noopener noreferrer"
                                className="text-blue-600 hover:underline font-medium">
                                {job.title}
                              </a>
                            ) : (
                              <span className="text-slate-800 font-medium">{job.title}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {job.department ? (
                              <span className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-0.5">
                                {job.department}
                              </span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-sm">
                            {job.location ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">
                            {job.first_seen}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Add individual modal */}
      {showAddInd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Add tracked individual</h2>
            <form onSubmit={handleAddIndividual} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
                <input
                  required
                  value={indForm.name}
                  onChange={(e) => setIndForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jensen Huang"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Title</label>
                <input
                  value={indForm.title}
                  onChange={(e) => setIndForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. CEO"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Twitter/X handle</label>
                <input
                  value={indForm.twitter_handle}
                  onChange={(e) => setIndForm((f) => ({ ...f, twitter_handle: e.target.value }))}
                  placeholder="@handle"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">LinkedIn URL</label>
                <input
                  value={indForm.linkedin_url}
                  onChange={(e) => setIndForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  placeholder="https://linkedin.com/in/..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddInd(false); setIndForm({ name: "", title: "", twitter_handle: "", linkedin_url: "" }); }}
                  className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingInd}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {addingInd ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
