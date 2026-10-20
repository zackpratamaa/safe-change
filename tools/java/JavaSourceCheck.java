import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;

/** Optional dependency-free compilation oracle. Requires a full JDK 17 or newer. */
public final class JavaSourceCheck {
    private static final Set<String> EXCLUDED_DIRECTORIES = Set.of(
        ".git", ".safe-change", "node_modules", "target", "build", "dist", ".gradle"
    );

    private JavaSourceCheck() {}

    public static void main(String[] args) {
        int exitCode;
        try {
            exitCode = run(args);
        } catch (IOException | RuntimeException error) {
            System.err.println("Java compilation check could not run: " + error.getMessage());
            exitCode = 2;
        }
        System.exit(exitCode);
    }

    private static int run(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("Usage: java JavaSourceCheck.java <source-directory>");
            return 2;
        }
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            System.err.println("A full JDK is required; a JRE cannot compile source files.");
            return 2;
        }
        Path root = Path.of(args[0]).toRealPath();
        if (!Files.isDirectory(root)) {
            System.err.println("Source path must be a directory.");
            return 2;
        }
        List<Path> sources = new ArrayList<>();
        // Do not follow symbolic links into other trees or compile build artifacts.
        Files.walkFileTree(root, new SimpleFileVisitor<Path>() {
            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attributes) {
                return !dir.equals(root) && EXCLUDED_DIRECTORIES.contains(dir.getFileName().toString())
                    ? FileVisitResult.SKIP_SUBTREE : FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attributes) {
                if (attributes.isRegularFile() && file.getFileName().toString().endsWith(".java")) {
                    sources.add(file);
                }
                return FileVisitResult.CONTINUE;
            }
        });
        sources.sort(Comparator.comparing(Path::toString));
        if (sources.isEmpty()) {
            System.err.println("No Java source files found; refusing an empty passing check.");
            return 2;
        }
        Path output = Files.createTempDirectory("safe-change-java-classes-");
        try {
            DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
            boolean passed;
            try (StandardJavaFileManager manager = compiler.getStandardFileManager(diagnostics, Locale.ROOT, java.nio.charset.StandardCharsets.UTF_8)) {
                Iterable<? extends JavaFileObject> units = manager.getJavaFileObjectsFromPaths(sources);
                // No annotation processors or ambient project classpath. This oracle
                // intentionally handles JDK-only source trees, not Maven/Gradle builds.
                List<String> options = List.of(
                    "--release", "17", "-encoding", "UTF-8", "-proc:none",
                    "-implicit:none", "-classpath", output.toString(), "-d", output.toString()
                );
                passed = Boolean.TRUE.equals(compiler.getTask(null, manager, diagnostics, options, null, units).call());
            }
            for (Diagnostic<? extends JavaFileObject> diagnostic : diagnostics.getDiagnostics()) {
                String source = diagnostic.getSource() == null ? "<compiler>" : diagnostic.getSource().getName();
                System.err.printf(Locale.ROOT, "%s:%d: %s: %s%n", source, diagnostic.getLineNumber(), diagnostic.getKind(), diagnostic.getMessage(Locale.ROOT));
            }
            System.out.printf(Locale.ROOT, "Java compilation %s (%d source files).%n", passed ? "passed" : "failed", sources.size());
            return passed ? 0 : 1;
        } finally {
            // Close the file manager first, then remove classes even after failure.
            try (var entries = Files.walk(output)) {
                for (Path path : entries.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }
}
