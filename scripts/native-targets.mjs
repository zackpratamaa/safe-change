const targets = [
  { name: "linux-x64-gnu", platform: "linux", arch: "x64", libc: "glibc" },
  { name: "linux-arm64-gnu", platform: "linux", arch: "arm64", libc: "glibc" },
  { name: "linux-x64-musl", platform: "linux", arch: "x64", libc: "musl" },
  { name: "win32-x64-msvc", platform: "win32", arch: "x64", libc: null },
  { name: "darwin-arm64", platform: "darwin", arch: "arm64", libc: null },
  { name: "darwin-x64", platform: "darwin", arch: "x64", libc: null },
];

export const NATIVE_TARGETS = Object.freeze(
  targets.map((target) => Object.freeze({ ...target })),
);
export const NATIVE_TARGET_NAMES = Object.freeze(
  NATIVE_TARGETS.map((target) => target.name),
);
export const NATIVE_PACKAGE_NAMES = Object.freeze(
  NATIVE_TARGET_NAMES.map((target) => `@safe-change/${target}`),
);
export const NATIVE_TARGET_HOSTS = Object.freeze(
  Object.fromEntries(
    NATIVE_TARGETS.map(({ name, platform, arch, libc }) => [
      name,
      Object.freeze([platform, arch, libc]),
    ]),
  ),
);
