# CP Companion

CP Companion is a lightweight, cross-platform desktop application designed for Competitive Programming enthusiasts. It tracks upcoming coding contests from various platforms (Codeforces, LeetCode, CodeChef, AtCoder, etc.) via the [Clist API](https://clist.by/) and presents them through a sleek, glassmorphic UI. It also features a "Rainmeter-style" borderless desktop widget to keep the next upcoming contest constantly visible with a live countdown.

## 🏗️ Architecture Overview

The application is built using the **Tauri framework**, combining a high-performance Rust backend with a modern React frontend. 

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Framer Motion.
- **Backend**: Rust, Tauri v2.
- **Local Storage**: SQLite (via `rusqlite`).
- **External API**: Clist.by API v4.

### System Design & Data Flow

The architecture is designed to minimize external API calls (preventing rate limiting) while keeping multiple windows (Main App, Desktop Widget) perfectly synchronized.

1. **State & Synchronization Strategy**:
   - The **Main Window** is responsible for initiating external network requests to the Clist API. When it fetches new contests, the Rust backend immediately caches these results into a local SQLite database stored in the OS's AppData directory.
   - The **Rainmeter Widget Window** operates independently. Instead of making redundant external API requests, it periodically polls the local SQLite cache (every 5 seconds) via Tauri IPC. This ensures the widget always displays up-to-date information without hitting the Clist API rate limits or creating race conditions.

2. **Window Management**:
   - The application manages multiple Tauri Webview Windows (`main` and `widget`). 
   - `App.tsx` conditionally renders different component trees based on the window label (`getCurrentWindow().label`). If the label is `widget`, it renders the `RainmeterWidget` component; otherwise, it renders the main application interface.
   - The app uses `tauri-plugin-single-instance` to ensure only one instance of the backend runs at a time. If a user tries to launch the app again, it simply brings the existing main window to focus.

3. **Background Execution & System Tray**:
   - When the user closes the main window, the application intercepts the close event (`WindowEvent::CloseRequested`) and hides the window instead of terminating the process.
   - The app resides in the system tray, allowing the desktop widget and background synchronization to continue running seamlessly.

## 📂 Project Structure & Core Modules

### 1. Frontend (`/src`)

- **`App.tsx`**: The main routing and layout component. It handles the window detection logic and renders either the Main App (with Calendar, List, and Settings views) or the Desktop Widget.
- **`stores/useContestStore.ts`**: Global state management powered by Zustand. It orchestrates the Tauri IPC calls (`invoke("fetch_contests")`) to the Rust backend and handles API key missing errors gracefully by prompting the user to configure settings.
- **`components/`**:
  - `RainmeterWidget.tsx`: The borderless, draggable overlay. Features a custom 1-second interval hook for the live countdown timer, and a 5-second polling mechanism to sync with the SQLite cache.
  - `WidgetView.tsx` & `ContestCard.tsx`: Standard list view of upcoming contests.
  - `CalendarView.tsx`: A grid-based calendar visualization of the contest schedule.

### 2. Backend (`/src-tauri/src`)

- **`lib.rs`**: The core Tauri setup and entry point.
  - Initializes plugins (`autostart`, `opener`, `single_instance`).
  - Bootstraps the SQLite database and injects the connection pool into Tauri's managed state (`AppState`).
  - Registers the System Tray menu and defines its event handlers.
  - Exposes Tauri Commands (IPC endpoints) to the frontend: `fetch_contests`, `get_cached_contests`, `get_api_config`, `save_api_config`, and `open_main_app`.
- **`clist.rs`**: Handles external network communication. Uses the `reqwest` crate to query the Clist API (`https://clist.by/api/v4/contest/`), parses the JSON response using `serde`, and normalizes datetime formats.
- **`database.rs`**: The persistence layer. Uses `rusqlite` to manage the local `cp_companion.db`. 
  - Maintains two tables: `contests` (caching contest metadata) and `app_config` (securely storing the Clist username and API key locally).
  - Handles the `INSERT OR REPLACE` logic to update the cache when new data arrives from Clist.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Rust (latest stable)
- A Clist API Key (Generate one at [clist.by/api/v4/doc/](https://clist.by/api/v4/doc/))

### Installation & Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run the Development Server**:
   ```bash
   npm run tauri dev
   ```
   *This starts the Vite dev server and compiles the Rust backend in debug mode.*

3. **Build for Production**:
   ```bash
   npm run tauri build
   ```
   *This generates the optimized release binary and installer for your OS.*

## ⚙️ Configuration

Upon first launch, the app will prompt you to enter your Clist API credentials.
1. Create an account on [clist.by](https://clist.by/).
2. Go to your profile settings to retrieve your API Key.
3. Open the Settings tab in CP Companion, enter your Username and API Key, and save. The app will automatically fetch upcoming contests.
