use crate::job::{Job, JobPayload, JobStatus, JobSummary};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Job>>>>>,
    pub container_name: Arc<Mutex<String>>,
    pub venv_path: Arc<Mutex<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
            container_name: Arc::new(Mutex::new("asr".to_string())),
            venv_path: Arc::new(Mutex::new("~/.venvs/faster-whisper".to_string())),
        }
    }
}

/// Start a new transcription job
#[tauri::command]
pub async fn start_job(
    _app: AppHandle,
    state: State<'_, AppState>,
    payload: JobPayload,
) -> Result<String, String> {
    crate::validation::validate_payload(&payload)?;
    let job_id = uuid::Uuid::new_v4().to_string();
    tracing::info!(target: "transkribator::commands", "start_job id={} input={}", job_id, payload.input_path);
    let job = Job::new(job_id.clone(), payload);
    let job_arc = Arc::new(Mutex::new(job));

    {
        let mut jobs = state.jobs.lock();
        jobs.insert(job_id.clone(), job_arc.clone());
    }

    crate::store::save_jobs(&_app, state.jobs.clone());

    // Process is now started asynchronously by the background queue loop.
    Ok(job_id)
}

/// Cancel a running job
#[tauri::command]
pub async fn cancel_job(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> Result<(), String> {
    let jobs = state.jobs.lock();
    let job = jobs
        .get(&job_id)
        .ok_or_else(|| format!("Job not found: {}", job_id))?;

    let mut j = job.lock();
    if j.status == JobStatus::Running {
        j.status = JobStatus::Canceled;
        j.finished_at = Some(chrono::Local::now().to_rfc3339());

        // Kill the process
        if let Some(pid) = j.pid {
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .spawn();
            // Also try killing child processes (the Python process inside toolbx)
            let _ = std::process::Command::new("kill")
                .args(["-TERM", &(pid + 1).to_string()])
                .spawn();
        }

        crate::store::save_jobs(&app, state.jobs.clone());

        Ok(())
    } else {
        Err(format!("Job {} is not running (status: {:?})", job_id, j.status))
    }
}

/// List all jobs
#[tauri::command]
pub async fn list_jobs(state: State<'_, AppState>) -> Result<Vec<JobSummary>, String> {
    let jobs = state.jobs.lock();
    let mut summaries: Vec<JobSummary> = jobs
        .values()
        .map(|job| {
            let j = job.lock();
            JobSummary::from(&*j)
        })
        .collect();

    // Sort by created_at descending (newest first)
    summaries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(summaries)
}

/// Get full job details
#[tauri::command]
pub async fn get_job(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<serde_json::Value, String> {
    let jobs = state.jobs.lock();
    let job = jobs
        .get(&job_id)
        .ok_or_else(|| format!("Job not found: {}", job_id))?;
    let j = job.lock();
    serde_json::to_value(&*j).map_err(|e| e.to_string())
}

/// Remove all jobs that are done, error, or canceled
#[tauri::command]
pub async fn clear_completed_jobs(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let to_remove: Vec<String> = {
        let jobs = state.jobs.lock();
        jobs
            .iter()
            .filter(|(_, j)| {
                let s = j.lock().status;
                s == JobStatus::Done || s == JobStatus::Error || s == JobStatus::Canceled
            })
            .map(|(id, _)| id.clone())
            .collect()
    };
    let n = to_remove.len();
    if n > 0 {
        let mut jobs = state.jobs.lock();
        for id in to_remove {
            jobs.remove(&id);
        }
        drop(jobs);
        crate::store::save_jobs(&app, state.jobs.clone());
    }
    Ok(n as u32)
}

/// Remove a job from the list (only non-running jobs)
#[tauri::command]
pub async fn remove_job(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> Result<(), String> {
    let mut jobs = state.jobs.lock();
    if let Some(job) = jobs.get(&job_id) {
        let j = job.lock();
        if j.status == JobStatus::Running {
            return Err("Cannot remove a running job".to_string());
        }
    }
    jobs.remove(&job_id);
    drop(jobs); // release lock before saving
    crate::store::save_jobs(&app, state.jobs.clone());
    Ok(())
}

/// Retry a failed or canceled job by creating a new job with the same payload
#[tauri::command]
pub async fn retry_job(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> Result<String, String> {
    let payload = {
        let jobs = state.jobs.lock();
        let job = jobs
            .get(&job_id)
            .ok_or_else(|| format!("Job not found: {}", job_id))?;
        let j = job.lock();
        match &j.status {
            JobStatus::Error | JobStatus::Canceled => {}
            _ => return Err(format!("Can only retry error or canceled jobs (current: {:?})", j.status)),
        }
        j.payload.clone()
    };
    crate::validation::validate_payload(&payload)?;
    let new_id = uuid::Uuid::new_v4().to_string();
    let new_job = Job::new(new_id.clone(), payload);
    let new_job_arc = Arc::new(Mutex::new(new_job));
    {
        let mut jobs = state.jobs.lock();
        jobs.insert(new_id.clone(), new_job_arc);
    }
    crate::store::save_jobs(&app, state.jobs.clone());
    Ok(new_id)
}

/// Open a folder in the system file manager
#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    let resolved = crate::paths::resolve_for_toolbx(&path);
    std::process::Command::new("xdg-open")
        .arg(&resolved)
        .spawn()
        .map_err(|e| format!("Failed to open folder: {}", e))?;
    Ok(())
}

/// Update settings
#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    container_name: Option<String>,
    venv_path: Option<String>,
) -> Result<(), String> {
    if let Some(name) = container_name {
        *state.container_name.lock() = name;
    }
    if let Some(path) = venv_path {
        *state.venv_path.lock() = path;
    }
    Ok(())
}

/// Get current settings
#[tauri::command]
pub async fn get_settings(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "container_name": *state.container_name.lock(),
        "venv_path": *state.venv_path.lock(),
    }))
}

/// Collect allowed directory roots for read_file/save_file (app data dir + all job output_dirs)
fn allowed_path_roots(app: &AppHandle, state: &AppState) -> Vec<PathBuf> {
    let mut roots = vec![crate::store::get_app_data_dir(app)];
    let jobs = state.jobs.lock();
    for job in jobs.values() {
        let j = job.lock();
        let out = crate::paths::resolve_for_toolbx(&j.payload.output_dir);
        roots.push(PathBuf::from(out));
    }
    roots
}

/// Check that `resolved_path` is under one of the allowed roots (canonicalized where possible)
fn is_path_allowed(resolved_path: &str, allowed_roots: &[PathBuf]) -> bool {
    let path_buf = PathBuf::from(resolved_path);
    let canonical = path_buf.canonicalize().unwrap_or(path_buf.clone());
    for root in allowed_roots {
        let root_canonical = root.canonicalize().unwrap_or_else(|_| root.clone());
        if canonical.starts_with(&root_canonical) {
            return true;
        }
    }
    false
}

/// Read text from a local file. Path must be under app data dir or a job output_dir.
#[tauri::command]
pub async fn read_file(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<String, String> {
    let resolved = crate::paths::resolve_for_toolbx(&path);
    let roots = allowed_path_roots(&app, &state);
    if !is_path_allowed(&resolved, &roots) {
        return Err(serde_json::json!({ "error": "access_denied" }).to_string());
    }
    std::fs::read_to_string(&resolved).map_err(|e| format!("Failed to read file {}: {}", path, e))
}

/// Save text to a local file. Path must be under app data dir or a job output_dir.
#[tauri::command]
pub async fn save_file(app: AppHandle, state: State<'_, AppState>, path: String, content: String) -> Result<(), String> {
    let resolved = crate::paths::resolve_for_toolbx(&path);
    let roots = allowed_path_roots(&app, &state);
    if !is_path_allowed(&resolved, &roots) {
        return Err(serde_json::json!({ "error": "access_denied" }).to_string());
    }
    if let Some(parent) = Path::new(&resolved).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&resolved, content).map_err(|e| format!("Failed to save file {}: {}", path, e))
}

/// Helper to spawn background queue loop that processes pending jobs one by one.
pub fn start_queue_loop(app: AppHandle, state: AppState) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));

        let mut pending_job = None;
        {
            let jobs = state.jobs.lock();
            let mut is_running = false;
            let mut pended = Vec::new();

            for job in jobs.values() {
                let j = job.lock();
                if j.status == crate::job::JobStatus::Running {
                    is_running = true;
                    break;
                }
                if j.status == crate::job::JobStatus::Pending {
                    pended.push(job.clone());
                }
            }

            if !is_running && !pended.is_empty() {
                pended.sort_by(|a, b| {
                    a.lock().created_at.cmp(&b.lock().created_at)
                });
                pending_job = Some(pended[0].clone());
            }
        }

        if let Some(job_arc) = pending_job {
            let container = state.container_name.lock().clone();
            let venv = state.venv_path.lock().clone();
            
            crate::worker::spawn_worker(&app, job_arc, state.jobs.clone(), &container, &venv);
            
            // Allow state to register running before next tick
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
}
