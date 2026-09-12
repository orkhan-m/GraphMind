import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SubgraphMcpClient } from "./mcpClient.js";
import { GraphMindAgent } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const gatewayApiKey = process.env.GATEWAY_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4o";
const port = Number(process.env.PORT) || 3000;

if (!gatewayApiKey) {
  console.error(
    "Missing GATEWAY_API_KEY. Get one from https://thegraph.com/studio/ and add it to your .env file.",
  );
  process.exit(1);
}
if (!openaiApiKey) {
  console.error("Missing OPENAI_API_KEY. Add it to your .env file.");
  process.exit(1);
}

const mcp = new SubgraphMcpClient(gatewayApiKey);
const agent = new GraphMindAgent(openaiApiKey, mcp, model);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/chat", async (req, res) => {
  const question = (req.body?.question ?? "").toString().trim();
  if (!question) {
    res.status(400).json({ error: "Missing 'question' in request body." });
    return;
  }

  try {
    const answer = await agent.ask(question);
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

async function start() {
  console.log("Connecting to The Graph Subgraph MCP server...");
  await agent.init();
  app.listen(port, () => {
    console.log(`GraphMind web UI running at http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
