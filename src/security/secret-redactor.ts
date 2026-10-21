import { StringDecoder } from "node:string_decoder";
import type { SecretFinding, SecretType } from "../types/index.js";

interface PatternDefinition {
  readonly type: SecretType;
  readonly pattern: RegExp;
}

const PATTERNS: readonly PatternDefinition[] = [
  {
    type: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g,
  },
  {
    type: "npm-token",
    pattern: /\bnpm_[A-Za-z0-9]{20,255}\b/g,
  },
  {
    type: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    type: "authorization-header",
    pattern: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{8,512}={0,2}/gi,
  },
  {
    type: "connection-string",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^@\s]{3,512}@[^\s]{1,512}/gi,
  },
  {
    type: "generic-secret",
    pattern: /\b(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)\s*[=:]\s*["']?[A-Za-z0-9._~+/-]{12,512}["']?/gi,
  },
];

const PRIVATE_KEY_MARKERS = [
  {
    begin: "-----BEGIN PRIVATE KEY-----",
    end: "-----END PRIVATE KEY-----",
  },
  {
    begin: "-----BEGIN RSA PRIVATE KEY-----",
    end: "-----END RSA PRIVATE KEY-----",
  },
  {
    begin: "-----BEGIN EC PRIVATE KEY-----",
    end: "-----END EC PRIVATE KEY-----",
  },
  {
    begin: "-----BEGIN OPENSSH PRIVATE KEY-----",
    end: "-----END OPENSSH PRIVATE KEY-----",
  },
] as const;
const PRIVATE_KEY_END_PREFIX = "-----END";

// This is larger than the longest bounded secret pattern. Bytes inside this
// suffix are never emitted until enough following context exists to classify
// a token that crosses a stream or internal emission boundary.
const MINIMUM_STREAM_HOLDBACK = 2048;

export interface RedactionResult {
  readonly text: string;
  readonly findings: readonly SecretFinding[];
  readonly detectedTypes: readonly SecretType[];
}

export function redactSecrets(input: string): RedactionResult {
  let text = input;
  const findings: SecretFinding[] = [];
  for (const definition of PATTERNS) {
    definition.pattern.lastIndex = 0;
    text = text.replace(definition.pattern, (match, offset: number) => {
      findings.push({
        type: definition.type,
        start: offset,
        end: offset + match.length,
      });
      return `[REDACTED:${definition.type}]`;
    });
  }

  for (const { begin } of PRIVATE_KEY_MARKERS) {
    let start = text.indexOf(begin);
    while (start !== -1) {
      const endMarkerStart = text.indexOf(
        PRIVATE_KEY_END_PREFIX,
        start + begin.length
      );
      const lineEnd =
        endMarkerStart === -1 ? text.length : text.indexOf("\n", endMarkerStart);
      const end = lineEnd === -1 ? text.length : lineEnd;
      findings.push({ type: "private-key", start, end });
      text = `${text.slice(0, start)}[REDACTED:private-key]${text.slice(end)}`;
      start = text.indexOf(begin, start + 22);
    }
  }

  return {
    text,
    findings,
    detectedTypes: [...new Set(findings.map((finding) => finding.type))],
  };
}

export class StreamingSecretRedactor {
  private pending = "";
  private readonly decoder = new StringDecoder("utf8");
  private readonly detected = new Set<SecretType>();
  private readonly holdbackCharacters: number;
  private privateKeyEnd: string | null = null;

  constructor(holdbackCharacters = MINIMUM_STREAM_HOLDBACK) {
    this.holdbackCharacters = Math.max(
      MINIMUM_STREAM_HOLDBACK,
      holdbackCharacters
    );
  }

  public push(chunk: Buffer): string {
    this.pending += this.decoder.write(chunk);
    return this.drain(false);
  }

  public flush(): string {
    this.pending += this.decoder.end();
    const output = this.drain(true);
    this.pending = "";
    this.privateKeyEnd = null;
    return output;
  }

  public get detectedTypes(): readonly SecretType[] {
    return [...this.detected].sort();
  }

  private drain(flush: boolean): string {
    let output = "";

    while (this.privateKeyEnd !== null) {
      this.detected.add("private-key");
      const end = this.pending.indexOf(this.privateKeyEnd);
      if (end === -1) {
        if (flush) this.pending = "";
        else {
          const retained = Math.max(0, this.privateKeyEnd.length - 1);
          this.pending = this.pending.slice(-retained);
        }
        return output;
      }

      const afterMarker = end + this.privateKeyEnd.length;
      const newline = this.pending.indexOf("\n", afterMarker);
      if (newline === -1 && !flush) {
        this.pending = this.pending.slice(end);
        return output;
      }
      this.pending = this.pending.slice(newline === -1 ? afterMarker : newline);
      this.privateKeyEnd = null;
    }

    while (true) {
      const safeCut = flush
        ? this.pending.length
        : Math.max(0, this.pending.length - this.holdbackCharacters);
      const privateKey = this.findFirstPrivateKey();

      if (privateKey && (flush || privateKey.start < safeCut)) {
        output += this.redactPrefix(privateKey.start);
        this.pending = this.pending.slice(privateKey.start + privateKey.begin.length);
        this.detected.add("private-key");
        output += "[REDACTED:private-key]";
        this.privateKeyEnd = privateKey.end;
        output += this.drain(flush);
        return output;
      }

      if (safeCut === 0) return output;
      const completeCut = this.extendCutThroughBoundedSecret(safeCut);
      output += this.redactPrefix(completeCut);
      this.pending = this.pending.slice(completeCut);
      if (!flush) return output;
      if (this.pending.length === 0) return output;
    }
  }

  private findFirstPrivateKey():
    | { readonly start: number; readonly begin: string; readonly end: string }
    | undefined {
    let first:
      | { readonly start: number; readonly begin: string; readonly end: string }
      | undefined;
    for (const marker of PRIVATE_KEY_MARKERS) {
      const start = this.pending.indexOf(marker.begin);
      if (start !== -1 && (!first || start < first.start)) {
        first = { start, begin: marker.begin, end: marker.end };
      }
    }
    return first;
  }

  private extendCutThroughBoundedSecret(initialCut: number): number {
    let cut = initialCut;
    let extended = true;
    while (extended) {
      extended = false;
      for (const definition of PATTERNS) {
        definition.pattern.lastIndex = 0;
        for (const match of this.pending.matchAll(definition.pattern)) {
          const start = match.index;
          const end = start + match[0].length;
          if (start < cut && end > cut) {
            cut = end;
            extended = true;
          }
        }
      }
    }
    return cut;
  }

  private redactPrefix(length: number): string {
    const result = redactSecrets(this.pending.slice(0, length));
    for (const type of result.detectedTypes) this.detected.add(type);
    return result.text;
  }
}
