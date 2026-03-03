# Contributing to Transkribator

Thank you for your interest in contributing. This document describes how to set up the development environment, run tests, build the project, and how the codebase is structured.

## Development environment

### Host (e.g. Fedora Atomic)

1. **Node.js** ≥ 18 and **npm**  
   Install via your distro or [nodejs.org](https://nodejs.org).

2. **Rust** and **Cargo**  
   Install from [rustup.rs](https://rustup.rs).

3. **Tauri v2 CLI**  
   ```bash
   cargo install tauri-cli --version "^2.0"
   ```

4. **System dependencies for Tauri (Linux)**  
   ```bash
   sudo dnf install webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel
   ```

### Toolbox container (for the Python worker)

Transcription runs inside a toolbox container with faster-whisper. Set it up once:

```bash
toolbox create -c asr
toolbox enter asr
python3 -m venv ~/.venvs/faster-whisper
source ~/.venvs/faster-whisper/bin/activate
pip install faster-whisper av
```

Configure the app (Settings tab) with container name `asr` and venv path `~/.venvs/faster-whisper`.

## Running the app (development)

```bash
cd /path/to/Segmenta
npm install
npm run tauri dev
```

The first run will compile Rust dependencies and may take a few minutes.

## Tests

### Frontend (Vitest + React Testing Library)

```bash
npm run test
```

Runs unit tests under `src/**/*.test.{ts,tsx}`. Watch mode: `npm run test:watch`.

### Backend (Rust)

```bash
cd src-tauri
cargo test
```

Tests live in `src-tauri/src/*.rs` under `#[cfg(test)] mod tests`.

### E2E (WebDriver)

Requires `tauri-driver` (`cargo install tauri-driver --locked`) and on Linux `webkit2gtk-driver` (e.g. `sudo apt install webkit2gtk-driver` or equivalent). From project root:

E2E runs optionally in CI (job `e2e`, `continue-on-error: true`) so a failing E2E run does not block the pipeline.

```bash
npm run e2e
```

This builds the app in debug mode (no bundle), starts tauri-driver, and runs WebdriverIO specs in `e2e-tests/specs/`.

## Build (production)

```bash
npm run tauri build
```

- Binary: `src-tauri/target/release/transkribator`
- With bundling: `src-tauri/target/release/bundle/` (e.g. AppImage on Linux)

In **release** builds, the backend also writes logs to a file: `~/.local/share/transkribator/transkribator.log` (or `/tmp/transkribator/transkribator.log` if `HOME` is not set).

## Project structure and architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture (diagram, data flow, commands and events).

- **Frontend** (`src/`): React + TypeScript, Vite. Three tabs (New Task, Queue, Settings). State in `stores/jobStore.tsx` (Context + useReducer). Tauri is used via `invoke()` for commands and `listen()` for events.

- **Backend** (`src-tauri/src/`): Rust. Tauri commands in `commands.rs` (start_job, cancel_job, list_jobs, get_job, remove_job, retry_job, open_folder, read_file, save_file, settings). Job queue loop runs in a background thread and spawns one Python worker per job. Persistence in `store.rs` (jobs.json in app data dir). Validation in `validation.rs`.

- **Worker** (`python/`): Runs inside the toolbox container. `fw_worker.py` reads audio/video, runs faster-whisper, emits JSONL events (progress, done, error, warning) on stdout. Rust `worker.rs` parses JSONL and forwards events to the frontend via Tauri `emit()`.

- **Data flow**: User adds a task → `start_job` → job enqueued → queue loop spawns `toolbox run -c asr -- ... fw_worker.py ...` → worker writes JSONL to stdout → Rust reads lines, updates job state, emits `job:progress`, `job:done`, etc. → frontend updates UI and store.

For the full directory tree, see [README.md](README.md#структура-проекта).

**.gitignore** in the project root excludes `node_modules/`, `dist/`, `src-tauri/target/`, `.env`, logs, and IDE files so that build artifacts and secrets are not committed.

## Release process

See [docs/RELEASE.md](docs/RELEASE.md) for the full flow (creating the repo, first push, and releasing Alpha 1 or any version).

For each release: bump version in `package.json` and `src-tauri/tauri.conf.json`; update CHANGELOG.md; commit, then `git tag vX.Y.Z` and `git push origin vX.Y.Z`. The [release workflow](.github/workflows/release.yml) builds the app and attaches artifacts to the GitHub Release.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
