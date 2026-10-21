import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { NATIVE_PACKAGE_NAMES } from "./native-targets.mjs";

export const PACKAGES_TO_VERIFY = Object.freeze([
  "safe-change",
  ...NATIVE_PACKAGE_NAMES,
]);

function registryUrl(registry, pkgName, version) {
  return `${registry.replace(/\/$/, "")}/${encodeURIComponent(pkgName)}/${version}`;
}

export async function checkPackageVersionStatus(
  pkgName,
  version,
  registry = "https://registry.npmjs.org",
) {
  try {
    const response = await fetch(registryUrl(registry, pkgName, version), {
      headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
      return { status: "not_published", code: 404, pkg: pkgName, version };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        status: "auth_error",
        code: response.status,
        pkg: pkgName,
        version,
      };
    }
    if (response.status !== 200) {
      return {
        status: "registry_error",
        code: response.status,
        pkg: pkgName,
        version,
      };
    }
    const metadata = await response.json();
    if (metadata.name !== pkgName || metadata.version !== version) {
      return { status: "metadata_mismatch", code: 200, pkg: pkgName, version };
    }
    return {
      status: "already_published",
      code: 200,
      pkg: pkgName,
      version,
      metadata,
    };
  } catch (error) {
    return {
      status: "network_error",
      error: error.message,
      pkg: pkgName,
      version,
    };
  }
}

function sanitize(value, token) {
  let result = String(value || "");
  if (token) result = result.split(token).join("[REDACTED]");
  return result.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");
}

export function verifyNpmAuth({
  registry = "https://registry.npmjs.org",
} = {}) {
  const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
  if (!token) {
    return {
      authenticated: false,
      error: "NODE_AUTH_TOKEN / NPM_TOKEN is not set in environment.",
    };
  }
  try {
    const registryHost = new URL(registry).host;
    const authArg = `--//${registryHost}/:_authToken=${token}`;
    const username = execFileSync(
      "npm",
      ["whoami", "--registry", registry, authArg],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NODE_AUTH_TOKEN: token },
      },
    ).trim();
    return { authenticated: true, username };
  } catch (error) {
    return {
      authenticated: false,
      error: sanitize(error.stderr?.toString() || error.message, token),
    };
  }
}

function parseOwnerOutput(output) {
  try {
    const data = JSON.parse(output);
    if (Array.isArray(data)) {
      return data.map((owner) =>
        typeof owner === "string" ? owner : owner.name || owner.username || "",
      );
    }
    if (data && typeof data === "object") {
      return Object.keys(data);
    }
  } catch {
    // Fall back to plain text line format: "username <email>"
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

export function verifyNpmAuthorization(
  username,
  { registry = "https://registry.npmjs.org" } = {},
) {
  const token = process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN;
  const env = { ...process.env, NODE_AUTH_TOKEN: token };
  const authArg = token
    ? [`--//${new URL(registry).host}/:_authToken=${token}`]
    : [];
  try {
    const owners = execFileSync(
      "npm",
      ["owner", "ls", "safe-change", "--registry", registry, ...authArg],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        env,
      },
    );
    const ownerNames = parseOwnerOutput(owners);
    if (ownerNames.length > 0 && !ownerNames.includes(username)) {
      return {
        authorized: false,
        error: `npm user "${username}" is not an owner of safe-change.`,
      };
    }

    try {
      const members = execFileSync(
        "npm",
        ["org", "ls", "safe-change", "--registry", registry, ...authArg],
        {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          env,
        },
      );
      const memberNames = parseOwnerOutput(members);
      if (memberNames.length > 0 && !memberNames.includes(username)) {
        return {
          authorized: false,
          error: `npm user "${username}" is not a member of @safe-change.`,
        };
      }
    } catch {
      // npm org ls can fail (e.g. E403) for granular/automation tokens without org-read permissions.
      // This is expected and non-fatal for package publishing.
    }
    return { authorized: true, username };
  } catch (error) {
    return {
      authorized: false,
      error: sanitize(error.stderr?.toString() || error.message, token),
    };
  }
}

export function classifyReleaseState(results) {
  const root = results.find((result) => result.pkg === "safe-change");
  const native = results.filter((result) => result.pkg !== "safe-change");
  const errors = results.filter((result) =>
    [
      "auth_error",
      "registry_error",
      "network_error",
      "metadata_mismatch",
    ].includes(result.status),
  );
  if (errors.length > 0) return { mode: "invalid", errors };
  const publishedNative = native.filter(
    (result) => result.status === "already_published",
  ).length;
  if (root.status === "not_published" && publishedNative === 0)
    return { mode: "full" };
  if (root.status === "not_published" && publishedNative === native.length)
    return { mode: "root-recovery" };
  if (root.status === "already_published" && publishedNative === native.length)
    return { mode: "complete" };
  return { mode: "mixed" };
}

export async function preflightNpm({
  rootDir = resolve("."),
  dryRun = false,
  skipAuth = false,
  registry = "https://registry.npmjs.org",
} = {}) {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) throw new Error("Missing root package.json.");
  const targetVersion = JSON.parse(readFileSync(pkgPath, "utf-8")).version;

  let username = null;
  if (!skipAuth) {
    const auth = verifyNpmAuth({ registry });
    if (!auth.authenticated) {
      if (!dryRun) throw new Error(`npm authentication failed: ${auth.error}`);
    } else {
      username = auth.username;
      const authorization = verifyNpmAuthorization(username, { registry });
      if (!authorization.authorized && !dryRun) {
        throw new Error(`npm authorization failed: ${authorization.error}`);
      }
    }
  }

  const results = [];
  for (const pkgName of PACKAGES_TO_VERIFY) {
    results.push(
      await checkPackageVersionStatus(pkgName, targetVersion, registry),
    );
  }
  const state = classifyReleaseState(results);
  if (state.mode === "invalid") {
    throw new Error(
      `Registry validation failed for ${state.errors.map((item) => item.pkg).join(", ")}.`,
    );
  }
  if (state.mode === "mixed") {
    throw new Error(
      "Unsafe partial release state: only some native packages are published.",
    );
  }
  if (state.mode === "complete") {
    throw new Error(
      `Release v${targetVersion} is already complete and immutable.`,
    );
  }

  console.log(`npm release state: ${state.mode}`);
  return {
    success: true,
    targetVersion,
    user: username,
    mode: state.mode,
    results,
  };
}

export async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipAuth =
    args.includes("--skip-auth") ||
    (dryRun && !process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN);
  const result = await preflightNpm({ dryRun, skipAuth });
  console.log(
    `npm preflight completed for v${result.targetVersion} in ${result.mode} mode.`,
  );
}

const isDirectRun = Boolean(
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase(),
);
if (isDirectRun) {
  main().catch((error) => {
    console.error(`Preflight Error: ${error.message}`);
    process.exit(1);
  });
}
