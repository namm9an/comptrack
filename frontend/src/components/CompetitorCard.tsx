import Link from "next/link";
import { ExternalLink, Globe, Twitter } from "lucide-react";
import type { Competitor } from "@/lib/api";
import { categoryLabel, formatDate } from "@/lib/utils";

interface Props {
  competitor: Competitor;
}

export function CompetitorCard({ competitor: c }: Props) {
  const digest = c.latest_digest?.digest;

  return (
    <Link
      href={`/competitors/${c.id}`}
      className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
            {c.name}
          </h3>
          <span className="text-xs text-slate-500 mt-0.5 inline-block">
            {categoryLabel(c.category)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!c.active && (
            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
              Inactive
            </span>
          )}
          <div className="flex gap-1.5">
            {c.website_url && (
              <a
                href={c.website_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <Globe size={14} />
              </a>
            )}
            {c.twitter_handle && (
              <a
                href={`https://twitter.com/${c.twitter_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <Twitter size={14} />
              </a>
            )}
          </div>
        </div>
      </div>

      {digest ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 line-clamp-2">{digest.summary}</p>
          {digest.highlights?.length > 0 && (
            <ul className="space-y-0.5">
              {digest.highlights.slice(0, 2).map((h, i) => (
                <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span className="line-clamp-1">{h}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-400 mt-2">
            Last updated: {formatDate(c.latest_digest!.created_at)}
            {" · "}
            <span className="capitalize">{c.latest_digest!.period}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">No digest yet — trigger a job to collect data.</p>
      )}
    </Link>
  );
}
