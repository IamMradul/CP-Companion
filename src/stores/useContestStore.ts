import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface Contest {
  id: number;
  name: string;
  platform: string;
  startTime: string;
  durationSeconds: number;
  url: string;
}

interface ContestState {
  contests: Contest[];
  isLoading: boolean;
  error: string | null;
  needsConfig: boolean;
  fetchContests: () => Promise<void>;
}

export const useContestStore = create<ContestState>((set) => ({
  contests: [],
  isLoading: false,
  error: null,
  needsConfig: false,
  fetchContests: async () => {
    set({ isLoading: true, error: null, needsConfig: false });
    try {
      // Call the Rust backend function
      const data = await invoke<Contest[]>("fetch_contests");
      set({ contests: data, isLoading: false });
    } catch (err: any) {
      console.error("Failed to fetch contests:", err);
      if (err.toString().includes("API_KEY_MISSING")) {
        set({ needsConfig: true, isLoading: false });
        return;
      }
      // Fallback: try fetching cached contests if fetch_contests fails fully
      try {
        const cached = await invoke<Contest[]>("get_cached_contests");
        set({ contests: cached, isLoading: false, error: err.toString() });
      } catch (cacheErr) {
        set({ error: err.toString(), isLoading: false });
      }
    }
  },
}));
