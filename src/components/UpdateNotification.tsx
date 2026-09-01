import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, X, Sparkles } from "lucide-react";

interface UpdateInfo {
  available: boolean;
  latestVersion: string;
  downloadUrl: string;
}

export function UpdateNotification() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const info = await invoke<UpdateInfo>("check_for_updates");
        if (info.available) {
          setUpdate(info);
          // Trigger entrance animation after a small delay
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setVisible(true));
          });
        }
      } catch (err) {
        console.error("Update check failed:", err);
      }
    };
    checkUpdate();
  }, []);

  if (!update || dismissed) return null;

  return (
    <div
      className={`
        relative overflow-hidden shrink-0
        transition-all duration-500 ease-out
        ${visible ? "max-h-20 opacity-100" : "max-h-0 opacity-0"}
      `}
    >
      <div className="relative bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 border-b border-black/15 dark:border-white/10 px-4 py-2.5">
        {/* Animated shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent animate-shimmer" />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-black dark:text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-medium text-black/90 dark:text-white/90">
                Version {update.latestVersion} is available!
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => openUrl(update.downloadUrl)}
              className="flex items-center gap-1.5 text-xs font-medium bg-black/10 dark:bg-white/10 hover:bg-black/5 dark:hover:bg-white/20 text-black dark:text-white px-3 py-1.5 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
            <button
              onClick={() => {
                setVisible(false);
                setTimeout(() => setDismissed(true), 500);
              }}
              className="p-1.5 text-black/40 dark:text-white/30 hover:text-black/80 dark:hover:text-white/80 hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
