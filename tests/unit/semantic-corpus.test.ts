import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SemanticDiffEngine } from "../../src/semantic/engine.js";

const { evaluateCorpus } = await import(pathToFileURL(resolve("tests/benchmarks/semantic-corpus.mjs")).href);
const corpus = JSON.parse(readFileSync(resolve("tests/fixtures/semantic-corpus/corpus.json"), "utf8")) as {
  cases: { id: string; label: string; expectedCategory?: string; knownLimitation?: string }[];
};
const report = evaluateCorpus(new SemanticDiffEngine(), corpus);

describe("labeled semantic regression corpus", () => {
  it.each(corpus.cases)("evaluates $id without excluding known misses from recall", fixture => {
    const actual = report.cases.find((result: { id: string }) => result.id === fixture.id);
    expect(actual).toBeDefined();
    if (fixture.label === "benign") {
      expect(actual.categories).toEqual([]);
    } else if (!fixture.knownLimitation) {
      expect(actual.categories).toContain(fixture.expectedCategory);
    } else {
      // This is a labeled regression even when the heuristic misses it. Never relabel
      // it benign or drop it from the denominator to manufacture perfect recall.
      expect(actual.label).toBe("regression");
      expect(actual.knownLimitation).toBeTruthy();
    }
  });
  it("cross-checks every confusion count directly against the labeled observations", () => {
    const rows = report.cases as { label: string; detected: boolean }[];
    const tp = rows.filter(row => row.label === "regression" && row.detected).length;
    const fp = rows.filter(row => row.label === "benign" && row.detected).length;
    const fn = rows.filter(row => row.label === "regression" && !row.detected).length;
    const tn = rows.filter(row => row.label === "benign" && !row.detected).length;
    expect([report.truePositive, report.falsePositive, report.falseNegative, report.trueNegative]).toEqual([tp, fp, fn, tn]);
    expect(tp + fp + fn + tn).toBe(corpus.cases.length);
    expect(report.precision).toBe(tp / (tp + fp));
    expect(report.recall).toBe(tp / (tp + fn));
  });
});
