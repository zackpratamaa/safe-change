import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function evaluateCorpus(engine, corpus) {
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) throw new Error("Empty corpus");
  const seen = new Set();
  let truePositive = 0, falsePositive = 0, trueNegative = 0, falseNegative = 0;
  const cases = corpus.cases.map((fixture) => {
    if (seen.has(fixture.id)) throw new Error(`Duplicate corpus ID: ${fixture.id}`);
    seen.add(fixture.id);
    if (!["regression", "benign"].includes(fixture.label)) throw new Error(`Invalid label: ${fixture.id}`);
    const result = engine.compareContents(fixture.file, fixture.before, fixture.after);
    if (!result) throw new Error(`Unsupported fixture must not be silently excluded: ${fixture.id}`);
    const categories = [...new Set(result.findings.map((finding) => finding.category))];
    const detected = categories.length > 0;
    const regression = fixture.label === "regression";
    if (regression && detected) truePositive++;
    else if (regression) falseNegative++;
    else if (detected) falsePositive++;
    else trueNegative++;
    return { id: fixture.id, label: fixture.label, detected, categories,
      expectedCategory: fixture.expectedCategory ?? null,
      knownLimitation: fixture.knownLimitation ?? null };
  });
  const divide = (a, b) => b === 0 ? null : a / b;
  return { corpusVersion: corpus.version, provenance: corpus.provenance,
    detectionRule: "At least one finding of any severity; not equivalent to a blocking verdict or semantic correctness",
    population: "Hand-labeled synthetic regression idioms and benign refactors, not a random real-world sample",
    caseCount: cases.length, truePositive, falsePositive, trueNegative, falseNegative,
    precision: divide(truePositive, truePositive + falsePositive),
    recall: divide(truePositive, truePositive + falseNegative), cases };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { SemanticDiffEngine } = await import(pathToFileURL(resolve("dist/semantic/engine.js")).href);
  const corpus = JSON.parse(readFileSync(new URL("../fixtures/semantic-corpus/corpus.json", import.meta.url), "utf8"));
  console.log(JSON.stringify(evaluateCorpus(new SemanticDiffEngine(), corpus), null, 2));
}
