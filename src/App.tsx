import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Calendar, Settings, Trophy, RefreshCw, LayoutGrid, X } from "lucide-react";
import { WidgetView } from "./components/WidgetView";
import { CalendarView } from "./components/CalendarView";
import { RainmeterWidget } from "./components/RainmeterWidget";
import { useContestStore } from "./stores/useContestStore";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { enable, isEnabled, disable } from '@tauri-apps/plugin-autostart';
import "./App.css";

const SUPPORTED_PLATFORMS = [
  { id: "codeforces.com", name: "Codeforces" },
  { id: "leetcode.com", name: "LeetCode" },
  { id: "atcoder.jp", name: "AtCoder" },
  { id: "codechef.com", name: "CodeChef" },
  { id: "geeksforgeeks.org", name: "GeeksforGeeks" },
  { id: "hackerrank.com", name: "HackerRank" }
];

function App() {
  const [view, setView] = useState<"widget" | "calendar" | "settings">("widget");
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const { fetchContests, isLoading, needsConfig } = useContestStore();

  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dismissConfigModal, setDismissConfigModal] = useState(false);
  const [availablePlatforms, setAvailablePlatforms] = useState<{id: string, name: string}[]>(SUPPORTED_PLATFORMS);
  const [platformSearchQuery, setPlatformSearchQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    SUPPORTED_PLATFORMS.map(p => p.id)
  );

  useEffect(() => {
    // Determine which window we are rendering
    const init = async () => {
      try {
        const appWindow = getCurrentWindow();
        setWindowLabel(appWindow.label);
        
        if (appWindow.label === "main") {
          try {
            const autoStartStatus = await isEnabled();
            setAutostartEnabled(autoStartStatus);
            const config: any = await invoke("get_api_config");
            if (config) {
              setUsername(config.username || "");
              const currentApiKey = config.apiKey || config.api_key || "";
              setApiKey(currentApiKey);
              
              if (config.platforms && Array.isArray(config.platforms)) {
                setSelectedPlatforms(config.platforms);
              }
              if (config.username && currentApiKey) {
                try {
                  const platforms: any[] = await invoke("get_available_platforms");
                  if (platforms && platforms.length > 0) {
                    const formatted = platforms.map(p => ({ 
                      id: p.name, 
                      name: p.name.split('.')[0].replace(/^\w/, (c: string) => c.toUpperCase()) 
                    }));
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
            }
          } catch (err) {
            console.error("Failed to load settings", err);
          }
        }
      } catch (e) {
        // Fallback for browser testing
        setWindowLabel("main");
      }
    };
    init();
    fetchContests();
  }, [fetchContests]);

  const toggleAutostart = async () => {
    try {
      if (autostartEnabled) {
        await disable();
      } else {
        await enable();
      }
      setAutostartEnabled(!autostartEnabled);
    } catch (e) {
      console.error("Failed to toggle autostart", e);
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

  const handleSaveConfig = async () => {
    setSaveSuccess(false);
    try {
      await invoke("save_api_config", { username, apiKey, platforms: selectedPlatforms });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchContests(); // Refetch with new credentials
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  };

  const handleClearConfig = async () => {
    try {
      await invoke("save_api_config", { username: "", apiKey: "", platforms: SUPPORTED_PLATFORMS.map(p => p.id) });
      setUsername("");
      setApiKey("");
      setSelectedPlatforms(SUPPORTED_PLATFORMS.map(p => p.id));
      fetchContests(); // Refetch to reset state
    } catch (e) {
      console.error("Failed to clear config:", e);
    }
  };

  const togglePlatform = async (platformId: string) => {
    const newPlatforms = selectedPlatforms.includes(platformId)
      ? selectedPlatforms.filter((id) => id !== platformId)
      : [...selectedPlatforms, platformId];
    
    setSelectedPlatforms(newPlatforms);
    
    // Auto-save if they have API credentials configured
    if (username && apiKey) {
      try {
        await invoke("save_api_config", { username, apiKey, platforms: newPlatforms });
        fetchContests();
      } catch (e) {
        console.error("Failed to save platforms:", e);
      }
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

    const aPop = SUPPORTED_PLATFORMS.findIndex(p => p.id === a.id);
    const bPop = SUPPORTED_PLATFORMS.findIndex(p => p.id === b.id);
    const aIsPop = aPop !== -1;
    const bIsPop = bPop !== -1;

    if (aIsPop && !bIsPop) return -1;
    if (!aIsPop && bIsPop) return 1;
    if (aIsPop && bIsPop) return aPop - bPop;

    return a.name.localeCompare(b.name);
  });

  const selectAll = async () => {
    const allIds = filteredPlatforms.map(p => p.id);
    const newPlatforms = Array.from(new Set([...selectedPlatforms, ...allIds]));
    setSelectedPlatforms(newPlatforms);
    if (username && apiKey) {
      try {
        await invoke("save_api_config", { username, apiKey, platforms: newPlatforms });
        fetchContests();
      } catch (e) {
        console.error("Failed to save platforms:", e);
      }
    }
  };

  const unselectAll = async () => {
    const filteredIds = new Set(filteredPlatforms.map(p => p.id));
    const newPlatforms = selectedPlatforms.filter(id => !filteredIds.has(id));
    setSelectedPlatforms(newPlatforms);
    if (username && apiKey) {
      try {
        await invoke("save_api_config", { username, apiKey, platforms: newPlatforms });
        fetchContests();
      } catch (e) {
        console.error("Failed to save platforms:", e);
      }
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
    <div className="h-screen w-screen bg-[#111] flex flex-col dark text-foreground">
      {/* Main Glass Panel */}
      <div className="flex-1 flex flex-col overflow-hidden relative border border-white/5 bg-[#1a1a1a]">
        {/* Header */}
        <header 
          data-tauri-drag-region 
          className="h-12 border-b border-white/5 flex items-center justify-between px-3 bg-white/[0.02] cursor-grab active:cursor-grabbing shrink-0"
        >
          <div className="flex items-center gap-2 font-medium tracking-tight pointer-events-none">
            <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center">
              <Trophy className="w-3 h-3 text-white/80" />
            </div>
            <span className="text-sm text-white/90">CP Companion</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchContests()}
              className={`p-1.5 text-white/40 hover:text-white/90 transition-colors rounded-md hover:bg-white/5 ${isLoading ? 'animate-spin text-white/90' : ''}`}
              title="Refresh Contests"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView(view === "widget" ? "calendar" : "widget")}
              className={`p-1.5 transition-colors rounded-md hover:bg-white/5 ${view === 'calendar' ? 'text-white/90 bg-white/10' : 'text-white/40 hover:text-white/90'}`}
              title={view === "widget" ? "Calendar View" : "List View"}
            >
              {view === "widget" ? <Calendar className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
            </button>
            <button 
              onClick={() => setView(view === "settings" ? "widget" : "settings")}
              className={`p-1.5 transition-colors rounded-md hover:bg-white/5 ${view === 'settings' ? 'text-white/90 bg-white/10' : 'text-white/40 hover:text-white/90'}`}
              title="Settings"
            >
              {view === "settings" ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          {needsConfig && !dismissConfigModal && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-5 w-full max-w-sm shadow-2xl flex flex-col gap-3 relative">
                <button 
                  onClick={() => setDismissConfigModal(true)} 
                  className="absolute top-3 right-3 p-1 text-white/40 hover:text-white/90 hover:bg-white/10 rounded-md transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Welcome to CP Companion</h2>
                  <p className="text-sm text-white/70">Please configure your Clist API credentials to fetch upcoming contests.</p>
                </div>
                
                <div>
                  <label className="text-xs text-white/60 block mb-1">Clist Username</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors" placeholder="e.g. tournist" />
                </div>
                <div>
                  <label className="text-xs text-white/60 block mb-1">Clist API Key</label>
                  <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors" placeholder="Enter API Key" />
                </div>
                
                <button onClick={handleSaveConfig} className={`w-full text-sm py-2 rounded transition-colors ${saveSuccess ? 'bg-green-500/20 text-green-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                  {saveSuccess ? "Saved successfully!" : "Save Configuration"}
                </button>

                <div className="mt-2 pt-4 border-t border-white/10">
                  <h3 className="text-xs font-semibold text-white/80 mb-2">How to get your API Key:</h3>
                  <ol className="text-xs text-white/60 space-y-1.5 list-decimal list-inside">
                    <li>Create an account at <a href="https://clist.by" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">clist.by</a></li>
                    <li>Log in and go to the <a href="https://clist.by/api/v4/doc/" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">API Documentation page</a></li>
                    <li>Copy your username and click "Authorization" to get your API Key.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}
          {view === "widget" && <div className="p-3"><WidgetView /></div>}
          {view === "calendar" && <CalendarView />}
          {view === "settings" && (
            <div className="p-4 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-white/90">Settings</h2>
              
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-xs font-semibold text-white/70 uppercase tracking-widest">Application</h3>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/80">Launch on System Startup</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={autostartEnabled} onChange={toggleAutostart} />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/80">Desktop Widget</span>
                  <button 
                    onClick={showWidget}
                    className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded transition-colors"
                  >
                    Show Widget
                  </button>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-4">API Configuration</h3>
                <label className="text-xs text-white/60 block mb-1">Clist Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors" placeholder="e.g. tournist" />
                
                <label className="text-xs text-white/60 block mt-4 mb-1">Clist API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors" placeholder="Enter API Key" />
                
                <div className="mt-4 pt-4 border-t border-white/10">
                  <h3 className="text-xs font-semibold text-white/80 mb-2">How to get your API Key:</h3>
                  <ol className="text-xs text-white/60 space-y-1.5 list-decimal list-inside">
                    <li>Create an account at <a href="https://clist.by" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">clist.by</a></li>
                    <li>Log in and go to the <a href="https://clist.by/api/v4/doc/" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline">API Documentation page</a></li>
                    <li>Copy your username and click "Authorization" to get your API Key.</li>
                  </ol>
                </div>
                <div className="flex gap-2 mt-6">
                  <button onClick={handleSaveConfig} className={`flex-1 text-sm py-2 rounded transition-colors ${saveSuccess ? 'bg-green-500/20 text-green-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                    {saveSuccess ? "Saved successfully!" : "Save Configuration"}
                  </button>
                  <button onClick={handleClearConfig} className="text-sm py-2 px-4 rounded transition-colors bg-red-500/10 hover:bg-red-500/20 text-red-400" title="Remove Configuration">
                    Remove
                  </button>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-white/70 uppercase tracking-widest">Preferred Platforms</h3>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 px-2 py-1 rounded transition-colors">Select All</button>
                    <button onClick={unselectAll} className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/5 text-white/70 px-2 py-1 rounded transition-colors">Clear All</button>
                  </div>
                </div>
                <input 
                  type="text"
                  placeholder="Search platforms..."
                  value={platformSearchQuery}
                  onChange={e => setPlatformSearchQuery(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded p-2 text-sm text-white focus:border-blue-500 outline-none transition-colors mb-3"
                />
                <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-1 flex-1">
                  {filteredPlatforms.map(platform => (
                    <label key={platform.id} className="flex items-center gap-2.5 cursor-pointer group bg-black/20 hover:bg-black/40 p-2 rounded-lg border border-white/5 hover:border-white/10 transition-all">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${selectedPlatforms.includes(platform.id) ? 'bg-blue-500 border-blue-500' : 'border-white/20 group-hover:border-white/40 bg-black/40'}`}>
                        {selectedPlatforms.includes(platform.id) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
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
                      <span className="text-sm text-white/70 group-hover:text-white transition-colors truncate">{platform.name}</span>
                    </label>
                  ))}
                  {filteredPlatforms.length === 0 && (
                    <div className="col-span-2 text-center py-4 text-white/40 text-sm">
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
