mod temps;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State,
};
use temps::{ComponentInfo, TempReader, Temps};

struct AppState {
    reader: TempReader,
}

struct AlwaysOnTopItem(CheckMenuItem<tauri::Wry>);

#[tauri::command]
fn get_temps(state: State<AppState>) -> Temps {
    state.reader.read()
}

/// Debug: sensor labels seen on this machine
#[tauri::command]
fn get_component_labels(state: State<AppState>) -> Vec<ComponentInfo> {
    state.reader.component_labels()
}

/// Debug: errors encountered while setting up WMI connections
#[tauri::command]
fn get_sensor_errors(state: State<AppState>) -> Vec<String> {
    state.reader.debug_errors()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let show = MenuItem::with_id(app, "show", "Mostra", true, None::<&str>)?;
            let aot = CheckMenuItem::with_id(app, "always_on_top", "Sempre in primo piano", true, false, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Esci", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &aot, &sep, &quit])?;

            app.manage(AlwaysOnTopItem(aot));

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "always_on_top" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let is_aot = win.is_always_on_top().unwrap_or(false);
                            let _ = win.set_always_on_top(!is_aot);
                            let item = app.state::<AlwaysOnTopItem>();
                            let _ = item.0.set_checked(!is_aot);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .manage(AppState {
            reader: TempReader::new(),
        })
        .invoke_handler(tauri::generate_handler![get_temps, get_component_labels, get_sensor_errors])
        .run(tauri::generate_context!())
        .expect("error while running fervent");
}
