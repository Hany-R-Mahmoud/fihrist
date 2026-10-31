import { cleanup, fireEvent, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { QueueStatusBanner } from "./Home";

afterEach(cleanup);
const props = () => ({
  summary: { pending: 731, processing: 0, failed: 0 },
  retryPending: false, processingBatch: false,
  onRetry: vi.fn(), onReview: vi.fn(), onRefresh: vi.fn(), onProcess: vi.fn(),
});

describe("honest queue status", () => {
  it("shows waiting work without a spinner and starts a batch only on click", () => {
    const p = props();
    const { container } = renderWithProviders(<QueueStatusBanner {...p} />);
    expect(screen.getByText(/731 links waiting/)).toBeTruthy();
    expect(screen.getByText(/No processing is currently recorded/)).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(p.onProcess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Process a batch (up to 4 links)" }));
    expect(p.onProcess).toHaveBeenCalledTimes(1);
  });

  it("alerts about broken links even with an empty queue", () => {
    const p = props();
    renderWithProviders(<QueueStatusBanner {...p} summary={{ pending: 0, processing: 0, failed: 0 }} broken={3} needsReview={2} />);
    expect(screen.getByText(/3 broken links at the last check/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show broken links" }));
    expect(p.onReview).toHaveBeenCalledOnce();
  });

  it("distinguishes waiting from processing in Arabic", () => {
    const { container } = renderWithProviders(<QueueStatusBanner {...props()} />, { locale: "ar" });
    expect(screen.getByText(/731 رابط في انتظار المعالجة/)).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
