import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/mcp/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTempRepo, type TempRepo } from "../helpers/temp-repo.js";

let repo: TempRepo | undefined;
afterEach(async () => { await repo?.cleanup(); repo = undefined; });
describe("MCP log integrity", () => {
  it("reports corrupt history as a tool error, not successful empty history", async () => {
    repo = await createTempRepo();
    const server = createServer();
    const client = new Client({ name: "log-integrity-test", version: "1" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const missing = await client.callTool({ name: "safe_change_log", arguments: { cwd: repo.path } });
      expect(missing.isError).not.toBe(true);
      await repo.writeFile(".safe-change/log.json", "private-broken-content");
      const broken = await client.callTool({ name: "safe_change_log", arguments: { cwd: repo.path } });
      expect(broken.isError).toBe(true);
      const text = (broken.content as Array<{ text?: string }>).map(item => item.text ?? "").join("");
      expect(text).toMatch(/corrupt/);
      expect(text).not.toContain("private-broken-content");
    } finally { await client.close(); await server.close(); }
  });
});
