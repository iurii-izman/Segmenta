use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Job status enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Pending,
    Running,
    Done,
    Error,
    Canceled,
}

/// Parameters for a transcription job (received from frontend)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobPayload {
    pub input_path: String,
    pub output_dir: String,
    pub output_base: String,
    pub formats: Vec<String>,
    pub model: String,
    pub device: String,
    pub compute_type: String,
    pub vad_filter: bool,
    pub beam_size: u32,
    pub language: String,
    pub word_timestamps: bool,
    pub threads: u32,
}

/// Progress data from the Python worker
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JobProgress {
    pub pct: f64,
    pub audio_done_sec: f64,
    pub audio_total_sec: f64,
    pub eta_sec: f64,
    pub rtf: f64,
    pub elapsed_sec: f64,
    pub segments_done: u64,
    pub segment_preview: String,
}

/// System/process stats
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JobStats {
    pub cpu_system: f32,
    pub ram_system_pct: f32,
    pub ram_system_used_mb: u64,
    pub ram_system_total_mb: u64,
    pub cpu_proc: f32,
    pub ram_proc_mb: u64,
}

/// Final result from a completed job
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct JobResult {
    pub outputs: Vec<String>,
    pub duration_sec: f64,
    pub elapsed_sec: f64,
    pub rtf: f64,
    pub segments: u64,
    pub chars: u64,
    pub words: u64,
    pub model: String,
    pub model_load_sec: f64,
    pub language_detected: String,
    pub language_probability: f64,
}

/// Full job state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub status: JobStatus,
    pub payload: JobPayload,
    pub progress: JobProgress,
    pub stats: JobStats,
    pub result: Option<JobResult>,
    pub error_message: Option<String>,
    pub stderr_tail: Vec<String>,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub pid: Option<u32>,
}

impl Job {
    pub fn new(id: String, payload: JobPayload) -> Self {
        Self {
            id,
            status: JobStatus::Pending,
            payload,
            progress: JobProgress::default(),
            stats: JobStats::default(),
            result: None,
            error_message: None,
            stderr_tail: Vec::new(),
            created_at: chrono::Local::now().to_rfc3339(),
            started_at: None,
            finished_at: None,
            pid: None,
        }
    }
}

/// Summary for listing jobs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobSummary {
    pub id: String,
    pub status: JobStatus,
    pub input_path: String,
    pub output_dir: String,
    pub output_base: String,
    pub model: String,
    pub progress_pct: f64,
    pub created_at: String,
    pub error_message: Option<String>,
}

impl From<&Job> for JobSummary {
    fn from(job: &Job) -> Self {
        Self {
            id: job.id.clone(),
            status: job.status.clone(),
            input_path: job.payload.input_path.clone(),
            output_dir: job.payload.output_dir.clone(),
            output_base: job.payload.output_base.clone(),
            model: job.payload.model.clone(),
            progress_pct: job.progress.pct,
            created_at: job.created_at.clone(),
            error_message: job.error_message.clone(),
        }
    }
}

/// Worker event from Python JSONL output
#[derive(Debug, Deserialize)]
pub struct WorkerEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    // Flattened fields — we parse specifically per type
    #[serde(flatten)]
    pub data: HashMap<String, serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_job_summary_from_job_roundtrip() {
        let payload = JobPayload {
            input_path: "/tmp/in.mp3".to_string(),
            output_dir: "/tmp/out".to_string(),
            output_base: "out".to_string(),
            formats: vec!["txt".to_string()],
            model: "small".to_string(),
            device: "cpu".to_string(),
            compute_type: "int8".to_string(),
            vad_filter: false,
            beam_size: 1,
            language: "ru".to_string(),
            word_timestamps: false,
            threads: 2,
        };
        let job = Job::new("test-id".to_string(), payload);
        let summary = JobSummary::from(&job);
        assert_eq!(summary.id, "test-id");
        assert_eq!(summary.input_path, "/tmp/in.mp3");
        assert_eq!(summary.output_dir, "/tmp/out");
        assert_eq!(summary.model, "small");
        assert_eq!(summary.progress_pct, 0.0);
    }
}
