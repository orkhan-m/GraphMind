# GraphMind

A natural-language DeFi research assistant. Ask questions like _"show me the
top lending pools by TVL"_ or _"compare Uniswap vs Sushiswap volume this
week"_ — GraphMind uses [The Graph's Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/)
to fetch live onchain data and an LLM agent to reason over it and answer in
plain English.

Built for the **ETHGlobal hackathon**, targeting **The Graph — Best AI Use
Case (From Scratch)**.

## How it works

```
you ask a question
      │
      ▼
 OpenAI agent (function calling)
      │  decides which MCP tool to call
      ▼
 Subgraph MCP (thegraph.com, hosted, SSE)
      │  search subgraphs / fetch schema / run GraphQL query
      ▼
 live onchain data
      │
      ▼
 agent reasons over the data (compare, summarize, flag risk)
      │
      ▼
 natural-language answer + comparison table
```

- No smart contracts, no deployments, no wallets — this project only talks to
  The Graph's hosted Subgraph MCP server and an LLM.
- The MCP server does the GraphQL heavy lifting (schema discovery, subgraph
  search, query execution); the agent decides _what_ to ask for and _how_ to
  interpret the results.

## Prerequisites

- Node.js 18+
- A **Gateway API key** from [Subgraph Studio](https://thegraph.com/studio/) (free)
- An **OpenAI API key**

## Setup

```bash
npm install
cp .env.example .env
# then fill in GATEWAY_API_KEY and OPENAI_API_KEY in .env
```

## Run — Web UI (recommended for demos)

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser — a
simple chat interface where you type a question and see GraphMind's reasoned
answer.

## Run — CLI (alternative)

```bash
npm run cli
```

Starts an interactive terminal chat instead of the web UI.

### Example prompts to try

- "What are the top 5 lending pools by TVL on Aave?"
- "Compare Uniswap v3 and Sushiswap swap volume over the last week."
- "Find the top subgraph for contract 0x1f98431c8ad98523631ae4a59f267346ea31f984 on arbitrum-one and tell me its 30-day query volume."

## Project structure

- [src/mcpClient.ts](src/mcpClient.ts) — thin wrapper around the MCP SDK, connects to The Graph's hosted Subgraph MCP over SSE.
- [src/agent.ts](src/agent.ts) — OpenAI tool-calling loop: exposes MCP tools to the model, executes tool calls, feeds results back until the model produces a final reasoned answer.
- [src/server.ts](src/server.ts) — Express server exposing a `/api/chat` endpoint and serving the web UI.
- [src/cli.ts](src/cli.ts) — interactive CLI chat entry point (alternative to the web UI).
- [public/](public/) — static chat frontend (HTML/CSS/vanilla JS) served by the Express server.

## License

MIT
