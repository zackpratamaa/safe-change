import { readdirSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TARGET_HOSTS = {
  "linux-x64-gnu": ["linux", "x64", "glibc"],
  "linux-arm64-gnu": ["linux", "arm64", "glibc"],
  "linux-x64-musl": ["linux", "x64", "musl"],
  "win32-x64-msvc": ["win32", "x64", null],
  "darwin-arm64": ["darwin", "arm64", null],
  "darwin-x64": ["darwin", "x64", null],
};

export function assertTargetHost(target, host) {
  const expected = TARGET_HOSTS[target];
  if (!expected) throw new Error(`Unsupported native target: ${target}`);
  const actual = [host.platform, host.arch, host.libc];
  if (expected.some((value, index) => value !== actual[index])) {
    throw new Error(`Native target ${target} requires ${expected.join("/")}; got ${actual.join("/")}`);
  }
}

export function verifyNativeExports(native, expectedVersion, rootDir) {
  if (native.version() !== expectedVersion) {
    throw new Error(`Built native version does not match root version ${expectedVersion}`);
  }
  const inside = native.checkPathBoundary(join(rootDir, "package.json"), rootDir);
  const outside = native.checkPathBoundary(resolve(rootDir, "..", "escaped.txt"), rootDir);
  if (inside !== true || outside !== false) {
    throw new Error(`Built native boundary check failed (inside: ${inside}, outside: ${outside})`);
  }
}

export async function verifyBuiltNative(target, rootDir = resolve(".")) {
  let libc = null;
  if (process.platform === "linux") {
    const report = process.report.getReport();
    if (report.header.glibcVersionRuntime) libc = "glibc";
    else if (report.sharedObjects.some((file) => /(?:ld-musl|libc\.musl)/.test(file))) libc = "musl";
    else throw new Error("Cannot establish the Linux C library; native execution is unverified");
  }
  assertTargetHost(target, { platform: process.platform, arch: process.arch, libc });
  const cratesDir = join(rootDir, "crates", "safe-change-native");
  const binaries = readdirSync(cratesDir).filter((name) => name.endsWith(".node"));
  if (binaries.length !== 1 || !binaries[0].endsWith(`.${target}.node`)) {
    throw new Error(`Expected exactly one freshly built .${target}.node, found: ${binaries.join(", ")}`);
  }
  const pkgDir = join(rootDir, "npm", target);
  const rootPackage = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const targetPackage = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  if (targetPackage.name !== `@safe-change/${target}` || targetPackage.version !== rootPackage.version) {
    throw new Error(`Native platform metadata mismatch for ${target}`);
  }
  const sourceBinary = join(cratesDir, binaries[0]);
  // Load this exact build first: an installed optional package cannot substitute for it.
  const require = createRequire(import.meta.url);
  verifyNativeExports(require(sourceBinary), rootPackage.version, rootDir);
  const distNativeDir = join(rootDir, "dist", "native");
  mkdirSync(distNativeDir, { recursive: true });
  copyFileSync(sourceBinary, join(distNativeDir, "safe-change-native.node"));
  const packagedBinary = join(pkgDir, "safe-change-native.node");
  copyFileSync(sourceBinary, packagedBinary);
  verifyNativeExports(require(packagedBinary), rootPackage.version, rootDir);
  const loader = await import(pathToFileURL(join(distNativeDir, "index.js")).href);
  if (loader.getNativeLoadStatus() !== "loaded" || !loader.isNativeAvailable()) {
    throw new Error("The application loader did not load native code");
  }
  if (loader.getNativeVersion() !== rootPackage.version ||
      loader.checkPathBoundaryNative(join(rootDir, "package.json"), rootDir) !== true ||
      loader.checkPathBoundaryNative(resolve(rootDir, "..", "escaped.txt"), rootDir) !== false) {
    throw new Error("The application loader failed native version/boundary verification");
  }
  console.log(`Executed exact built and packaged native binary: ${target} ${rootPackage.version} (${process.platform}/${process.arch}/${libc ?? "system"})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyBuiltNative(process.argv[2]).catch((error) => {
    console.error(`Native verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
