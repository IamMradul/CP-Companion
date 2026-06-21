import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Contest } from "../stores/useContestStore";
import { formatTimeRemaining, formatDuration } from "../utils/time";

interface ContestCardProps {
  contest: Contest;
}

export function ContestCard({ contest }: ContestCardProps) {
  const [timeLeft, setTimeLeft] = useState(() =>
    formatTimeRemaining(contest.startTime)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(formatTimeRemaining(contest.startTime));
    }, 1000);
    return () => clearInterval(timer);
  }, [contest.startTime]);

  const getPlatformColor = (platform: string) => {
    switch (platform.toLowerCase()) {
      case "codeforces":
        return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      case "leetcode":
        return "text-orange-400 bg-orange-500/10 border-orange-500/20";
      case "atcoder":
        return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
      default:
        return "text-white/70 bg-white/5 border-white/10";
    }
  };

  return (
    <div
      onClick={async () => {
        try {
          await openUrl(contest.url);
        } catch (e) {
          console.error("Failed to open URL:", e);
        }
      }}
      className="glass-button p-4 text-left w-full group relative overflow-hidden cursor-pointer"
    >
      <div className="flex justify-between items-start mb-2 relative z-10">
        <h3 className="font-semibold text-white/90 group-hover:text-white transition-colors pr-2">
          {contest.name}
        </h3>
        <span
          className={`text-xs font-mono px-2 py-1 rounded-md border ${getPlatformColor(
            contest.platform
          )} whitespace-nowrap`}
        >
          {contest.platform}
        </span>
      </div>
      <div className="flex items-end justify-between mt-4 relative z-10">
        <div className="flex flex-col">
          <span className="text-xs text-white/50 mb-0.5">Starts in</span>
          <span className="text-2xl font-mono font-bold text-white tracking-tight">
            {timeLeft}
          </span>
        </div>
        <div className="text-sm text-white/50 font-medium">
          {formatDuration(contest.durationSeconds)}
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-white/40 group-hover:text-white/70 transition-colors relative z-10">
        <span className="text-xs truncate pr-2" title={contest.url}>
          {contest.url}
        </span>
        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
      </div>
    </div>
  );
}
