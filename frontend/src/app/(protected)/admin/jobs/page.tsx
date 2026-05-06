"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { listJobs, type JobRun } from "@/lib/api";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { Navbar } from "@/components/Navbar";
import { formatDate } from "@/lib/utils";

export default function JobHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [fetching, setFetching] = useState(true);

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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!user) return null;

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
              <p className="text-sm text-slate-500 mt-1">All scheduled and manual tracking job runs</p>
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
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["ID", "Type", "Status", "Triggered by", "Started", "Completed", "Error"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">#{j.id}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          j.job_type === "daily" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                        }`}>
                          {j.job_type}
                        </span>
                      </td>
                      <td className="px-4 py-3"><JobStatusBadge status={j.status} /></td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{j.triggered_by ?? "scheduler"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(j.started_at)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {j.completed_at ? formatDate(j.completed_at) : "—"}
                      </td>
                      <td className="px-4 py-3 text-red-600 text-xs max-w-40 truncate" title={j.error ?? ""}>
                        {j.error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
