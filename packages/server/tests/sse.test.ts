import { describe, expect, it } from "vitest";
import { SseHub } from "../src/lib/sseHub.js";

describe("SseHub", () => {
  it("broadcasts events to all subscribers", async () => {
    const hub = new SseHub();
    const out: string[] = [];
    const sub1 = (s: string): void => {
      out.push(`a:${s}`);
    };
    const sub2 = (s: string): void => {
      out.push(`b:${s}`);
    };
    const off1 = hub.subscribe("p1", sub1);
    const off2 = hub.subscribe("p1", sub2);
    hub.broadcast("p1", { type: "file-changed", path: "/x.md" });
    expect(out.length).toBe(2);
    expect(out[0]).toContain("file-changed");
    off1();
    off2();
  });

  it("does not broadcast across project keys", () => {
    const hub = new SseHub();
    const out: string[] = [];
    const off = hub.subscribe("p1", (s) => out.push(s));
    hub.broadcast("p2", { type: "file-changed", path: "/x.md" });
    expect(out.length).toBe(0);
    off();
  });

  it("formats events as SSE-compatible strings", () => {
    const hub = new SseHub();
    let captured = "";
    const off = hub.subscribe("p1", (s) => {
      captured = s;
    });
    hub.broadcast("p1", { type: "file-changed", path: "/x.md" });
    expect(captured.startsWith("event: ")).toBe(true);
    expect(captured).toContain("data: ");
    expect(captured.endsWith("\n\n")).toBe(true);
    off();
  });
});
