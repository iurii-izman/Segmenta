import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { JobProvider } from "./stores/jobStore";

function renderApp() {
    return render(
        <JobProvider>
            <App />
        </JobProvider>
    );
}

describe("App", () => {
    it("renders tab labels", () => {
        renderApp();
        expect(screen.getByRole("button", { name: /New Task|Новая задача/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Settings|Настройки/ })).toBeInTheDocument();
        const queueTab = screen.getAllByRole("button", { name: /Queue|Очередь/ })[0];
        expect(queueTab).toBeInTheDocument();
    });
    it("renders app title", () => {
        renderApp();
        expect(screen.getByText("Transkribator")).toBeInTheDocument();
    });
});
