import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, Settings, Trophy, RefreshCw, LayoutGrid, X } from "lucide-react";
import { WidgetView } from "./components/WidgetView";
import { CalendarView } from "./components/CalendarView";
import { RainmeterWidget } from "./components/RainmeterWidget";
import { useContestStore } from "./stores/useContestStore";
import { useThemeStore } from "./stores/useThemeStore";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { message } from '@tauri-apps/plugin-dialog';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { UpdateNotification } from './components/UpdateNotification';
import "./App.css";

function App() {
  const [view, setView] = useState<"widget" | "calendar" | "settings">("widget");
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const { fetchContests, loadFromCache, isLoading } = useContestStore();

  const [availablePlatforms, setAvailablePlatforms] = useState<{ id: string, name: string }[]>([]);
  const [platformSearchQuery, setPlatformSearchQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    const initEvent = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      checkAutostart();
      listen<"light" | "dark" | "system">("theme-updated", (event) => {
        if (event.payload) {
          setTheme(event.payload);
        }
      });
    };
    initEvent();
  }, [setTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    // Determine which window we are rendering
    const init = async () => {
      try {
        const appWindow = getCurrentWindow();
        setWindowLabel(appWindow.label);

        if (appWindow.label === "main") {
          // Main window fetches contests on startup ONLY if 24 hours have passed
          const lastAutoFetch = localStorage.getItem("last_auto_fetch_time");
          const now = Date.now();
          
          try {
            const cached = await invoke<any[]>("get_cached_contests");
            const isDbEmpty = !cached || cached.length === 0;

            if (isDbEmpty || !lastAutoFetch || now - parseInt(lastAutoFetch) >= 86400000 || now < parseInt(lastAutoFetch)) {
              fetchContests().then(() => {
                const state = useContestStore.getState();
                if (!state.error) {
                  localStorage.setItem("last_auto_fetch_time", Date.now().toString());
                }
              });
            } else {
              // Load from cache instead of hitting the API
              useContestStore.setState({ contests: cached, isLoading: false, error: null });
            }
          } catch (err) {
            console.error("Failed to load cached contests:", err);
            // If checking the DB fails, try to fetch anyway to recover
            fetchContests();
          }
          
          try {
            // Check if this is the first time running the app
            const hasRunBefore = localStorage.getItem("cp_companion_has_run");
            if (!hasRunBefore) {
              if (!autostartEnabled) {
                try {
                  const msix = await invoke("is_msix");
                  if (msix) await invoke("enable_autostart");
                  else await enable();
                  setAutostartEnabled(true);
                } catch (e) {}
              }
              localStorage.setItem("cp_companion_has_run", "true");
            }
            
            const config: any = await invoke("get_api_config");
            if (config) {
              if (config.platforms && Array.isArray(config.platforms)) {
                setSelectedPlatforms(config.platforms);
              }
              try {
                let platforms: any[] = [];
                const lastPlatformsFetch = localStorage.getItem("last_platforms_fetch_time");
                const now = Date.now();
                if (!lastPlatformsFetch || now - parseInt(lastPlatformsFetch) >= 86400000 || now < parseInt(lastPlatformsFetch)) {
                  try {
                    platforms = await invoke("get_available_platforms");
                    localStorage.setItem("cached_platforms", JSON.stringify(platforms));
                    localStorage.setItem("last_platforms_fetch_time", Date.now().toString());
                  } catch (err) {
                    console.warn("Failed to fetch dynamic platforms, falling back to cache:", err);
                    platforms = JSON.parse(localStorage.getItem("cached_platforms") || "[]");
                  }
                } else {
                  platforms = JSON.parse(localStorage.getItem("cached_platforms") || "[]");
                }
                
                if (platforms && platforms.length > 0) {
                  const formatted = platforms.map(p => {
                    let niceName = p.name;
                    if (niceName.includes('.')) {
                        let parts = niceName.split('.');
                        niceName = parts[0];
                        // Special cases for nicer formatting
                        if (niceName === "geeksforgeeks") niceName = "GeeksforGeeks";
                        else if (niceName === "hackerrank") niceName = "HackerRank";
                        else niceName = niceName.charAt(0).toUpperCase() + niceName.slice(1);
                    }
                    return {
                      id: p.name,
                      name: niceName
                    };
                  });
                  formatted.sort((a, b) => {
                    const aSel = config.platforms?.includes(a.id);
                    const bSel = config.platforms?.includes(b.id);
                    if (aSel && !bSel) return -1;
                    if (!aSel && bSel) return 1;
                    return a.name.localeCompare(b.name);
                  });
                  setAvailablePlatforms(formatted);
                }
              } catch (e) {
                console.error("Failed to fetch dynamic platforms:", e);
              }
            }
          } catch (err) {
            console.error("Failed to load settings", err);
          }
        }
      } catch (e) {
        // Fallback for browser testing
        setWindowLabel("main");
        fetchContests();
      }
    };
    init();
  }, [fetchContests]);

  const checkAutostart = async () => {
    try {
      const msix = await invoke("is_msix");
      if (msix) {
        const enabled = await invoke<boolean>("is_autostart_enabled");
        setAutostartEnabled(enabled);
      } else {
        const enabled = await isEnabled();
        setAutostartEnabled(enabled);
      }
    } catch (e) {
      console.error("Failed to check autostart status", e);
    }
  };

  const handleRefresh = async () => {
    // The user clicked refresh, so they expect fresh data from the API!
    // Force reset the 24 hour timer so that the backend request actually goes through.
    localStorage.removeItem("last_auto_fetch_time");
    localStorage.removeItem("last_platforms_fetch_time");
    
    await fetchContests();
    
    // Restart the 24 hour clock
    localStorage.setItem("last_auto_fetch_time", Date.now().toString());
  };

  const toggleAutostart = async () => {
    try {
      const msix = await invoke("is_msix");
      if (msix) {
        if (autostartEnabled) {
          await invoke("disable_autostart");
        } else {
          await invoke("enable_autostart");
        }
      } else {
        if (autostartEnabled) {
          await disable();
        } else {
          await enable();
        }
      }
      setAutostartEnabled(!autostartEnabled);
    } catch (e: any) {
      console.error("Failed to toggle autostart", e);
      if (e === "DISABLED_BY_SYSTEM") {
        await message("Windows requires you to enable this app manually.\n\nSteps:\n1. Click 'Open Task Manager' below.\n2. Find 'CP Companion' in the list.\n3. Right-click it and select 'Enable'.", { title: 'Action Required', kind: 'info', okLabel: 'Open Task Manager' });
        try {
          await invoke("open_startup_settings");
        } catch (err) {
          console.error("Failed to open settings", err);
        }
      } else {
        await message(`Failed to toggle autostart: ${e}`, { title: 'Error', kind: 'error' });
      }
    }
  };

  const showWidget = async () => {
    try {
      const widget = await WebviewWindow.getByLabel('widget');
      if (widget) {
        await widget.show();
      }
    } catch (e) {
      console.error("Failed to show widget", e);
    }
  };



  const togglePlatform = async (platformId: string) => {
    const newPlatforms = selectedPlatforms.includes(platformId)
      ? selectedPlatforms.filter((id) => id !== platformId)
      : [...selectedPlatforms, platformId];

    setSelectedPlatforms(newPlatforms);

    // Auto-save platforms
    try {
      await invoke("save_api_config", { platforms: newPlatforms });
      loadFromCache();
    } catch (e) {
      console.error("Failed to save platforms:", e);
    }
  };

  const filteredPlatforms = availablePlatforms.filter(p =>
    p.name.toLowerCase().includes(platformSearchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(platformSearchQuery.toLowerCase())
  ).sort((a, b) => {
    const aSel = selectedPlatforms.includes(a.id);
    const bSel = selectedPlatforms.includes(b.id);
    if (aSel && !bSel) return -1;
    if (!aSel && bSel) return 1;
    return a.name.localeCompare(b.name);
  });

  const selectAll = async () => {
    const allIds = filteredPlatforms.map(p => p.id);
    const newPlatforms = Array.from(new Set([...selectedPlatforms, ...allIds]));
    setSelectedPlatforms(newPlatforms);
    try {
      await invoke("save_api_config", { platforms: newPlatforms });
      loadFromCache();
    } catch (e) {
      console.error("Failed to save platforms:", e);
    }
  };

  const unselectAll = async () => {
    const filteredIds = new Set(filteredPlatforms.map(p => p.id));
    const newPlatforms = selectedPlatforms.filter(id => !filteredIds.has(id));
    setSelectedPlatforms(newPlatforms);
    try {
      await invoke("save_api_config", { platforms: newPlatforms });
      loadFromCache();
    } catch (e) {
      console.error("Failed to save platforms:", e);
    }
  };

  if (windowLabel === "widget") {
    return <RainmeterWidget />;
  }

  if (windowLabel === null) {
    return null; // Wait for window label to be determined
  }

  // The rest is the Main App window
  return (
    <div className="h-screen w-screen bg-slate-50 dark:bg-[#111] flex flex-col text-foreground">
      {/* Main Glass Panel */}
      <div className="flex-1 flex flex-col overflow-hidden relative border border-black/10 dark:border-white/5 bg-white dark:bg-[#1a1a1a]">
        {/* Update Notification */}
        <UpdateNotification />
        {/* Header */}
        <header
          data-tauri-drag-region
          className="h-12 border-b border-black/10 dark:border-white/5 flex items-center justify-between px-3 bg-white/[0.02] cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="flex items-center gap-2 font-medium tracking-tight pointer-events-none">
            <div className="w-5 h-5 rounded bg-black/10 dark:bg-white/10 flex items-center justify-center">
              <Trophy className="w-3 h-3 text-black/80 dark:text-white/80" />
            </div>
            <span className="text-sm text-black/90 dark:text-white/90">CP Companion</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRefresh}
              className={`p-1.5 text-black/50 dark:text-white/40 hover:text-black/90 dark:hover:text-white/90 transition-colors rounded-md hover:bg-black/5 dark:hover:bg-white/5 ${isLoading ? 'animate-spin text-black/90 dark:text-white/90' : ''}`}
              title="Refresh Contests"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView(view === "widget" ? "calendar" : "widget")}
              className={`p-1.5 transition-colors rounded-md hover:bg-black/5 dark:hover:bg-white/5 ${view === 'calendar' ? 'text-black/90 dark:text-white/90 bg-black/10 dark:bg-white/10' : 'text-black/50 dark:text-white/40 hover:text-black/90 dark:hover:text-white/90'}`}
              title={view === "widget" ? "Calendar View" : "List View"}
            >
              {view === "widget" ? <Calendar className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setView(view === "settings" ? "widget" : "settings")}
              className={`p-1.5 transition-colors rounded-md hover:bg-black/5 dark:hover:bg-white/5 ${view === 'settings' ? 'text-black/90 dark:text-white/90 bg-black/10 dark:bg-white/10' : 'text-black/50 dark:text-white/40 hover:text-black/90 dark:hover:text-white/90'}`}
              title="Settings"
            >
              {view === "settings" ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">

          {view === "widget" && <div className="p-3"><WidgetView /></div>}
          {view === "calendar" && <CalendarView />}
          {view === "settings" && (
            <div className="p-4 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-black/90 dark:text-white/90">Settings</h2>

              <div className="bg-black/5 dark:bg-white/5 border border-black/15 dark:border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-xs font-semibold text-black/70 dark:text-white/70 uppercase tracking-widest">Application</h3>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/80 dark:text-white/80">Theme</span>
                  <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg border border-black/10 dark:border-white/5">
                    {(['light', 'dark', 'system'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={async () => {
                          setTheme(t);
                          const { emit } = await import("@tauri-apps/api/event");
                          await emit("theme-updated", t);
                        }}
                        className={`text-xs px-2.5 py-1 rounded-md capitalize transition-colors ${
                          theme === t
                            ? 'bg-white dark:bg-black/40 text-black dark:text-white shadow-sm border border-black/5 dark:border-white/5'
                            : 'text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/80 dark:text-white/80">Launch on System Startup</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={autostartEnabled} onChange={toggleAutostart} />
                    <div className="w-9 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black/20 dark:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/80 dark:text-white/80">Desktop Widget</span>
                  <button
                    onClick={showWidget}
                    className="text-xs bg-black/10 dark:bg-white/10 hover:bg-black/5 dark:hover:bg-white/20 text-black dark:text-white px-3 py-1.5 rounded transition-colors"
                  >
                    Show Widget
                  </button>
                </div>
              </div>



              <div className="bg-black/5 dark:bg-white/5 border border-black/15 dark:border-white/10 rounded-xl p-4 flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-black/70 dark:text-white/70 uppercase tracking-widest">Preferred Platforms</h3>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-[10px] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/5 text-black/70 dark:text-white/70 px-2 py-1 rounded transition-colors">Select All</button>
                    <button onClick={unselectAll} className="text-[10px] bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/5 text-black/70 dark:text-white/70 px-2 py-1 rounded transition-colors">Clear All</button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Search platforms..."
                  value={platformSearchQuery}
                  onChange={e => setPlatformSearchQuery(e.target.value)}
                  className="w-full bg-black/5 dark:bg-black/20 border border-black/15 dark:border-white/10 rounded p-2 text-sm text-black dark:text-white focus:border-blue-500 outline-none transition-colors mb-3"
                />
                <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-1 flex-1">
                  {filteredPlatforms.map(platform => (
                    <label key={platform.id} className="flex items-center gap-2.5 cursor-pointer group bg-black/5 dark:bg-black/20 hover:bg-white/40 dark:bg-black/40 p-2 rounded-lg border border-black/10 dark:border-white/5 hover:border-black/15 dark:border-white/10 transition-all">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${selectedPlatforms.includes(platform.id) ? 'bg-blue-500 border-blue-500' : 'border-black/20 dark:border-white/20 group-hover:border-black/30 dark:hover:border-white/40 bg-white/40 dark:bg-black/40'}`}>
                        {selectedPlatforms.includes(platform.id) && <svg className="w-2.5 h-2.5 text-black dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={selectedPlatforms.includes(platform.id)}
                        onChange={() => togglePlatform(platform.id)}
                      />
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${platform.id}&sz=64`}
                        alt={platform.name}
                        className="w-4 h-4 rounded-sm object-contain"
                        onError={(e) => {
                          e.currentTarget.onerror = null; // Prevent infinite loop
                          e.currentTarget.src = 'https://www.google.com/s2/favicons?domain=example.com&sz=64';
                          e.currentTarget.style.opacity = '0.5';
                        }}
                      />
                      <span className="text-sm text-black/70 dark:text-white/70 group-hover:text-black dark:hover:text-white transition-colors truncate">{platform.name}</span>
                    </label>
                  ))}
                  {filteredPlatforms.length === 0 && (
                    <div className="col-span-2 text-center py-4 text-black/50 dark:text-white/40 text-sm">
                      No platforms found.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
