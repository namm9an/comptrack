import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(isoString: string): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
