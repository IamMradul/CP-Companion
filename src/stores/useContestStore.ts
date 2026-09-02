import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

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
  loadFromCache: () => Promise<void>;
}

export const useContestStore = create<ContestState>((set) => ({
  contests: [],
  isLoading: false,
  error: null,
  needsConfig: false,
  fetchContests: async () => {
    set({ isLoading: true, error: null, needsConfig: false });
    try {
      // Call the Rust backend function (this hits the API)
      const data = await invoke<Contest[]>("fetch_contests");
      set({ contests: data, isLoading: false });
      emit("contests-updated", data);
    } catch (err: any) {
      console.error("Failed to fetch contests:", err);
      // Fallback: try fetching cached contests if fetch_contests fails fully
      try {
        const cached = await invoke<Contest[]>("get_cached_contests");
        set({ contests: cached, isLoading: false, error: err.toString() });
        emit("contests-updated", cached);
      } catch (cacheErr) {
        set({ error: err.toString(), isLoading: false });
      }
    }
  },
  loadFromCache: async () => {
    set({ isLoading: true });
    try {
      const cached = await invoke<Contest[]>("get_cached_contests");
      set({ contests: cached, isLoading: false, error: null });
      emit("contests-updated", cached);
    } catch (err: any) {
      console.error("Failed to load cached contests:", err);
      set({ error: err.toString(), isLoading: false });
    }
  },
}));
