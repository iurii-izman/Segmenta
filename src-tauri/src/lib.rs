mod commands;
mod job;
mod metrics;
mod paths;
mod store;
mod validation;
mod worker;

use commands::AppState;
use std::fs;
use std::path::PathBuf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = tracing_subscriber::EnvFilter::from_default_env()
        .add_directive("transkribator=info".parse().unwrap());

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(false)
        .without_time();

    #[cfg(not(debug_assertions))]
    let _file_guard = {
        let log_dir = std::env::var("HOME")
            .map(|h| PathBuf::from(h).join(".local/share/transkribator"))
            .unwrap_or_else(|_| PathBuf::from("/tmp/transkribator"));
        let _ = fs::create_dir_all(&log_dir);
        let log_file = log_dir.join("transkribator.log");
        if let Ok(file) = fs::OpenOptions::new().create(true).append(true).open(&log_file) {
            let (non_blocking, guard) = tracing_appender::non_blocking(file);
            let file_layer = tracing_subscriber::fmt::layer()
                .with_target(false)
                .without_time()
                .with_writer(non_blocking);
            let _ = tracing_subscriber::registry()
                .with(filter)
                .with(fmt_layer)
                .with(file_layer)
                .try_init();
            Some(guard)
        } else {
            let _ = tracing_subscriber::registry().with(filter).with(fmt_layer).try_init();
            None
        }
    };

    #[cfg(debug_assertions)]
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .try_init();

    let app_state = AppState::new();
    let jobs_arc = app_state.jobs.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
            commands::start_job,
            commands::cancel_job,
            commands::list_jobs,
            commands::get_job,
            commands::remove_job,
            commands::retry_job,
            commands::clear_completed_jobs,
            commands::open_folder,
            commands::update_settings,
            commands::get_settings,
            commands::read_file,
            commands::save_file,
        ])
        .setup(move |app| {
            // Load persistent jobs
            store::load_jobs(app.handle(), jobs_arc.clone());

            // Start the metrics polling loop
            metrics::start_metrics_poller(app.handle().clone(), jobs_arc);
            // Start the job queue loop
            commands::start_queue_loop(app.handle().clone(), app_state.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running transkribator application");
}
