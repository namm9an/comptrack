// All fetch calls go through Next.js API proxy routes (/api/... → backend:8081)
// so credentials (cookies) are forwarded correctly and CORS is not an issue.

const API_BASE = "/api";
const AUTH_BASE = "/auth";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Try refresh then retry once
    const refreshed = await tryRefresh();
    if (refreshed) {
      const retry = await fetch(path, {
        ...options,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
      });
      if (!retry.ok) throw new Error("Unauthorized");
      return retry.json() as Promise<T>;
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_BASE}/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function getMe(): Promise<User | null> {
  try {
    return await apiFetch<User>(`${AUTH_BASE}/me`);
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch(`${AUTH_BASE}/logout`, { method: "POST", credentials: "include" });
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export async function listCompetitors(includeInactive = false): Promise<Competitor[]> {
  const q = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<Competitor[]>(`${API_BASE}/competitors${q}`);
}

export async function getCompetitor(id: number): Promise<Competitor> {
  return apiFetch<Competitor>(`${API_BASE}/competitors/${id}`);
}

export async function createCompetitor(data: CompetitorInput): Promise<Competitor> {
  return apiFetch<Competitor>(`${API_BASE}/competitors`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCompetitor(id: number, data: Partial<CompetitorInput>): Promise<Competitor> {
  return apiFetch<Competitor>(`${API_BASE}/competitors/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deactivateCompetitor(id: number): Promise<void> {
  await apiFetch(`${API_BASE}/competitors/${id}/deactivate`, { method: "PATCH" });
}

export async function addIndividual(competitorId: number, data: IndividualInput): Promise<Individual> {
  return apiFetch<Individual>(`${API_BASE}/competitors/${competitorId}/individuals`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function removeIndividual(competitorId: number, individualId: number): Promise<void> {
  await apiFetch(`${API_BASE}/competitors/${competitorId}/individuals/${individualId}`, {
    method: "DELETE",
  });
}

export async function listDigests(competitorId: number): Promise<Digest[]> {
  return apiFetch<Digest[]>(`${API_BASE}/competitors/${competitorId}/digests`);
}

export async function listJobPostings(
  competitorId: number,
  status = "active"
): Promise<JobPosting[]> {
  return apiFetch<JobPosting[]>(
    `${API_BASE}/competitors/${competitorId}/job-postings?status=${status}`
  );
}

export async function suggestCompetitor(data: SuggestionInput): Promise<Suggestion> {
  return apiFetch<Suggestion>(`${API_BASE}/competitors/suggestions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function listJobs(competitorId?: number): Promise<JobRun[]> {
  const q = competitorId ? `?competitor_id=${competitorId}` : "";
  return apiFetch<JobRun[]>(`${API_BASE}/jobs${q}`);
}

export async function getJob(id: number): Promise<JobRun> {
  return apiFetch<JobRun>(`${API_BASE}/jobs/${id}`);
}

export async function triggerJob(competitorId: number | null, jobType: "daily" | "weekly"): Promise<JobRun> {
  return apiFetch<JobRun>(`${API_BASE}/jobs/trigger`, {
    method: "POST",
    body: JSON.stringify({ competitor_id: competitorId, job_type: jobType }),
  });
}

export async function deleteJob(id: number): Promise<void> {
  await apiFetch(`${API_BASE}/jobs/${id}`, { method: "DELETE" });
}

export async function getJobDigests(jobRunId: number): Promise<JobDigest[]> {
  return apiFetch<JobDigest[]>(`${API_BASE}/jobs/${jobRunId}/digests`);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function getStats(): Promise<Stats> {
  return apiFetch<Stats>(`${API_BASE}/admin/stats`);
}

export async function listSuggestions(status?: string): Promise<Suggestion[]> {
  const q = status ? `?status=${status}` : "";
  return apiFetch<Suggestion[]>(`${API_BASE}/admin/suggestions${q}`);
}

export async function reviewSuggestion(id: number, status: "approved" | "rejected"): Promise<Suggestion> {
  return apiFetch<Suggestion>(`${API_BASE}/admin/suggestions/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function listUsers(): Promise<User[]> {
  return apiFetch<User[]>(`${API_BASE}/admin/users`);
}

export async function getHealth(): Promise<HealthStatus> {
  return apiFetch<HealthStatus>(`${API_BASE}/health`);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function getReports(params: {
  category?: string;
  competitor_id?: number;
  days?: number;
}): Promise<ReportItem[]> {
  const q = new URLSearchParams();
  if (params.category && params.category !== "all") q.set("category", params.category);
  if (params.competitor_id) q.set("competitor_id", String(params.competitor_id));
  if (params.days) q.set("days", String(params.days));
  return apiFetch<ReportItem[]>(`${API_BASE}/reports?${q}`);
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export async function listKnowledgeBase(competitorId?: number): Promise<KBEntry[]> {
  const q = competitorId ? `?competitor_id=${competitorId}` : "";
  return apiFetch<KBEntry[]>(`${API_BASE}/knowledge-base${q}`);
}

export async function deleteKbEntry(id: number): Promise<void> {
  await apiFetch(`${API_BASE}/knowledge-base/${id}`, { method: "DELETE" });
}

export async function generateKnowledgeBase(competitorId?: number, month?: string): Promise<void> {
  const q = new URLSearchParams();
  if (competitorId) q.set("competitor_id", String(competitorId));
  if (month) q.set("month", month);
  await apiFetch(`${API_BASE}/knowledge-base/generate?${q}`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  email: string;
  name: string;
  picture?: string;
  role: "user" | "admin";
  created_at: string;
  last_login?: string;
}

export interface Individual {
  id: number;
  competitor_id: number;
  name: string;
  title?: string;
  twitter_handle?: string;
  linkedin_url?: string;
}

export interface IndividualInput {
  name: string;
  title?: string;
  twitter_handle?: string;
  linkedin_url?: string;
}

export interface Digest {
  id: number;
  job_run_id: number;
  competitor_id: number;
  period: "daily" | "weekly";
  digest_date: string;
  digest: DigestContent;
  created_at: string;
}

export interface DigestContent {
  competitor: string;
  period: string;
  date: string;
  // New format fields
  pr?: string[];
  newsletter?: string[];
  web_activity?: string[];
  social_media?: string[];
  founder_pr?: string[];       // weekly only
  funding?: string | null;     // weekly only
  e2e_suggestions?: string[];  // actionable ideas for E2E Networks based on this competitor
  // Legacy fields (kept for backward compat display of old digests)
  summary?: string;
  highlights?: string[];
  social_activity?: string;
  news_mentions?: string[];
  key_people_activity?: Array<{ person: string; activity: string }>;
  events_announced?: Array<{ name: string; date?: string; detail: string }>;
  product_moves?: string[];
  metrics_mentioned?: string[];
  website_changes?: Array<{ page: string; summary: string }>;
  hiring_signals?: {
    available: boolean;
    new_roles: string[];
    removed_roles: string[];
    total_active: number;
    trend: string;
    dept_breakdown: Record<string, number>;
  };
  sources?: string[];
}

export interface Competitor {
  id: number;
  name: string;
  category: "e2e_cloud" | "tir" | "both";
  website_url?: string;
  twitter_handle?: string;
  linkedin_url?: string;
  careers_url?: string;
  pricing_url?: string;
  product_url?: string;
  active: boolean;
  added_by?: string;
  created_at: string;
  individuals: Individual[];
  latest_digest?: Digest;
}

export interface CompetitorInput {
  name: string;
  category: "e2e_cloud" | "tir" | "both";
  website_url?: string;
  twitter_handle?: string;
  linkedin_url?: string;
  careers_url?: string;
  pricing_url?: string;
  product_url?: string;
  individuals?: IndividualInput[];
}

export interface JobPosting {
  id: number;
  competitor_id: number;
  title: string;
  department?: string;
  location?: string;
  url?: string;
  first_seen: string;
  last_seen: string;
  status: "active" | "removed";
}

export interface JobRun {
  id: number;
  competitor_id?: number;
  job_type: "daily" | "weekly";
  status: "queued" | "running" | "completed" | "failed";
  triggered_by?: string;
  started_at: string;
  completed_at?: string;
  error?: string;
}

export interface JobDigest {
  id: number;
  job_run_id: number;
  competitor_id: number;
  competitor_name: string;
  period: "daily" | "weekly";
  digest_date: string;
  digest: DigestContent;
  created_at: string;
}

export interface Suggestion {
  id: number;
  suggested_by: string;
  name: string;
  category: string;
  website_url?: string;
  notes?: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface SuggestionInput {
  name: string;
  category: "e2e_cloud" | "tir" | "both";
  website_url?: string;
  notes?: string;
}

export interface Stats {
  active_competitors: number;
  total_jobs: number;
  total_digests: number;
  total_users: number;
  pending_suggestions: number;
}

export interface HealthStatus {
  status: string;
  llm_connected: boolean;
  llm_endpoint: string;
  searxng_connected: boolean;
  searxng_endpoint: string;
}

export interface ReportItem {
  category: "pr" | "newsletter" | "web" | "social";
  competitor_id: number;
  competitor_name: string;
  competitor_category?: string;
  date: string;         // YYYY-MM-DD
  created_at?: string;  // ISO timestamp of when the digest was created
  content: string;
  period: string;
  source_url?: string;
  competitor_linkedin_url?: string;
  competitor_twitter_handle?: string;
}

export interface KBEntry {
  id: number;
  competitor_id: number;
  competitor_name: string;
  competitor_category?: string;
  month: string;
  content: {
    executive_summary: string;
    pr: string[];
    newsletter: string[];
    web_activity: string[];
    social_media: string[];
    suggestions: string[];
    sources: string[];
    competitor: string;
    generated_at: string;
    // legacy fields kept optional
    key_developments?: string[];
    product_launches?: string[];
    hiring_trends?: string;
    social_media_highlights?: string;
    competitive_intelligence?: string;
    news_coverage?: string[];
  };
  generated_at: string;
  generated_by: string;
}
