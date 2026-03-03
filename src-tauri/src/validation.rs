//! Shared validation constants and helpers for job payloads.
//! Keeps allowed formats and models in one place (aligned with frontend).

pub const ALLOWED_FORMATS: &[&str] = &["txt", "srt", "vtt", "json"];
pub const ALLOWED_MODELS: &[&str] = &["base", "small", "medium", "large-v3", "distil-large-v3"];
pub const BEAM_SIZE_MIN: u32 = 1;
pub const BEAM_SIZE_MAX: u32 = 10;
pub const THREADS_MIN: u32 = 1;
pub const THREADS_MAX: u32 = 64;

use crate::job::JobPayload;
use std::collections::HashMap;

/// Validation error as code + params for frontend i18n
pub fn validate_payload(p: &JobPayload) -> Result<(), String> {
    if p.input_path.trim().is_empty() {
        return Err(validation_error("inputPathRequired"));
    }
    if p.output_dir.trim().is_empty() {
        return Err(validation_error("outputDirRequired"));
    }
    if p.formats.is_empty() {
        return Err(validation_error("oneFormatRequired"));
    }
    for f in &p.formats {
        if !ALLOWED_FORMATS.contains(&f.as_str()) {
            let mut params = HashMap::new();
            params.insert("format".to_string(), f.clone());
            return Err(validation_error_with("invalidFormat", params));
        }
    }
    if !ALLOWED_MODELS.contains(&p.model.as_str()) {
        let mut params = HashMap::new();
        params.insert("model".to_string(), p.model.clone());
        return Err(validation_error_with("invalidModel", params));
    }
    if p.beam_size < BEAM_SIZE_MIN || p.beam_size > BEAM_SIZE_MAX {
        let mut params = HashMap::new();
        params.insert("min".to_string(), BEAM_SIZE_MIN.to_string());
        params.insert("max".to_string(), BEAM_SIZE_MAX.to_string());
        return Err(validation_error_with("beamSizeRange", params));
    }
    if p.threads < THREADS_MIN || p.threads > THREADS_MAX {
        let mut params = HashMap::new();
        params.insert("min".to_string(), THREADS_MIN.to_string());
        params.insert("max".to_string(), THREADS_MAX.to_string());
        return Err(validation_error_with("threadsRange", params));
    }
    Ok(())
}

fn validation_error(code: &str) -> String {
    serde_json::json!({ "validation": true, "code": code }).to_string()
}

fn validation_error_with(code: &str, params: HashMap<String, String>) -> String {
    let params_obj: std::collections::HashMap<String, serde_json::Value> = params
        .into_iter()
        .map(|(k, v)| (k, serde_json::Value::String(v)))
        .collect();
    serde_json::json!({ "validation": true, "code": code, "params": params_obj }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::job::JobPayload;

    fn valid_payload() -> JobPayload {
        JobPayload {
            input_path: "/tmp/input.mp3".to_string(),
            output_dir: "/tmp/out".to_string(),
            output_base: "out".to_string(),
            formats: vec!["txt".to_string(), "srt".to_string()],
            model: "small".to_string(),
            device: "cpu".to_string(),
            compute_type: "int8".to_string(),
            vad_filter: true,
            beam_size: 5,
            language: "ru".to_string(),
            word_timestamps: false,
            threads: 4,
        }
    }

    #[test]
    fn test_validate_payload_ok() {
        assert!(validate_payload(&valid_payload()).is_ok());
    }

    #[test]
    fn test_validate_payload_empty_input_path() {
        let mut p = valid_payload();
        p.input_path = "".to_string();
        let err = validate_payload(&p).unwrap_err();
        let o: serde_json::Value = serde_json::from_str(&err).unwrap();
        assert_eq!(o.get("code").and_then(|v| v.as_str()), Some("inputPathRequired"));
    }

    #[test]
    fn test_validate_payload_empty_output_dir() {
        let mut p = valid_payload();
        p.output_dir = "   ".to_string();
        assert!(validate_payload(&p).is_err());
    }

    #[test]
    fn test_validate_payload_empty_formats() {
        let mut p = valid_payload();
        p.formats = vec![];
        assert!(validate_payload(&p).is_err());
    }

    #[test]
    fn test_validate_payload_invalid_format() {
        let mut p = valid_payload();
        p.formats = vec!["pdf".to_string()];
        assert!(validate_payload(&p).is_err());
    }

    #[test]
    fn test_validate_payload_invalid_model() {
        let mut p = valid_payload();
        p.model = "gpt-4".to_string();
        assert!(validate_payload(&p).is_err());
    }

    #[test]
    fn test_validate_payload_beam_size_out_of_range() {
        let mut p = valid_payload();
        p.beam_size = 0;
        assert!(validate_payload(&p).is_err());
        p.beam_size = 99;
        assert!(validate_payload(&p).is_err());
    }

    #[test]
    fn test_validate_payload_threads_out_of_range() {
        let mut p = valid_payload();
        p.threads = 0;
        assert!(validate_payload(&p).is_err());
        p.threads = 100;
        assert!(validate_payload(&p).is_err());
    }
}
