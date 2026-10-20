import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineNotice } from "./OfflineNotice";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("offline PWA notice", () => {
  it("explains that the app shell works offline while bookmark data needs a connection", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(<OfflineNotice />);

    expect(screen.getByRole("status").textContent).toMatch(/app shell is available.*bookmark data needs an internet connection/i);
  });

  it("updates when the browser reconnects", () => {
    let online = false;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);

    render(<OfflineNotice />);
    expect(screen.getByRole("status")).toBeTruthy();

    online = true;
    fireEvent(window, new Event("online"));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
