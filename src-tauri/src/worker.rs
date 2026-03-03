use crate::job::{Job, JobProgress, JobResult, JobStatus, WorkerEvent};
use crate::paths;
use serde_json::Value;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

const STDERR_RING_SIZE: usize = 200;

/// Spawns the Python worker inside toolbx and processes its output.
pub fn spawn_worker(
    app: &AppHandle,
    job: Arc<Mutex<Job>>,
    jobs: Arc<Mutex<std::collections::HashMap<String, Arc<Mutex<Job>>>>>,
    container_name: &str,
    venv_path: &str,
) {
    let app = app.clone();
    let container_name = container_name.to_string();
    let venv_path = venv_path.to_string();

    std::thread::spawn(move || {
        tracing::info!(target: "transkribator::worker", "spawning job in container {}", container_name);
        let (payload, job_id) = {
            let j = job.lock();
            (j.payload.clone(), j.id.clone())
        };

        // Build worker command args
        let python_bin = paths::venv_python(&venv_path);
        let worker_script = paths::worker_script_path();
        let python_dir = paths::python_module_dir();

        // Resolve input path
        let input_resolved = paths::resolve_for_toolbx(&payload.input_path);
        let output_dir_resolved = paths::resolve_for_toolbx(&payload.output_dir);

        // Build the Python command as a single string for bash -lc
        // We need bash -lc because toolbox run doesn't set up PATH properly
        let formats_str = payload.formats.join(",");

        let mut py_args = vec![
            python_bin.clone(),
            worker_script.clone(),
            "--input".to_string(),
            input_resolved.clone(),
            "--output-dir".to_string(),
            output_dir_resolved.clone(),
            "--output-base".to_string(),
            payload.output_base.clone(),
            "--formats".to_string(),
            formats_str,
            "--model".to_string(),
            payload.model.clone(),
            "--device".to_string(),
            payload.device.clone(),
            "--compute-type".to_string(),
            payload.compute_type.clone(),
            "--beam-size".to_string(),
            payload.beam_size.to_string(),
            "--language".to_string(),
            payload.language.clone(),
            "--threads".to_string(),
            payload.threads.to_string(),
        ];
        if payload.vad_filter {
            py_args.push("--vad".to_string());
        }
        if payload.word_timestamps {
            py_args.push("--word-timestamps".to_string());
        }

        // Build shell command with PYTHONPATH set
        let shell_cmd = format!(
            "PYTHONPATH={} {} {}",
            shell_escape(&python_dir),
            shell_escape(&python_bin),
            py_args[2..].iter().map(|a| shell_escape(a)).collect::<Vec<_>>().join(" ")
        );

        // Spawn: toolbox run -c <container> -- bash -lc '<command>'
        let child_result = Command::new("toolbox")
            .args(["run", "-c", &container_name, "--", "bash", "-lc", &shell_cmd])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child: Child = match child_result {
            Ok(c) => c,
            Err(e) => {
                let mut j = job.lock();
                j.status = JobStatus::Error;
                j.error_message = Some(format!("Failed to spawn worker: {}", e));
                j.finished_at = Some(chrono::Local::now().to_rfc3339());
                let _ = app.emit("job:error", serde_json::json!({
                    "job_id": job_id,
                    "message": j.error_message.as_ref().unwrap(),
                    "stderr_tail": ""
                }));
                return;
            }
        };

        let pid = child.id();
        {
            let mut j = job.lock();
            j.status = JobStatus::Running;
            j.pid = Some(pid);
            j.started_at = Some(chrono::Local::now().to_rfc3339());
        }

        let _ = app.emit("job:started", serde_json::json!({
            "job_id": job_id,
            "pid": pid
        }));

        // Read stderr in background thread
        let stderr = child.stderr.take();
        let stderr_buf: Arc<Mutex<VecDeque<String>>> =
            Arc::new(Mutex::new(VecDeque::with_capacity(STDERR_RING_SIZE)));
        let stderr_buf_clone = stderr_buf.clone();

        let stderr_thread = if let Some(stderr) = stderr {
            Some(std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let mut buf = stderr_buf_clone.lock();
                        if buf.len() >= STDERR_RING_SIZE {
                            buf.pop_front();
                        }
                        buf.push_back(line);
                    }
                }
            }))
        } else {
            None
        };

        // Read stdout line by line — parse JSONL
        let stdout = child.stdout.take();
        if let Some(stdout) = stdout {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let line = match line {
                    Ok(l) => l,
                    Err(_) => continue,
                };

                // Check if job was canceled
                {
                    let j = job.lock();
                    if j.status == JobStatus::Canceled {
                        let _ = child.kill();
                        break;
                    }
                }

                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }

                // Try to parse as JSON
                let event: WorkerEvent = match serde_json::from_str(trimmed) {
                    Ok(e) => e,
                    Err(_) => {
                        // Non-JSON line — add to stderr ring buffer
                        let mut buf = stderr_buf.lock();
                        if buf.len() >= STDERR_RING_SIZE {
                            buf.pop_front();
                        }
                        buf.push_back(line);
                        continue;
                    }
                };

                match event.event_type.as_str() {
                    "init" => {
                        let total = event.data.get("audio_total_sec")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        let mut j = job.lock();
                        j.progress.audio_total_sec = total;
                    }
                    "progress" => {
                        let progress = JobProgress {
                            pct: event.data.get("pct").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            audio_done_sec: event.data.get("audio_done_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            audio_total_sec: event.data.get("audio_total_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            eta_sec: event.data.get("eta_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            rtf: event.data.get("rtf").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            elapsed_sec: event.data.get("elapsed_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            segments_done: event.data.get("segments_done").and_then(|v| v.as_u64()).unwrap_or(0),
                            segment_preview: event.data.get("segment_preview").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        };
                        {
                            let mut j = job.lock();
                            j.progress = progress.clone();
                        }
                        let _ = app.emit("job:progress", serde_json::json!({
                            "job_id": job_id,
                            "pct": progress.pct,
                            "audio_done_sec": progress.audio_done_sec,
                            "audio_total_sec": progress.audio_total_sec,
                            "eta_sec": progress.eta_sec,
                            "rtf": progress.rtf,
                            "elapsed_sec": progress.elapsed_sec,
                            "segments_done": progress.segments_done,
                            "segment_preview": progress.segment_preview
                        }));
                    }
                    "done" => {
                        let outputs: Vec<String> = event.data.get("outputs")
                            .and_then(|v| serde_json::from_value(v.clone()).ok())
                            .unwrap_or_default();

                        let stats = event.data.get("stats").cloned().unwrap_or(Value::Null);

                        let result = JobResult {
                            outputs: outputs.clone(),
                            duration_sec: stats.get("duration_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            elapsed_sec: stats.get("elapsed_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            rtf: stats.get("rtf").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            segments: stats.get("segments").and_then(|v| v.as_u64()).unwrap_or(0),
                            chars: stats.get("chars").and_then(|v| v.as_u64()).unwrap_or(0),
                            words: stats.get("words").and_then(|v| v.as_u64()).unwrap_or(0),
                            model: stats.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            model_load_sec: stats.get("model_load_sec").and_then(|v| v.as_f64()).unwrap_or(0.0),
                            language_detected: stats.get("language_detected").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                            language_probability: stats.get("language_probability").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        };
                        {
                            let mut j = job.lock();
                            j.status = JobStatus::Done;
                            j.progress.pct = 100.0;
                            j.result = Some(result.clone());
                            j.finished_at = Some(chrono::Local::now().to_rfc3339());
                        }
                        let _ = app.emit("job:done", serde_json::json!({
                            "job_id": job_id,
                            "outputs": outputs,
                            "stats": stats
                        }));
                    }
                    "error" => {
                        let msg = event.data.get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error")
                            .to_string();
                        let details = event.data.get("details")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        {
                            let mut j = job.lock();
                            j.status = JobStatus::Error;
                            j.error_message = Some(format!("{}: {}", msg, details));
                            j.finished_at = Some(chrono::Local::now().to_rfc3339());
                        }
                        let stderr_tail: Vec<String> = stderr_buf.lock().iter().cloned().collect();
                        let _ = app.emit("job:error", serde_json::json!({
                            "job_id": job_id,
                            "message": msg,
                            "details": details,
                            "stderr_tail": stderr_tail.join("\n")
                        }));
                    }
                    "warning" => {
                        let msg = event.data.get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Warning")
                            .to_string();
                        eprintln!("[worker] job {} warning: {}", job_id, msg);
                        let _ = app.emit("job:warning", serde_json::json!({
                            "job_id": job_id,
                            "message": msg
                        }));
                    }
                    "status" => {
                        let msg = event.data.get("message")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let _ = app.emit("job:status", serde_json::json!({
                            "job_id": job_id,
                            "message": msg
                        }));
                    }
                    _ => {}
                }
            }
        }

        // Wait for process to finish
        let exit_status = child.wait();

        // Wait for stderr thread
        if let Some(t) = stderr_thread {
            let _ = t.join();
        }

        // Store stderr tail
        {
            let mut j = job.lock();
            j.stderr_tail = stderr_buf.lock().iter().cloned().collect();

            // If process exited with error and we haven't already set error status
            if j.status == JobStatus::Running {
                match exit_status {
                    Ok(s) if s.success() => {
                        // If we never got a "done" event, mark as done anyway
                        if j.status == JobStatus::Running {
                            j.status = JobStatus::Done;
                            j.finished_at = Some(chrono::Local::now().to_rfc3339());
                        }
                    }
                    Ok(s) => {
                        j.status = JobStatus::Error;
                        j.error_message = Some(format!(
                            "Worker exited with code {}",
                            s.code().unwrap_or(-1)
                        ));
                        j.finished_at = Some(chrono::Local::now().to_rfc3339());
                        let stderr_tail = j.stderr_tail.join("\n");
                        let _ = app.emit("job:error", serde_json::json!({
                            "job_id": j.id,
                            "message": j.error_message.as_ref().unwrap(),
                            "stderr_tail": stderr_tail
                        }));
                    }
                    Err(e) => {
                        j.status = JobStatus::Error;
                        j.error_message = Some(format!("Failed to wait for worker: {}", e));
                        j.finished_at = Some(chrono::Local::now().to_rfc3339());
                    }
                }
            }
        }
        
        // Save state at the very end
        crate::store::save_jobs(&app, jobs.clone());
        tracing::info!(target: "transkribator::worker", "job {} finished", job_id);
    });
}

/// Escape a string for safe shell usage
fn shell_escape(s: &str) -> String {
    if s.is_empty() {
        return "''".to_string();
    }
    // Use single quotes, escaping embedded single quotes
    format!("'{}'", s.replace('\'', "'\\''"))
}
