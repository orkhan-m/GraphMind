import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { SubgraphMcpClient } from "./mcpClient.js";
import { GraphMindAgent } from "./agent.js";

async function main() {
  const gatewayApiKey = process.env.GATEWAY_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

  console.log("Connecting to The Graph Subgraph MCP server...");
  await agent.init();
  console.log(
    'GraphMind is ready. Ask a DeFi question (e.g. "compare Uniswap v3 and Sushiswap volume this week"). Type "exit" to quit.\n',
  );

  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const question = await rl.question("you> ");
      if (!question.trim()) continue;
      if (["exit", "quit"].includes(question.trim().toLowerCase())) break;

      try {
        const answer = await agent.ask(question);
        console.log(`\ngraphmind> ${answer}\n`);
      } catch (err) {
        console.error("Error:", (err as Error).message);
      }
    }
  } finally {
    rl.close();
    await mcp.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
