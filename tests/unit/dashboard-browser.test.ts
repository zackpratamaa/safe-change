import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { openBrowser } from "../../src/dashboard/browser.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("optional desktop browser launch", () => {
  it("handles the asynchronous ENOENT emitted by a missing desktop opener", async () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValueOnce(child as ReturnType<typeof spawn>);
    expect(() => openBrowser("http://127.0.0.1:4242")).not.toThrow();
    expect(child.listenerCount("error")).toBe(1);
    await new Promise<void>((resolve) => process.nextTick(() => {
      expect(() => child.emit("error", Object.assign(new Error("missing opener"), { code: "ENOENT" }))).not.toThrow();
      resolve();
    }));
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("retains synchronous spawn failure handling", () => {
    vi.mocked(spawn).mockImplementationOnce(() => { throw new Error("spawn refused"); });
    expect(() => openBrowser("http://127.0.0.1:4242")).not.toThrow();
  });

  it.each([
    ["linux", "xdg-open", ["http://127.0.0.1:4242"]],
    ["darwin", "open", ["http://127.0.0.1:4242"]],
    ["win32", "cmd.exe", ["/c", "start", "", "http://127.0.0.1:4242"]],
  ])("preserves the %s direct-spawn command", (platform, command, args) => {
    vi.spyOn(process, "platform", "get").mockReturnValue(platform as NodeJS.Platform);
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    vi.mocked(spawn).mockReturnValueOnce(child as ReturnType<typeof spawn>);
    openBrowser("http://127.0.0.1:4242");
    expect(spawn).toHaveBeenLastCalledWith(command, args, { detached: true, stdio: "ignore" });
    expect(child.unref).toHaveBeenCalledOnce();
  });
});
