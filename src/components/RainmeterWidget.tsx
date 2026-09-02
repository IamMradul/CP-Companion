import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useContestStore } from "../stores/useContestStore";
import { formatTimeRemaining } from "../utils/time";
import { GripVertical, X, ExternalLink, Maximize2, CalendarDays } from "lucide-react";
import { addToGooglesCalendar } from "../utils/calendar";

export function RainmeterWidget() {
  const { contests, isLoading } = useContestStore();
  const [, setTick] = useState(0);

  // We don't call fetchContests() directly here anymore to avoid API race conditions with the main window.
  // Instead, we listen for Tauri events emitted by the main window to stay perfectly in sync.
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    
    const initWidget = async () => {
      try {
        // Initial sync from cache on load
        const cached = await invoke<any[]>("get_cached_contests");
        if (cached && cached.length > 0) {
          useContestStore.setState({ contests: cached, isLoading: false, error: null });
        }
      } catch (err) {
        console.error("Failed to sync widget cache:", err);
      }
      
      // Listen for updates from main window
      unlistenFn = await listen("contests-updated", (event) => {
        const updatedContests = event.payload as any[];
        if (updatedContests && updatedContests.length > 0) {
          useContestStore.setState({ contests: updatedContests, isLoading: false, error: null });
        }
      });
    };

    initWidget();

    // Poll the local SQLite cache every 5 seconds to ensure widget stays in sync,
    // especially on startup when Tauri events might be missed due to race conditions.
    const pollInterval = setInterval(() => {
      initWidget();
    }, 5000);

    // Live countdown tick
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
      clearInterval(pollInterval);
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const now = new Date().getTime();
  const within24h = contests.filter((c) => {
    const start = new Date(c.startTime).getTime();
    const end = start + c.durationSeconds * 1000;
    const isOngoing = now >= start && now < end;
    const diff = start - now;
    return isOngoing || (diff > 0 && diff <= 24 * 60 * 60 * 1000);
  });

  // If no contests within 24h, show the next 2 upcoming contests instead
  const isFallback = within24h.length === 0;
  const upcoming = isFallback
    ? contests
        .filter((c) => new Date(c.startTime).getTime() + c.durationSeconds * 1000 > now)
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 2)
    : within24h;

  const closeWidget = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await getCurrentWindow().hide();
    } catch (err) {
      console.error("Failed to hide window:", err);
    }
  };

  const openMainApp = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await invoke("open_main_app");
    } catch (err) {
      console.error("Failed to open main app:", err);
    }
  };

  const startDrag = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  };

  if (isLoading && upcoming.length === 0) {
    return (
      <div 
        onMouseDown={startDrag}
        className="w-full h-full bg-white dark:bg-[#1a1a1a] rounded-xl border border-black/15 dark:border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <div className="w-4 h-4 border-2 border-black/20 dark:border-white/20 border-t-black/80 dark:border-t-white/80 rounded-full animate-spin pointer-events-none"></div>
      </div>
    );
  }

  return (
    <div onDoubleClick={openMainApp} className="w-screen h-screen bg-white dark:bg-[#1a1a1a] rounded-xl border border-black/15 dark:border-white/10 flex items-stretch shadow-2xl overflow-hidden relative group/widget">
      {/* Drag Handle */}
      <div 
        onMouseDown={startDrag}
        className="w-4 shrink-0 flex flex-col justify-center cursor-grab active:cursor-grabbing hover:bg-black/5 dark:hover:bg-white/5 border-r border-black/10 dark:border-white/5 transition-colors"
        title="Drag to move"
      >
        <GripVertical className="w-3 h-3 text-black/30 dark:text-white/20 mx-auto pointer-events-none opacity-0 group-hover/widget:opacity-100 transition-opacity" />
      </div>

      {/* Clickable Area */}
      <div className="flex-1 flex flex-col justify-start px-1.5 py-2 gap-1 overflow-y-auto custom-scrollbar min-h-0 pr-1">
        {isFallback && upcoming.length > 0 && (
          <div className="text-[9px] font-medium tracking-wider text-black/30 dark:text-white/25 uppercase text-center py-0.5 pointer-events-none">
            Next upcoming
          </div>
        )}
        {upcoming.length > 0 ? (
          upcoming.map((contest) => {
            const start = new Date(contest.startTime).getTime();
            const isOngoingContest = now >= start && now < (start + contest.durationSeconds * 1000);
            
            return (
            <div
              key={contest.id}
              onClick={(e) => {
                e.stopPropagation();
                openUrl(contest.url);
              }}
              className={`flex flex-col group/item hover:bg-white/[0.04] p-2.5 rounded-lg cursor-pointer transition-colors border ${isOngoingContest ? 'border-red-500/20 bg-red-500/[0.02]' : 'border-transparent'} ${isFallback ? 'opacity-70' : ''}`}
              title={contest.url}
            >
              <div className="flex items-center justify-between pointer-events-none mb-1.5">
                <span className="text-[10px] font-medium tracking-wider text-black/50 dark:text-white/40 uppercase flex items-center gap-1">
                  {contest.platform}
                </span>
                <span className={`text-[10.5px] font-mono font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1.5 ${isOngoingContest ? 'text-red-400 bg-red-500/10' : 'text-black/70 dark:text-white/70 bg-black/10 dark:bg-white/10'}`}>
                  {isOngoingContest && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] shadow-[0_0_8px_rgba(239,68,68,0.8)]" />}
                  {isOngoingContest ? 'ONGOING' : formatTimeRemaining(contest.startTime)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[12.5px] font-medium text-black/80 dark:text-white/80 truncate pointer-events-none group-hover/item:text-black dark:group-hover/item:text-white leading-tight">
                  {contest.name}
                </h3>
                <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                  <button 
                    onClick={(e) => { e.stopPropagation(); addToGooglesCalendar(contest); }}
                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded text-black/50 dark:text-white/40 hover:text-black/90 dark:hover:text-white/90 transition-colors"
                    title="Add to Google Calendar"
                  >
                    <CalendarDays className="w-3 h-3" />
                  </button>
                  <div className="p-1 text-black/40 dark:text-white/30 group-hover/item:text-black/70 dark:group-hover/item:text-white/70">
                    <ExternalLink className="w-3 h-3 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )})
        ) : (
          <div className="text-xs text-black/50 dark:text-white/40 text-center pointer-events-none flex-1 flex items-center justify-center min-h-[44px]">
            No upcoming contests
          </div>
        )}
      </div>

      {/* Open Main App Button */}
      <button 
        onClick={openMainApp}
        className="absolute left-5 bottom-1.5 p-1 text-black/30 dark:text-white/20 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors opacity-0 group-hover/widget:opacity-100 z-50 cursor-pointer"
        title="Open App"
      >
        <Maximize2 className="w-3 h-3 pointer-events-none" />
      </button>

      {/* Close Button */}
      <button 
        onClick={closeWidget}
        className="absolute right-1.5 top-1.5 p-1 text-black/30 dark:text-white/20 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors opacity-0 group-hover/widget:opacity-100 z-50 cursor-pointer"
        title="Hide Widget"
      >
        <X className="w-3 h-3 pointer-events-none" />
      </button>
    </div>
  );
}

