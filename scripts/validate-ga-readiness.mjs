import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_REVIEW_SCOPES = Object.freeze([
  "ed25519-dsse-in-toto",
  "policy-trust-root",
  "command-allowlist-os-isolation",
]);

const isSha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const isHttps = (value) => {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const isDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));

export function validateGaReadiness(
  record,
  { sourceSha, now = new Date() } = {},
) {
  const errors = [];
  if (!isSha(sourceSha)) errors.push("A 40-character source SHA is required.");
  if (!record || typeof record !== "object" || record.schemaVersion !== 1) {
    return {
      valid: false,
      errors: [...errors, "GA readiness schemaVersion must be 1."],
    };
  }
  if (record.status !== "ready")
    errors.push('GA readiness status must be "ready".');
  if (record.candidateSha !== sourceSha)
    errors.push("GA candidate SHA must match the tagged source SHA.");

  const stabilization = record.stabilization ?? {};
  if (
    !Number.isInteger(stabilization.minimumDays) ||
    stabilization.minimumDays <= 0
  ) {
    errors.push(
      "A positive, explicitly approved stabilization minimum is required.",
    );
  }
  if (!isDate(stabilization.startedOn) || !isDate(stabilization.endedOn)) {
    errors.push("Valid stabilization start and end dates are required.");
  } else {
    const start = Date.parse(`${stabilization.startedOn}T00:00:00.000Z`);
    const end = Date.parse(`${stabilization.endedOn}T00:00:00.000Z`);
    const elapsedDays = Math.floor((end - start) / 86_400_000);
    if (end > now.getTime())
      errors.push("Stabilization cannot end in the future.");
    if (
      Number.isInteger(stabilization.minimumDays) &&
      elapsedDays < stabilization.minimumDays
    ) {
      errors.push(
        "Recorded stabilization is shorter than its approved minimum.",
      );
    }
  }
  if (
    !Array.isArray(stabilization.testedRuns) ||
    stabilization.testedRuns.length === 0
  ) {
    errors.push("At least one source-bound stabilization run is required.");
  } else if (
    stabilization.testedRuns.some(
      (run) => run?.sourceSha !== sourceSha || !isHttps(run?.url),
    )
  ) {
    errors.push(
      "Every stabilization run must use the candidate SHA and an HTTPS evidence URL.",
    );
  }
  if (!Array.isArray(stabilization.incidents)) {
    errors.push("The stabilization incident ledger is required.");
  } else if (
    stabilization.incidents.some(
      (incident) => incident?.status !== "resolved" || !isHttps(incident?.url),
    )
  ) {
    errors.push(
      "Every stabilization incident must be resolved with an HTTPS evidence URL.",
    );
  }

  const review = record.independentSecurityReview ?? {};
  if (review.status !== "completed")
    errors.push("Independent security review is not completed.");
  if (
    typeof review.provider !== "string" ||
    review.provider.trim().length === 0
  ) {
    errors.push("Independent security review provider is required.");
  }
  if (!isHttps(review.reportUrl))
    errors.push("Independent security review report URL is required.");
  if (!isSha(review.auditedSha) || review.retestSha !== sourceSha) {
    errors.push(
      "Security review must identify an audited SHA and retest the candidate SHA.",
    );
  }
  if (
    !Array.isArray(review.scopes) ||
    REQUIRED_REVIEW_SCOPES.some((scope) => !review.scopes.includes(scope))
  ) {
    errors.push(
      "Independent review does not cover every required security scope.",
    );
  }
  if (review.openCriticalFindings !== 0 || review.openHighFindings !== 0) {
    errors.push(
      "GA is blocked while critical or high security findings remain open.",
    );
  }

  const approval = record.releaseApproval ?? {};
  if (
    approval.approved !== true ||
    !isHttps(approval.decisionUrl) ||
    !Array.isArray(approval.approvers) ||
    approval.approvers.length === 0 ||
    approval.approvers.some(
      (name) => typeof name !== "string" || name.trim().length === 0,
    )
  ) {
    errors.push(
      "Documented human GA approval with an HTTPS decision URL is required.",
    );
  }
  return { valid: errors.length === 0, errors };
}

export function main() {
  const sourceSha = process.env.GITHUB_SHA;
  const path = resolve("docs", "ga-readiness.json");
  let record;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read GA readiness record: ${error.message}`);
  }
  const result = validateGaReadiness(record, { sourceSha });
  if (!result.valid) {
    throw new Error(`GA release blocked:\n- ${result.errors.join("\n- ")}`);
  }
  console.log(`GA readiness verified for ${sourceSha}.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
