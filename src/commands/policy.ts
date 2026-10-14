import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import type { OutputFormat } from "../types/index.js";
import { ExitCodes } from "../types/index.js";
import { getRepositoryRoot } from "../git/inspector.js";
import { loadConfig } from "../config/loader.js";
import {
  signEnforcementPolicy,
  verifyPolicySignature,
} from "../enforcement/policy-signature.js";
import { validateEnforcementPolicy } from "../enforcement/config.js";

export async function runPolicyVerify(options: {
  readonly format: OutputFormat;
}): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;
  const config = await loadConfig(repoRoot);
  if (!config.enforcementPolicy) {
    process.stderr.write("No enforcementPolicy is configured.\n");
    return ExitCodes.CONFIG_ERROR;
  }
  const result = verifyPolicySignature(
    config.enforcementPolicy,
    config.policySignature
  );
  const accepted =
    result.valid || !config.enforcementPolicy.requireSignedPolicy;
  process.stdout.write(
    options.format === "json"
      ? `${JSON.stringify(
          {
            ...result,
            required: config.enforcementPolicy.requireSignedPolicy,
            accepted,
          },
          null,
          2
        )}\n`
      : `Policy signature: ${result.valid ? "VALID" : "NOT VALID"}\nRequired: ${config.enforcementPolicy.requireSignedPolicy ? "YES" : "NO"}\nDigest: ${result.computedDigest}\n${result.reason}\n`
  );
  return accepted ? ExitCodes.OK : ExitCodes.OWNERSHIP_CONFLICT;
}

export async function runPolicySign(options: {
  readonly format: OutputFormat;
  readonly keyId?: string;
  readonly privateKeyPath?: string;
  readonly publicKeyPath?: string;
  readonly write?: boolean;
}): Promise<number> {
  const repoRoot = await getRepositoryRoot(process.cwd()).catch(() => null);
  if (!repoRoot) return ExitCodes.NOT_GIT_REPO;

  const configPath = join(repoRoot, ".safe-change.json");
  let rawConfig: string;
  try {
    rawConfig = await readFile(configPath, "utf8");
  } catch {
    process.stderr.write(`Configuration file not found: ${configPath}\n`);
    return ExitCodes.CONFIG_ERROR;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawConfig) as Record<string, unknown>;
  } catch {
    process.stderr.write(`Invalid JSON in ${configPath}\n`);
    return ExitCodes.CONFIG_ERROR;
  }

  if (!parsed["enforcementPolicy"]) {
    process.stderr.write("No enforcementPolicy is configured in .safe-change.json\n");
    return ExitCodes.CONFIG_ERROR;
  }

  let privateKeyPem: string;
  let publicKeyPem: string;
  const keyId = options.keyId ?? "organization-policy-owner";

  if (options.privateKeyPath) {
    try {
      privateKeyPem = await readFile(resolve(repoRoot, options.privateKeyPath), "utf8");
    } catch (err: unknown) {
      process.stderr.write(`Failed to read private key from ${options.privateKeyPath}: ${String(err)}\n`);
      return ExitCodes.CONFIG_ERROR;
    }
    if (options.publicKeyPath) {
      try {
        publicKeyPem = await readFile(resolve(repoRoot, options.publicKeyPath), "utf8");
      } catch (err: unknown) {
        process.stderr.write(`Failed to read public key from ${options.publicKeyPath}: ${String(err)}\n`);
        return ExitCodes.CONFIG_ERROR;
      }
    } else {
      try {
        const pubKey = createPublicKey(privateKeyPem);
        publicKeyPem = pubKey.export({ type: "spki", format: "pem" }).toString();
      } catch (err: unknown) {
        process.stderr.write(`Failed to derive public key from private key: ${String(err)}\n`);
        return ExitCodes.CONFIG_ERROR;
      }
    }
  } else {
    const pair = generateKeyPairSync("ed25519");
    privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  let validatedPolicy;
  try {
    validatedPolicy = validateEnforcementPolicy(parsed["enforcementPolicy"]);
  } catch (err: unknown) {
    process.stderr.write(`Invalid enforcement policy: ${String(err)}\n`);
    return ExitCodes.CONFIG_ERROR;
  }

  const signature = signEnforcementPolicy(validatedPolicy, {
    keyId,
    privateKeyPem,
    publicKeyPem,
  });

  const verifyResult = verifyPolicySignature(validatedPolicy, signature);
  if (!verifyResult.valid) {
    process.stderr.write(`Signature verification failed immediately: ${verifyResult.reason}\n`);
    return ExitCodes.OWNERSHIP_CONFLICT;
  }

  if (options.write) {
    parsed["policySignature"] = signature;
    await writeFile(configPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }

  if (options.format === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          success: true,
          written: Boolean(options.write),
          policyDigest: signature.policyDigest,
          signature,
          ...(!options.privateKeyPath ? { generatedPrivateKeyPem: privateKeyPem } : {}),
        },
        null,
        2
      )}\n`
    );
  } else {
    process.stdout.write(
      `Policy signed successfully.\n` +
      `Key ID: ${signature.keyId}\n` +
      `Algorithm: ${signature.algorithm}\n` +
      `Policy Digest: ${signature.policyDigest}\n` +
      `Signature: ${signature.signatureBase64.slice(0, 32)}...\n` +
      (options.write ? `Updated policySignature in: ${configPath}\n` : `Run with --write to save policySignature directly into ${configPath}\n`)
    );
  }

  return ExitCodes.OK;
}