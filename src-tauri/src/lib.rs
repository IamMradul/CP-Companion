mod clist;
mod database;

use database::{get_config, get_upcoming_contests, init_db, insert_contests, save_config, Contest};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::WindowEvent;
use tauri::{Manager, State};

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
async fn fetch_contests(state: State<'_, AppState>) -> Result<Vec<Contest>, String> {
    let (server_url, platforms, max_known_users, device_id) = {
        let conn = state.db.lock().unwrap();
        match get_config(&conn) {
            Ok(Some(config)) => (
                if config.server_url.contains("localhost") {
                    "https://don-airlines-registered-announcement.trycloudflare.com/api".to_string()
                } else {
                    config.server_url
                }, 
                config.platforms, 
                config.max_known_users,
                config.device_id
            ),
            _ => (
                "https://don-airlines-registered-announcement.trycloudflare.com/api".to_string(),
                "codeforces.com,leetcode.com,atcoder.jp,codechef.com".to_string(),
                0,
                "".to_string(),
            ),
        }
    };

    // 1. Fetch from Backend API (empty platforms to fetch ALL)
    match clist::fetch_contests(&server_url, "", max_known_users, &device_id).await {
        Ok((contests, returned_max)) => {
            // 2. Save to SQLite Cache
            let conn = state.db.lock().unwrap();
            
            if let Some(new_max) = returned_max {
                if new_max > max_known_users {
                    let _ = database::update_max_known_users(&conn, new_max);
                }
            }

            if let Err(e) = insert_contests(&conn, &contests) {
                eprintln!("Failed to cache contests: {}", e);
            }

            // 3. Return updated contests filtered by selected platforms
            get_upcoming_contests(&conn, &platforms).map_err(|e| e.to_string())
        }
        Err(e) => {
            eprintln!(
                "Failed to fetch from Backend API: {}. Returning error to trigger frontend retry.",
                e
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn get_cached_contests(state: State<'_, AppState>) -> Result<Vec<Contest>, String> {
    let conn = state.db.lock().unwrap();
    let platforms = match get_config(&conn) {
        Ok(Some(config)) => config.platforms,
        _ => "codeforces.com,leetcode.com,atcoder.jp,codechef.com".to_string(),
    };
    get_upcoming_contests(&conn, &platforms).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiConfigResponse {
    platforms: Vec<String>,
}

#[tauri::command]
fn get_api_config(state: State<'_, AppState>) -> Result<Option<ApiConfigResponse>, String> {
    let conn = state.db.lock().unwrap();
    match get_config(&conn) {
        Ok(Some(config)) => Ok(Some(ApiConfigResponse {
            platforms: config
                .platforms
                .split(',')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_api_config(state: State<'_, AppState>, platforms: Vec<String>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let platforms_str = platforms.join(",");
    let server_url = match get_config(&conn) {
        Ok(Some(config)) => config.server_url,
        _ => "https://don-airlines-registered-announcement.trycloudflare.com/api".to_string(),
    };
    save_config(&conn, &server_url, &platforms_str).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_theme(state: State<'_, AppState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    database::get_theme(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_theme(state: State<'_, AppState>, theme: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    database::save_theme(&conn, &theme).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_available_platforms(
    state: State<'_, AppState>,
) -> Result<Vec<clist::ClistPlatform>, String> {
    let (server_url, max_known_users, device_id) = {
        let conn = state.db.lock().unwrap();
        match get_config(&conn) {
            Ok(Some(config)) => (
                if config.server_url.contains("localhost") {
                    "https://don-airlines-registered-announcement.trycloudflare.com/api".to_string()
                } else {
                    config.server_url
                }, 
                config.max_known_users, 
                config.device_id
            ),
            _ => ("https://don-airlines-registered-announcement.trycloudflare.com/api".to_string(), 0, "".to_string()),
        }
    };

    match clist::fetch_available_platforms(&server_url, max_known_users, &device_id).await {
        Ok((platforms, returned_max)) => {
            if let Some(new_max) = returned_max {
                if new_max > max_known_users {
                    let conn = state.db.lock().unwrap();
                    let _ = database::update_max_known_users(&conn, new_max);
                }
            }
            Ok(platforms)
        }
        Err(e) => Err(e.to_string())
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateInfo {
    available: bool,
    latest_version: String,
    download_url: String,
}

fn parse_version(v: &str) -> Vec<u64> {
    let stripped = v.strip_prefix('v').unwrap_or(v);
    stripped
        .split('.')
        .filter_map(|s| s.parse::<u64>().ok())
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let l = parse_version(latest);
    let c = parse_version(current);
    // Compare component by component; missing components treated as 0
    let max_len = l.len().max(c.len());
    for i in 0..max_len {
        let lv = l.get(i).copied().unwrap_or(0);
        let cv = c.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION");

    let client = reqwest::Client::builder()
        .user_agent("cp-companion-update-checker")
        .build()
        .map_err(|e| e.to_string())?;

    let resp: serde_json::Value = client
        .get("https://api.github.com/repos/IamMradul/CP-Companion/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse update response: {}", e))?;

    let tag_name = resp["tag_name"].as_str().unwrap_or("").to_string();
    let _html_url = resp["html_url"]
        .as_str()
        .unwrap_or("https://github.com/IamMradul/CP-Companion/releases")
        .to_string();

    if tag_name.is_empty() {
        return Ok(UpdateInfo {
            available: false,
            latest_version: current_version.to_string(),
            download_url: String::new(),
        });
    }

    let available = is_newer(&tag_name, current_version);

    Ok(UpdateInfo {
        available,
        latest_version: tag_name.strip_prefix('v').unwrap_or(&tag_name).to_string(),
        download_url: "https://cpcompanion.vercel.app/".to_string(),
    })
}

#[tauri::command]
fn open_main_app(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
async fn enable_autostart() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::h;
        use windows::ApplicationModel::StartupTask;

        let task_op = StartupTask::GetAsync(h!("CPCompanionStartup")).map_err(|e| e.to_string())?;
        let task = task_op.get().map_err(|e| e.to_string())?;
        let enable_op = task.RequestEnableAsync().map_err(|e| e.to_string())?;
        let state = enable_op.get().map_err(|e| e.to_string())?;

        use windows::ApplicationModel::StartupTaskState;
        if state == StartupTaskState::Enabled || state == StartupTaskState::EnabledByPolicy {
            Ok(())
        } else {
            // For Desktop Bridge MSIX apps, RequestEnableAsync often returns Disabled.
            // In this case, we must ask the user to manually enable it.
            Err("DISABLED_BY_SYSTEM".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
async fn disable_autostart() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::h;
        use windows::ApplicationModel::StartupTask;
        let task_op = StartupTask::GetAsync(h!("CPCompanionStartup")).map_err(|e| e.to_string())?;
        let task = task_op.get().map_err(|e| e.to_string())?;
        task.Disable().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
async fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use windows::core::h;
        use windows::ApplicationModel::{StartupTask, StartupTaskState};
        let task_op = StartupTask::GetAsync(h!("CPCompanionStartup")).map_err(|e| e.to_string())?;
        let task = task_op.get().map_err(|e| e.to_string())?;
        let state = task.State().map_err(|e| e.to_string())?;
        Ok(state == StartupTaskState::Enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
async fn open_startup_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskmgr")
            .args(&["/0", "/startup"])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn is_msix() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::APPMODEL_ERROR_NO_PACKAGE;
        use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
        unsafe {
            use windows::core::PWSTR;
            let mut length = 0u32;
            let err = GetCurrentPackageFullName(&mut length, PWSTR::null());
            err != APPMODEL_ERROR_NO_PACKAGE
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join("cp_companion.db");

            let conn = init_db(&db_path).expect("Failed to initialize database");

            app.manage(AppState {
                db: Mutex::new(conn),
            });

            // Make the widget window immune to "Show Desktop" (Win+D / 3-finger swipe)
            // by removing minimize box styles, setting WS_EX_TOOLWINDOW, and setting Progman as its owner (GWLP_HWNDPARENT).
            // Setting owner (rather than parent via SetParent) keeps it as a top-level window so it remains fully interactable.
            #[cfg(target_os = "windows")]
            {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    FindWindowW, GetWindowLongPtrW, SetWindowLongPtrW, GWLP_HWNDPARENT,
                    GWL_EXSTYLE, GWL_STYLE, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW, WS_MAXIMIZEBOX,
                    WS_MINIMIZEBOX,
                };

                if let Some(widget_window) = app.get_webview_window("widget") {
                    if let Ok(hwnd_obj) = widget_window.hwnd() {
                        let hwnd = hwnd_obj.0 as isize;
                        unsafe {
                            let style = GetWindowLongPtrW(hwnd as _, GWL_STYLE);
                            let new_style =
                                style & !(WS_MINIMIZEBOX as isize) & !(WS_MAXIMIZEBOX as isize);
                            SetWindowLongPtrW(hwnd as _, GWL_STYLE, new_style);

                            let ex_style = GetWindowLongPtrW(hwnd as _, GWL_EXSTYLE);
                            let new_ex_style = (ex_style & !(WS_EX_APPWINDOW as isize))
                                | (WS_EX_TOOLWINDOW as isize);
                            SetWindowLongPtrW(hwnd as _, GWL_EXSTYLE, new_ex_style);

                            let progman_name: Vec<u16> =
                                "Progman".encode_utf16().chain(std::iter::once(0)).collect();
                            let progman = FindWindowW(progman_name.as_ptr(), std::ptr::null());
                            if !progman.is_null() {
                                SetWindowLongPtrW(hwnd as _, GWLP_HWNDPARENT, progman as isize);
                            }
                        }
                    }
                }
            }

            let mut is_startup = false;
            #[cfg(target_os = "windows")]
            {
                use windows::ApplicationModel::Activation::ActivationKind;
                use windows::ApplicationModel::AppInstance;
                if let Ok(args) = AppInstance::GetActivatedEventArgs() {
                    if let Ok(kind) = args.Kind() {
                        if kind == ActivationKind::StartupTask {
                            is_startup = true;
                        }
                    }
                }
            }

            // Fallback heuristic for non-MSIX or legacy startup
            if !is_startup {
                is_startup = std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_lowercase().contains("system32"))
                    .unwrap_or(false);
            }

            if !is_startup {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i =
                tauri::menu::MenuItem::with_id(app, "show", "Show Main App", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("CP Companion")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Prevent app from exiting and just hide the window
                window.hide().unwrap();
                api.prevent_close();
            }

            // Restore the widget if it gets minimized (e.g., by "Show Desktop" or 3-finger swipe)
            if window.label() == "widget" {
                if let WindowEvent::Resized(_) = event {
                    if window.is_minimized().unwrap_or(false) {
                        let _ = window.unminimize();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            fetch_contests,
            get_cached_contests,
            open_main_app,
            get_api_config,
            save_api_config,
            get_theme,
            save_theme,
            get_available_platforms,
            check_for_updates,
            enable_autostart,
            disable_autostart,
            is_autostart_enabled,
            open_startup_settings,
            is_msix
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
