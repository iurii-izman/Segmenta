#!/usr/bin/env python3
"""
fw_worker.py — JSONL-emitting transcription worker for Transkribator.

Runs inside a toolbx container with faster-whisper installed.
Communicates progress to the Rust backend via JSONL on stdout.
Never prints transcript text to stdout — only structured JSON events.
"""

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

# ── helpers ──────────────────────────────────────────────────────────────────


def emit(event: dict):
    """Write a single JSON line to stdout and flush immediately."""
    print(json.dumps(event, ensure_ascii=False), flush=True)


def emit_error(message: str, details: str = "", include_traceback: bool = False):
    """Emit a fatal error event and exit. If include_traceback is True, append traceback to details."""
    if include_traceback:
        details = (details + "\n\n" + traceback.format_exc()).strip()
    emit({"type": "error", "message": message, "details": details})
    sys.exit(1)


def get_audio_duration(path: str) -> float:
    """Get audio duration in seconds using PyAV (already a dependency of faster-whisper)."""
    try:
        import av

        container = av.open(path)
        duration = float(container.duration) / av.time_base if container.duration else 0
        # av.time_base is 1_000_000 (microseconds)
        if container.duration:
            duration = container.duration / 1_000_000.0
        else:
            # Fallback: decode to find duration
            duration = 0
            for stream in container.streams:
                if stream.duration and stream.time_base:
                    d = float(stream.duration * stream.time_base)
                    duration = max(duration, d)
        container.close()
        return duration
    except Exception as e:
        # If PyAV fails, return 0 — we'll still work, just no accurate ETA
        emit({"type": "warning", "message": f"Could not determine audio duration: {e}"})
        return 0


def resolve_path(path: str) -> str:
    """
    Resolve path for toolbx compatibility.
    /var/home/user/... <-> /home/user/...
    """
    p = Path(path)
    if p.exists():
        return str(p.resolve())

    # Try /var/home <-> /home swap
    s = str(p)
    if s.startswith("/var/home/"):
        alt = "/home/" + s[len("/var/home/"):]
    elif s.startswith("/home/"):
        alt = "/var/home/" + s[len("/home/"):]
    else:
        return s

    alt_p = Path(alt)
    if alt_p.exists():
        return str(alt_p.resolve())

    return s  # Return original, let the caller handle the error


# ── main ─────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Transkribator worker — transcribe audio/video via faster-whisper"
    )
    parser.add_argument("--input", required=True, help="Input media file path")
    parser.add_argument("--output-dir", required=True, help="Output directory")
    parser.add_argument("--output-base", required=True, help="Output base filename (no extension)")
    parser.add_argument(
        "--formats",
        default="txt,srt,vtt,json",
        help="Comma-separated output formats: txt,srt,vtt,json",
    )
    parser.add_argument(
        "--model",
        default="small",
        choices=["base", "small", "medium", "large-v3", "distil-large-v3"],
        help="Whisper model size",
    )
    parser.add_argument("--device", default="cpu", help="Device: cpu or cuda")
    parser.add_argument("--compute-type", default="int8", help="Compute type: int8, float16, etc.")
    parser.add_argument("--vad", action="store_true", help="Enable VAD filter")
    parser.add_argument("--beam-size", type=int, default=5, help="Beam search size")
    parser.add_argument(
        "--language", default="ru", help="Language code: ru, auto, en, etc."
    )
    parser.add_argument(
        "--word-timestamps", action="store_true", help="Enable word-level timestamps"
    )
    parser.add_argument(
        "--threads", type=int, default=4, help="Number of CPU threads (OMP_NUM_THREADS)"
    )
    args = parser.parse_args()

    # Set thread count before importing anything heavy
    os.environ["OMP_NUM_THREADS"] = str(args.threads)
    os.environ["MKL_NUM_THREADS"] = str(args.threads)

    # Resolve paths
    input_path = resolve_path(args.input)
    output_dir = resolve_path(args.output_dir)

    # Validate input
    if not os.path.isfile(input_path):
        emit_error(
            f"Input file not found: {args.input}",
            f"Resolved path: {input_path}. "
            "Hint: on Fedora Atomic, /home may be a symlink to /var/home. "
            "Try using the full /var/home/... path.",
        )

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Get audio duration for progress
    audio_total_sec = get_audio_duration(input_path)

    # Parse formats
    formats = [f.strip().lower() for f in args.formats.split(",") if f.strip()]

    # Emit init event
    emit(
        {
            "type": "init",
            "audio_total_sec": round(audio_total_sec, 2),
            "model": args.model,
            "params": {
                "device": args.device,
                "compute_type": args.compute_type,
                "vad_filter": args.vad,
                "beam_size": args.beam_size,
                "language": args.language,
                "word_timestamps": args.word_timestamps,
                "threads": args.threads,
            },
        }
    )

    # Import and load model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        emit_error(
            "faster-whisper is not installed",
            "Make sure faster-whisper is installed in the venv: "
            "pip install faster-whisper",
        )

    emit({"type": "status", "message": f"Loading model '{args.model}'..."})
    t_model_start = time.time()

    try:
        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type,
            cpu_threads=args.threads,
        )
    except Exception as e:
        emit_error(f"Failed to load model '{args.model}'", str(e), include_traceback=True)

    t_model_end = time.time()
    emit(
        {
            "type": "status",
            "message": f"Model loaded in {t_model_end - t_model_start:.1f}s",
        }
    )

    # Transcribe
    emit({"type": "status", "message": "Starting transcription..."})
    t_start = time.time()

    lang_arg = None if args.language == "auto" else args.language

    try:
        segments_gen, info = model.transcribe(
            input_path,
            beam_size=args.beam_size,
            language=lang_arg,
            vad_filter=args.vad,
            word_timestamps=args.word_timestamps,
        )
    except Exception as e:
        emit_error("Transcription failed to start", str(e), include_traceback=True)

    emit(
        {
            "type": "status",
            "message": f"Detected language: {info.language} (p={info.language_probability:.2f})",
        }
    )

    # Collect segments with progress
    all_segments = []
    last_progress_time = 0

    for seg in segments_gen:
        seg_dict = {
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text,
        }
        # Include word-level timestamps if available
        if args.word_timestamps and hasattr(seg, "words") and seg.words:
            seg_dict["words"] = [
                {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word}
                for w in seg.words
            ]
        all_segments.append(seg_dict)

        # Emit progress (throttle to max once per 0.5s to avoid flooding)
        now = time.time()
        if now - last_progress_time >= 0.5:
            elapsed = now - t_start
            audio_done = seg.end

            pct = (audio_done / audio_total_sec * 100) if audio_total_sec > 0 else 0
            rtf = elapsed / audio_done if audio_done > 0 else 0
            eta_sec = (audio_total_sec - audio_done) * rtf if audio_done > 0 and audio_total_sec > 0 else 0

            # Short preview of current segment (max 80 chars)
            preview = seg.text.strip()[:80]

            emit(
                {
                    "type": "progress",
                    "audio_done_sec": round(audio_done, 2),
                    "audio_total_sec": round(audio_total_sec, 2),
                    "pct": round(min(pct, 100), 1),
                    "rtf": round(rtf, 2),
                    "eta_sec": round(max(eta_sec, 0), 1),
                    "elapsed_sec": round(elapsed, 1),
                    "segments_done": len(all_segments),
                    "segment_preview": preview,
                }
            )
            last_progress_time = now

    t_end = time.time()
    total_elapsed = t_end - t_start

    # Export results
    from exporters import export_txt, export_srt, export_vtt, export_json

    output_base = os.path.join(output_dir, args.output_base)
    outputs = []

    if "txt" in formats:
        p = export_txt(all_segments, output_base + ".txt")
        outputs.append(p)

    if "srt" in formats:
        p = export_srt(all_segments, output_base + ".srt")
        outputs.append(p)

    if "vtt" in formats:
        p = export_vtt(all_segments, output_base + ".vtt")
        outputs.append(p)

    if "json" in formats:
        p = export_json(all_segments, output_base + ".json")
        outputs.append(p)

    # Calculate stats
    total_chars = sum(len(s["text"]) for s in all_segments)
    total_words = sum(len(s["text"].split()) for s in all_segments)
    audio_end = all_segments[-1]["end"] if all_segments else 0
    final_rtf = total_elapsed / audio_end if audio_end > 0 else 0

    # Emit done
    emit(
        {
            "type": "done",
            "outputs": outputs,
            "stats": {
                "duration_sec": round(audio_total_sec, 2),
                "elapsed_sec": round(total_elapsed, 2),
                "rtf": round(final_rtf, 3),
                "segments": len(all_segments),
                "chars": total_chars,
                "words": total_words,
                "model": args.model,
                "model_load_sec": round(t_model_end - t_model_start, 1),
                "language_detected": info.language,
                "language_probability": round(info.language_probability, 3),
            },
        }
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        emit({"type": "error", "message": "Canceled by user", "details": ""})
        sys.exit(1)
    except Exception as e:
        emit_error(f"Unexpected error: {e}", traceback.format_exc(), include_traceback=False)
