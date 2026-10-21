import { describe, expect, it } from "vitest";
import {
  redactSecrets,
  StreamingSecretRedactor,
} from "../../src/security/secret-redactor.js";
import { executeCheck } from "../../src/runner/executor.js";

describe("secret output blocker", () => {
  it("redacts supported credential classes without returning their values", () => {
    const github = `ghp_${"A".repeat(40)}`;
    const npm = `npm_${"b".repeat(40)}`;
    const result = redactSecrets(
      [
        `token=${github}`,
        `registry=${npm}`,
        "Authorization: Bearer example.example.example",
        "postgres://admin:supersecret@db.example/internal",
      ].join("\n")
    );

    expect(result.text).not.toContain(github);
    expect(result.text).not.toContain(npm);
    expect(result.text).not.toContain("supersecret");
    expect(result.detectedTypes).toEqual(
      expect.arrayContaining([
        "github-token",
        "npm-token",
        "authorization-header",
        "connection-string",
      ])
    );
  });

  it.each([
    ["github-token", `ghp_${"Z".repeat(40)}`],
    ["npm-token", `npm_${"n".repeat(40)}`],
    ["aws-access-key", `AKIA${"A".repeat(16)}`],
    ["authorization-header", "Authorization: Bearer example.example.example"],
    ["connection-string", "postgresql://user:password@database.example/test"],
    ["generic-secret", `client_secret=${"s".repeat(40)}`],
  ] as const)(
    "redacts %s at every internal emission boundary",
    (expectedType, secret) => {
      for (let boundaryOffset = 1; boundaryOffset < secret.length; boundaryOffset += 1) {
        const prefix = `${"x".repeat(79)}\n`;
        const suffixLength = 2048 + boundaryOffset - secret.length - 1;
        const input = `${prefix}${secret}\n${"y".repeat(suffixLength)}`;
        const redactor = new StreamingSecretRedactor(512);
        const output = `${redactor.push(Buffer.from(input))}${redactor.flush()}`;

        expect(output, `boundary offset ${boundaryOffset}`).not.toContain(secret);
        expect(redactor.detectedTypes).toContain(expectedType);
      }
    }
  );

  it("preserves UTF-8 characters split across input chunks", () => {
    const value = `before-🙂-after ghp_${"Q".repeat(40)}`;
    const bytes = Buffer.from(value, "utf8");
    const emojiStart = Buffer.from("before-", "utf8").length;
    const redactor = new StreamingSecretRedactor();
    const output = [
      redactor.push(bytes.subarray(0, emojiStart + 2)),
      redactor.push(bytes.subarray(emojiStart + 2)),
      redactor.flush(),
    ].join("");

    expect(output).toContain("before-🙂-after");
    expect(output).not.toContain(`ghp_${"Q".repeat(40)}`);
    expect(redactor.detectedTypes).toContain("github-token");
  });

  it("redacts a private key block split across stream chunks", () => {
    const redactor = new StreamingSecretRedactor(512);
    const outputs = [
      redactor.push(
        Buffer.from(
          `prefix\n-----BEGIN PRIVATE KEY-----\n${"A".repeat(700)}`,
          "utf8"
        )
      ),
      redactor.push(
        Buffer.from(
          `${"B".repeat(700)}\n-----END PRIVATE KEY-----\nsuffix\n`,
          "utf8"
        )
      ),
      redactor.flush(),
    ].join("");

    expect(outputs).not.toContain("BEGIN PRIVATE KEY");
    expect(outputs).not.toContain("A".repeat(100));
    expect(outputs).not.toContain("B".repeat(100));
    expect(outputs).toContain("[REDACTED:private-key]");
    expect(redactor.detectedTypes).toContain("private-key");
  });

  it("never emits a private key body larger than the stream holdback", () => {
    const redactor = new StreamingSecretRedactor(512);
    const first = redactor.push(
      Buffer.from(
        `safe-prefix\n-----BEGIN PRIVATE KEY-----\n${"K".repeat(5000)}`
      )
    );
    const second = redactor.push(
      Buffer.from("\n-----END PRIVATE KEY-----\nsafe-suffix\n")
    );
    const output = `${first}${second}${redactor.flush()}`;

    expect(output).toContain("safe-prefix");
    expect(output).toContain("safe-suffix");
    expect(output).toContain("[REDACTED:private-key]");
    expect(output).not.toContain("BEGIN PRIVATE KEY");
    expect(output).not.toContain("K".repeat(100));
    expect(redactor.detectedTypes).toContain("private-key");
  });

  it("forces a successful check to fail when secret output is detected", async () => {
    const token = `ghp_${"Z".repeat(40)}`;
    const result = await executeCheck(
      {
        name: "secret-emitter",
        executable: process.execPath,
        args: ["-e", `process.stdout.write(${JSON.stringify(token)})`],
        timeout: 5,
      },
      { cwd: process.cwd() }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.outputBlocked).toBe(true);
    expect(result.detectedSecretTypes).toContain("github-token");
    expect(result.stdout).not.toContain(token);
    expect(result.stdout).toContain("[REDACTED:github-token]");
  });

  it("preserves ordinary output and successful verification", async () => {
    const result = await executeCheck(
      {
        name: "ordinary-output",
        executable: process.execPath,
        args: ["-e", "console.log('verification complete')"],
        timeout: 5,
      },
      { cwd: process.cwd() }
    );

    expect(result.passed).toBe(true);
    expect(result.outputBlocked).toBe(false);
    expect(result.stdout).toContain("verification complete");
  });
});