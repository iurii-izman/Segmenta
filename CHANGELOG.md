# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- (Add new changes here before each release)

## [0.1.0] - 2025-03-03

### Added

- Desktop app for transcribing Russian (and other) audio/video via faster-whisper
- File picker and drag-and-drop for input files
- Multi-format export (TXT, SRT, VTT, JSON)
- Presets: Fast, Quality, Subtitles
- Real-time progress (ETA, RTF, speed)
- Live CPU/RAM monitoring charts
- Job queue with history, retry, cancel
- Model presets (base, small, medium, large-v3, distil-large-v3)
- Settings persisted between sessions (toolbx container, venv path, defaults)
- i18n (Russian, English) with language switcher in Settings
- Result viewer with edit and save
- Toast notifications on job completion/error
- Fedora Atomic compatibility (/home ↔ /var/home path resolution)

### Technical

- Tauri v2 + React + TypeScript frontend
- Rust backend with job store persistence (jobs.json)
- Python worker in toolbx container (fw_worker.py, exporters.py)
