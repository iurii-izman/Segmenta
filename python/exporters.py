"""
Exporters for transcription results — TXT, SRT, VTT, JSON.
Each function takes a list of segment dicts [{start, end, text}] and writes to a file.
"""

import json
from typing import List, Dict


def format_srt_time(seconds: float) -> str:
    """Format seconds as SRT timestamp: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def format_vtt_time(seconds: float) -> str:
    """Format seconds as WebVTT timestamp: HH:MM:SS.mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02}:{m:02}:{s:02}.{ms:03}"


def export_txt(segments: List[Dict], output_path: str) -> str:
    """Export plain text — one line per segment."""
    with open(output_path, "w", encoding="utf-8") as f:
        for seg in segments:
            f.write(seg["text"].strip() + "\n")
    return output_path


def export_srt(segments: List[Dict], output_path: str) -> str:
    """Export SubRip (.srt) subtitles."""
    with open(output_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, start=1):
            f.write(f"{i}\n")
            f.write(
                f"{format_srt_time(seg['start'])} --> {format_srt_time(seg['end'])}\n"
            )
            f.write(seg["text"].strip() + "\n\n")
    return output_path


def export_vtt(segments: List[Dict], output_path: str) -> str:
    """Export WebVTT (.vtt) subtitles."""
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, seg in enumerate(segments, start=1):
            f.write(f"{i}\n")
            f.write(
                f"{format_vtt_time(seg['start'])} --> {format_vtt_time(seg['end'])}\n"
            )
            f.write(seg["text"].strip() + "\n\n")
    return output_path


def export_json(segments: List[Dict], output_path: str) -> str:
    """Export JSON array of segments [{start, end, text}]."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
    return output_path
