import { Contest } from "../stores/useContestStore";
import { openUrl } from "@tauri-apps/plugin-opener";

function formatGoogleDate(date: Date): string {
  return date.toISOString().replace(/-|:|\.\d\d\d/g, '');
}

export async function addToGooglesCalendar(contest: Contest) {
  const start = new Date(contest.startTime);
  const end = new Date(start.getTime() + contest.durationSeconds * 1000);
  
  const text = encodeURIComponent(contest.name);
  const dates = `${formatGoogleDate(start)}/${formatGoogleDate(end)}`;
  const details = encodeURIComponent(`Contest URL: ${contest.url}`);
  const location = encodeURIComponent(contest.platform);
  
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
  
  try {
    await openUrl(url);
  } catch (e) {
    console.error("Failed to open Google Calendar URL:", e);
    // Fallback for web testing
    window.open(url, "_blank");
  }
}


