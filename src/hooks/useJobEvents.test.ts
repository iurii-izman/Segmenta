import { describe, it, expect } from "vitest";
import { formatDuration, formatEta } from "./useJobEvents";

describe("formatDuration", () => {
    it("returns 0:00 for zero or negative", () => {
        expect(formatDuration(0)).toBe("0:00");
        expect(formatDuration(-1)).toBe("0:00");
    });
    it("formats seconds only", () => {
        expect(formatDuration(45)).toBe("0:45");
    });
    it("formats minutes and seconds", () => {
        expect(formatDuration(125)).toBe("2:05");
    });
    it("formats hours", () => {
        expect(formatDuration(3661)).toBe("1:01:01");
    });
});

describe("formatEta", () => {
    it("returns dash for zero or negative", () => {
        expect(formatEta(0)).toBe("—");
        expect(formatEta(-1)).toBe("—");
    });
    it("formats seconds without t()", () => {
        expect(formatEta(30)).toMatch(/~30/);
    });
    it("formats minutes without t()", () => {
        expect(formatEta(120)).toMatch(/~2/);
    });
});
