import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(isoString: string): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

/** Format a YYYY-MM-DD date string as "8 May 2026" — no time, no UTC shift. */
export function formatDateOnly(dateStr: string): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Format an ISO timestamp as "10:32 AM IST". */
export function formatTimeIST(isoString: string): string {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    hour12: true,
  }) + " IST";
}

export function categoryLabel(cat: string): string {
  if (cat === "e2e_cloud") return "E2E Cloud";
  if (cat === "tir") return "TIR";
  if (cat === "both") return "Both";
  return cat;
}

export function statusColor(status: string): string {
  switch (status) {
    case "completed": return "text-green-600 bg-green-50";
    case "running": return "text-blue-600 bg-blue-50";
    case "failed": return "text-red-600 bg-red-50";
    case "queued": return "text-yellow-600 bg-yellow-50";
    default: return "text-slate-600 bg-slate-50";
  }
}
