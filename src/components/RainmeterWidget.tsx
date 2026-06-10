import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useContestStore } from "../stores/useContestStore";
import { formatTimeRemaining } from "../utils/time";
import { GripVertical, X } from "lucide-react";

export function RainmeterWidget() {
  const { contests, isLoading } = useContestStore();
  const [, setTick] = useState(0);

  // We don't call fetchContests() directly here anymore to avoid API race conditions with the main window.
  // Instead, we poll the local SQLite cache every few seconds so it automatically syncs!
  useEffect(() => {
    const syncFromCache = async () => {
      try {
        const cached = await invoke<any[]>("get_cached_contests");
        if (cached && cached.length > 0) {
          useContestStore.setState({ contests: cached, isLoading: false, error: null });
        }
      } catch (err) {
        console.error("Failed to sync widget cache:", err);
      }
    };

    // Initial sync
    syncFromCache();

    // Live countdown tick + Database sync
    const timer = setInterval(() => {
      setTick((t) => t + 1);
      // Sync from cache every 5 seconds (every 5 ticks)
      setTick((t) => {
        if (t % 5 === 0) syncFromCache();
        return t + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const upcoming = contests.length > 0 ? contests[0] : null;

  const openMainApp = () => {
    invoke("open_main_app");
  };

  const closeWidget = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await getCurrentWindow().hide();
    } catch (err) {
      console.error("Failed to hide window:", err);
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

  if (isLoading && !upcoming) {
    return (
      <div 
        onMouseDown={startDrag}
        className="w-full h-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin pointer-events-none"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-black/40 backdrop-blur-md rounded-xl border border-white/10 flex items-center shadow-xl group hover:bg-black/50 hover:border-white/20 transition-all overflow-hidden relative">
      {/* Drag Handle */}
      <div 
        onMouseDown={startDrag}
        className="h-full px-1.5 flex flex-col justify-center cursor-grab active:cursor-grabbing bg-white/5 hover:bg-white/10 border-r border-white/5 transition-colors"
        title="Drag to move"
      >
        <GripVertical className="w-3.5 h-3.5 text-white/30 pointer-events-none" />
      </div>

      {/* Clickable Area */}
      <div 
        onClick={openMainApp}
        className="flex-1 flex flex-col justify-center px-3 h-full cursor-pointer pr-6"
      >
        {upcoming ? (
          <>
            <div className="flex items-center justify-between pointer-events-none">
              <span className="text-[10px] font-bold tracking-widest text-white/50 uppercase">
                {upcoming.platform}
              </span>
              <span className="text-[10px] font-mono font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                {formatTimeRemaining(upcoming.startTime)}
              </span>
            </div>
            <h3 className="text-xs font-medium text-white/90 mt-1 truncate pointer-events-none group-hover:text-white">
              {upcoming.name}
            </h3>
          </>
        ) : (
          <div className="text-xs text-white/50 text-center pointer-events-none">
            No upcoming contests
          </div>
        )}
      </div>

      {/* Close Button */}
      <button 
        onClick={closeWidget}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/80 hover:bg-white/10 rounded transition-colors opacity-0 group-hover:opacity-100 z-50 cursor-pointer"
        title="Hide Widget"
      >
        <X className="w-3 h-3 pointer-events-none" />
      </button>
    </div>
  );
}

