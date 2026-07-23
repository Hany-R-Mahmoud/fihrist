import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import Landing from "./Landing";

afterEach(cleanup);

describe("Landing", () => {
  it("keeps the root landing page public and points visitors to the library", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { name: /Keep the web.*return to/ })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /open bookmarks library/i })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /open bookmarks library/i }).every(link => link.getAttribute("href") === "/library")).toBe(true);
  });

  it("exposes the collection and link-health chapters", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { name: "Give every good link a place to land." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The web changes. Your memory does not have to." })).toBeTruthy();
    expect(screen.getByText(/No Manus sign-in at the door/)).toBeTruthy();
  });
});
