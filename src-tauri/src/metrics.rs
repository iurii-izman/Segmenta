use crate::job::{Job, JobStats, JobStatus};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use sysinfo::{Pid, System};
use tauri::{AppHandle, Emitter};

/// Starts a background thread that polls CPU/RAM metrics every second
/// for all running jobs and emits job:stats events.
pub fn start_metrics_poller(
    app: AppHandle,
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Job>>>>>,
) {
    thread::spawn(move || {
        let mut sys = System::new_all();
        loop {
            thread::sleep(Duration::from_secs(1));

            sys.refresh_all();

            let jobs_snapshot: Vec<(String, Option<u32>)> = {
                let jobs = jobs.lock();
                jobs.iter()
                    .filter_map(|(id, job)| {
                        let j = job.lock();
                        if j.status == JobStatus::Running {
                            Some((id.clone(), j.pid))
                        } else {
                            None
                        }
                    })
                    .collect()
            };

            if jobs_snapshot.is_empty() {
                continue;
            }

            // System-wide metrics
            let cpu_system = sys.global_cpu_usage();
            let ram_total = sys.total_memory() / (1024 * 1024); // MB
            let ram_used = sys.used_memory() / (1024 * 1024); // MB
            let ram_pct = if ram_total > 0 {
                (ram_used as f32 / ram_total as f32) * 100.0
            } else {
                0.0
            };

            for (job_id, pid) in &jobs_snapshot {
                let (cpu_proc, ram_proc_mb) = if let Some(pid) = pid {
                    let pid = Pid::from_u32(*pid);
                    if let Some(proc_info) = sys.process(pid) {
                        (
                            proc_info.cpu_usage(),
                            proc_info.memory() / (1024 * 1024),
                        )
                    } else {
                        (0.0, 0)
                    }
                } else {
                    (0.0, 0)
                };

                let stats = JobStats {
                    cpu_system,
                    ram_system_pct: ram_pct,
                    ram_system_used_mb: ram_used,
                    ram_system_total_mb: ram_total,
                    cpu_proc,
                    ram_proc_mb,
                };

                // Update job stats
                {
                    let jobs = jobs.lock();
                    if let Some(job) = jobs.get(job_id) {
                        let mut j = job.lock();
                        j.stats = stats.clone();
                    }
                }

                let _ = app.emit(
                    "job:stats",
                    serde_json::json!({
                        "job_id": job_id,
                        "cpu_system": stats.cpu_system,
                        "ram_system_pct": stats.ram_system_pct,
                        "ram_system_used_mb": stats.ram_system_used_mb,
                        "ram_system_total_mb": stats.ram_system_total_mb,
                        "cpu_proc": stats.cpu_proc,
                        "ram_proc_mb": stats.ram_proc_mb,
                    }),
                );
            }
        }
    });
}
