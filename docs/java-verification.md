# Optional Java compilation verification

The TypeScript CLI remains the core runtime. The source tree now includes a small Java compiler oracle at `tools/java/JavaSourceCheck.java`. It uses the JDK compiler API, not a second parser or a claim of semantic equivalence. A full JDK 17 or newer is required only when this optional check is configured.

## Use with safe-change

Copy `tools/java/JavaSourceCheck.java` into the repository you want to verify, retaining that relative path. Add this check to its `.safe-change.json` without removing existing checks:

```json
{
  "name": "java-compile",
  "executable": "java",
  "args": ["tools/java/JavaSourceCheck.java", "src/main/java"],
  "timeout": 90
}
```

Run `safe-change save "Java compilation passing"` before editing sources. Then run `safe-change check --strict`. A compilation error fails verification. Restore the source and reuse the same baseline to verify the repair.

The checker writes compiled classes into a temporary directory and removes it afterward. It does not write `.class` files into your source tree, follow symlinks encountered during source traversal, run annotation processors or execute compiled application code. Empty source directories and setup failures return exit 2 rather than a false pass; compilation errors return exit 1.

## Scope and limits

- Supports JDK-only source trees compatible with Java 17. A newer JDK still compiles against the Java 17 API using `--release 17`.
- This is compilation verification, not a unit-test runner, dependency resolver, sandbox or behavioral proof. Keep application tests as separate required checks.
- Projects requiring external libraries, generated code, annotation processing, modules or framework build plugins should use their existing Maven/Gradle verification commands instead. Automatic Maven/Gradle detection has not been added.
- The helper ships in the npm tarball under `tools/java/JavaSourceCheck.java`. With a local installation, it is available at `node_modules/safe-change/tools/java/JavaSourceCheck.java`. Copy it into your repository if you want its contents directly bound as a Git-visible verification input. This source change must be released before registry installations receive it.
- The CLI guards configured repository-local `.java` command inputs, Maven/Gradle build definitions and wrapper configuration against baseline drift. Changes require explicit baseline review. External JDK installations and ignored artifacts are not cryptographically bound by that protection.
- Compilation does not make untrusted source safe. Existing OS sandbox requirements still apply; the checker does not substitute for them.

## Validation

After `npm ci` and `npm run build`, run:

```sh
node scripts/test-java-check.mjs
```

The test creates an isolated Git fixture, records a baseline with the actual CLI, introduces a Java type error, verifies failure, restores the source, verifies repair and checks that modifying the checker invalidates verification. It also checks invalid/empty input and absence of class-file pollution. CI runs the scenario on Linux, Windows and macOS with JDK 17 and 21.

## Linux CI isolation

Linux sandbox capability detection now runs bounded bubblewrap probes rather than treating `bwrap --version` as proof of working namespaces. If the host denies required namespaces, mandatory isolation remains blocked; no unsandboxed fallback is introduced. Filesystem and network availability are reported separately.

The existing cross-platform CI and coverage thresholds remain intact. A separate `Live Linux Sandbox` workflow uses an explicit Ubuntu 22.04 runner and requires real network-namespace isolation, a read-only workspace and a writable private home. It fails if those capabilities are unavailable. No global AppArmor or kernel security restrictions are disabled.
