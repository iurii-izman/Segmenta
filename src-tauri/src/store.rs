use std::path::PathBuf;
use tauri::Manager;
use std::fs;
use std::io;
use std::sync::Arc;
use parking_lot::Mutex;
use std::collections::HashMap;
use crate::job::{Job, JobStatus};

const JOBS_FILENAME: &str = "jobs.json";
const SAVE_RETRIES: u32 = 2;
const STORE_VERSION: u32 = 1;

#[derive(serde::Serialize, serde::Deserialize)]
struct StoreFile {
    version: u32,
    jobs: Vec<Job>,
}

fn log_store_error(msg: &str) {
    tracing::error!(target: "transkribator::store", "{}", msg);
}

/// Get the app data directory (e.g. for path allowlist)
pub fn get_app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap_or_else(|_| {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home/user".to_string());
        PathBuf::from(home).join(".local/share/transkribator")
    })
}

/// Get the path to the app's persistent jobs file
fn get_jobs_file_path(app: &tauri::AppHandle) -> PathBuf {
    let app_dir = get_app_data_dir(app);
    if !app_dir.exists() {
        let _ = fs::create_dir_all(&app_dir);
    }
    app_dir.join(JOBS_FILENAME)
}

/// Load jobs from the persistent json file. On parse error or read error, falls back to empty.
pub fn load_jobs(app: &tauri::AppHandle, jobs_map: Arc<Mutex<HashMap<String, Arc<Mutex<Job>>>>>) {
    let file_path = get_jobs_file_path(app);
    if !file_path.exists() {
        return;
    }

    let content = match fs::read_to_string(&file_path) {
        Ok(c) => c,
        Err(e) => {
            log_store_error(&format!("Failed to read jobs file: {}", e));
            return;
        }
    };

    let saved_jobs: Vec<Job> = match serde_json::from_str::<StoreFile>(&content) {
        Ok(store) => {
            if store.version > STORE_VERSION {
                log_store_error(&format!("jobs.json version {} is newer than supported ({}), using empty list", store.version, STORE_VERSION));
                return;
            }
            store.jobs
        }
        Err(_) => {
            // Legacy: file may be a bare array
            match serde_json::from_str::<Vec<Job>>(&content) {
                Ok(jobs) => jobs,
                Err(e) => {
                    log_store_error(&format!("Invalid jobs.json, using empty list: {}", e));
                    return;
                }
            }
        }
    };

    let mut map = jobs_map.lock();
    for mut job in saved_jobs {
        if job.status == JobStatus::Running || job.status == JobStatus::Pending {
            job.status = JobStatus::Error;
            job.error_message = Some("Job was interrupted by app restart.".to_string());
            job.finished_at = Some(chrono::Local::now().to_rfc3339());
        }
        map.insert(job.id.clone(), Arc::new(Mutex::new(job)));
    }
}

/// Save current jobs state to persistent json file. Uses atomic write (temp file + rename) and retries.
pub fn save_jobs(app: &tauri::AppHandle, jobs_map: Arc<Mutex<HashMap<String, Arc<Mutex<Job>>>>>) {
    let file_path = get_jobs_file_path(app);
    let dir = file_path.parent().map(PathBuf::from).unwrap_or_else(PathBuf::new);
    let tmp_path = dir.join(format!(".{}.tmp", JOBS_FILENAME));

    let jobs_snapshot: Vec<Job> = {
        let map = jobs_map.lock();
        map.values().map(|j| j.lock().clone()).collect()
    };

    let store = StoreFile {
        version: STORE_VERSION,
        jobs: jobs_snapshot,
    };

    let json = match serde_json::to_string_pretty(&store) {
        Ok(j) => j,
        Err(e) => {
            log_store_error(&format!("Failed to serialize jobs: {}", e));
            return;
        }
    };

    for attempt in 0..=SAVE_RETRIES {
        let result = fs::write(&tmp_path, &json).and_then(|()| {
            fs::rename(&tmp_path, &file_path).map_err(|e| io::Error::new(e.kind(), e))
        });
        match result {
            Ok(()) => return,
            Err(e) => {
                if attempt == SAVE_RETRIES {
                    log_store_error(&format!("Failed to save jobs after {} attempts: {}", SAVE_RETRIES + 1, e));
                }
                let _ = fs::remove_file(&tmp_path);
            }
        }
    }
}
