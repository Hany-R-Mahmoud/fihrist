import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import Landing from "./Landing";

afterEach(cleanup);

describe("Landing", () => {
  it("starts at the public landing with clear sign-in and guest choices", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { name: /Keep the web.*return to/ })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /sign in/i }).some(link => link.getAttribute("href") === "/sign-in")).toBe(true);
    expect(screen.getAllByRole("button", { name: /guest/i })).toHaveLength(2);
  });

  it("exposes the collection and link-health chapters", () => {
    render(<Landing />);

    expect(screen.getByRole("heading", { name: "Give every good link a place to land." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The web changes. Your memory does not have to." })).toBeTruthy();
    expect(screen.getByText(/Explore as a guest with browser-only bookmarks/)).toBeTruthy();
  });
});
