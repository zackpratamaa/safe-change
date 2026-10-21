import { startDashboardServer, openBrowser } from "../dashboard/server.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { renderError } from "../output/renderer.js";
import { ExitCodes, type OutputFormat } from "../types/index.js";

export interface DashboardCommandOptions {
  readonly port?: number;
  readonly noOpen?: boolean;
  readonly format?: OutputFormat;
}

export async function runDashboard(
  options: DashboardCommandOptions = {},
): Promise<number> {
  const format = options.format ?? "terminal";

  let repoRoot: string;
  try {
    repoRoot = await getRepositoryRoot(process.cwd());
  } catch {
    process.stderr.write(
      renderError(
        format,
        "Not a Git repository. safe-change requires a Git repository.",
        ExitCodes.NOT_GIT_REPO,
      ),
    );
    return ExitCodes.NOT_GIT_REPO;
  }

  try {
    const instance = await startDashboardServer({
      port: options.port,
      repoRoot,
    });

    const displayUrl = instance.url;
    process.stdout.write(`Dashboard running at ${displayUrl}\n`);
    process.stdout.write("Press Ctrl+C to stop.\n");

    if (!options.noOpen) {
      openBrowser(displayUrl);
    }

    // Wait until process receives interrupt or termination signal
    await new Promise<void>((resolve) => {
      let isStopping = false;
      const shutdown = async () => {
        if (isStopping) return;
        isStopping = true;
        process.stdout.write("\nStopping dashboard...\n");
        try {
          await instance.close();
        } finally {
          resolve();
        }
      };

      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });

    return ExitCodes.OK;
  } catch (err: unknown) {
    process.stderr.write(
      renderError(
        format,
        `Failed to start dashboard: ${err instanceof Error ? err.message : String(err)}`,
        ExitCodes.INTERNAL_ERROR,
      ),
    );
    return ExitCodes.INTERNAL_ERROR;
  }
}
