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

function App() {
  const [view, setView] = useState<"widget" | "calendar" | "settings">("widget");
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const { fetchContests, isLoading, needsConfig } = useContestStore();

  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

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
              setUsername(config.username);
              setApiKey(config.api_key);
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
      await invoke("save_api_config", { username, apiKey });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      fetchContests(); // Refetch with new credentials
    } catch (e) {
      console.error("Failed to save config:", e);
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
          {needsConfig && view !== "settings" && (
            <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-3 m-3 rounded-lg text-sm flex items-center justify-between">
              <span>Please configure your Clist API credentials in Settings to fetch upcoming contests.</span>
              <button onClick={() => setView("settings")} className="text-xs bg-blue-500/20 hover:bg-blue-500/30 px-3 py-1.5 rounded transition-colors">Go to Settings</button>
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
                
                <button onClick={handleSaveConfig} className={`mt-4 w-full text-sm py-2 rounded transition-colors ${saveSuccess ? 'bg-green-500/20 text-green-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                  {saveSuccess ? "Saved successfully!" : "Save Configuration"}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
