import { cn, statusColor } from "@/lib/utils";

interface Props {
  status: string;
  className?: string;
}

export function JobStatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        statusColor(status),
        className,
      )}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
      )}
      {status}
    </span>
  );
}
