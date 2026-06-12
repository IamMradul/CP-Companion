mod database;
mod clist;

use database::{Contest, init_db, insert_contests, get_upcoming_contests, get_config, save_config};
use tauri::{State, Manager};
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use tauri::WindowEvent;
use std::sync::Mutex;
use rusqlite::Connection;
use tauri_plugin_autostart::MacosLauncher;

struct AppState {
    db: Mutex<Connection>,
}

#[tauri::command]
async fn fetch_contests(state: State<'_, AppState>) -> Result<Vec<Contest>, String> {
    let (api_key, username, platforms) = {
        let conn = state.db.lock().unwrap();
        match get_config(&conn) {
            Ok(Some(config)) => {
                if config.api_key.trim().is_empty() || config.username.trim().is_empty() {
                    return Err("API_KEY_MISSING".to_string());
                }
                (config.api_key, config.username, config.platforms)
            },
            _ => return Err("API_KEY_MISSING".to_string()),
        }
    };

    // 1. Fetch from Clist API
    match clist::fetch_contests(&api_key, &username, &platforms).await {
        Ok(contests) => {
            // 2. Save to SQLite Cache
            let conn = state.db.lock().unwrap();
            if let Err(e) = insert_contests(&conn, &contests) {
                eprintln!("Failed to cache contests: {}", e);
            }
            
            // 3. Return updated contests
            Ok(contests)
        }
        Err(e) => {
            eprintln!("Failed to fetch from Clist API: {}. Falling back to cache.", e);
            // Fallback to cache
            let conn = state.db.lock().unwrap();
            get_upcoming_contests(&conn).map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
fn get_cached_contests(state: State<'_, AppState>) -> Result<Vec<Contest>, String> {
    let conn = state.db.lock().unwrap();
    get_upcoming_contests(&conn).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiConfigResponse {
    username: String,
    api_key: String,
    platforms: Vec<String>,
}

#[tauri::command]
fn get_api_config(state: State<'_, AppState>) -> Result<Option<ApiConfigResponse>, String> {
    let conn = state.db.lock().unwrap();
    match get_config(&conn) {
        Ok(Some(config)) => Ok(Some(ApiConfigResponse {
            username: config.username,
            api_key: config.api_key,
            platforms: config.platforms.split(',').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect(),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_api_config(state: State<'_, AppState>, username: String, api_key: String, platforms: Vec<String>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let platforms_str = platforms.join(",");
    save_config(&conn, &username, &api_key, &platforms_str).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_available_platforms(state: State<'_, AppState>) -> Result<Vec<clist::ClistPlatform>, String> {
    let (api_key, username) = {
        let conn = state.db.lock().unwrap();
        match get_config(&conn) {
            Ok(Some(config)) => {
                if config.api_key.trim().is_empty() || config.username.trim().is_empty() {
                    return Err("API_KEY_MISSING".to_string());
                }
                (config.api_key, config.username)
            },
            _ => return Err("API_KEY_MISSING".to_string()),
        }
    };

    clist::fetch_available_platforms(&api_key, &username).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn open_main_app(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            let db_path = app_data_dir.join("cp_companion.db");
            
            let conn = init_db(&db_path).expect("Failed to initialize database");
            
            app.manage(AppState {
                db: Mutex::new(conn),
            });

            let args: Vec<String> = std::env::args().collect();
            let is_autostart = args.iter().any(|arg| arg == "--autostart");

            if !is_autostart {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = tauri::menu::MenuItem::with_id(app, "show", "Show Main App", true, None::<&str>)?;
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
                    TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } => {
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
        })
        .invoke_handler(tauri::generate_handler![fetch_contests, get_cached_contests, open_main_app, get_api_config, save_api_config, get_available_platforms])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

