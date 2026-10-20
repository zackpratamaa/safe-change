import { spawn } from "node:child_process";

export function openBrowser(url: string): void {
  try {
    let command: string;
    let args: string[];

    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/c", "start", "", url];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else {
      command = "xdg-open";
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    // Missing desktop openers report ENOENT asynchronously, outside try/catch.
    // Opening the optional browser must not terminate a headless CLI/server.
    child.once("error", () => {});
    child.unref();
  } catch {
    // If opening browser fails, continue without error
  }
}

