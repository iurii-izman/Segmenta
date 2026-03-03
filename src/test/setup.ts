import "@testing-library/jest-dom";
import { vi } from "vitest";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Init i18n for component tests
void i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: {
        en: { translation: { tabs: { newTask: "New Task", queue: "Queue", settings: "Settings" } } },
        ru: { translation: { tabs: { newTask: "Новая задача", queue: "Очередь", settings: "Настройки" } } },
    },
    react: { useSuspense: false },
});

// Mock Tauri invoke so tests don't call the backend
vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
}));
