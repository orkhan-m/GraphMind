import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { SubgraphMcpClient, type McpToolDefinition } from "./mcpClient.js";

const SYSTEM_PROMPT = `You are GraphMind, a natural-language DeFi research assistant.

You have access to live blockchain data through The Graph's Subgraph MCP tools:
you can search for relevant Subgraphs, fetch their GraphQL schemas, and execute
GraphQL queries against them to pull real onchain data (TVL, volume, swaps,
lending pools, token prices, etc.).

When answering a question:
1. Figure out which Subgraph(s) are relevant (search by keyword/contract if you
   don't already know the deployment or subgraph ID).
2. Fetch the schema before writing a query if you are not sure of the field
   names — never guess a GraphQL schema. Only fetch a given schema ONCE per
   subgraph and reuse it from the conversation instead of re-fetching.
3. Execute the query to get real data. If a query fails because a field
   doesn't exist, re-read the schema you already fetched instead of guessing
   another field name.
4. REASON over the results — don't just dump raw JSON. Summarize, compare,
   compute deltas/percentages, flag anomalies or risk, and highlight the
   headline answer first.
5. If comparing multiple protocols/pools, present a compact comparison table.
6. Be explicit about the timeframe and data source (subgraph name/id) you used.
7. If you are unable to get the exact data requested after a few attempts,
   say so plainly and summarize whatever partial data you did find — never
   change the subject or propose an unrelated question.

Keep answers concise, data-driven, and cite the numbers you pulled.`;

function toOpenAiTools(mcpTools: McpToolDefinition[]): ChatCompletionTool[] {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema,
    },
  }));
}

// Tool results (especially query results with many rows) can be huge and
// blow past per-minute token limits. Cap what we feed back to the model,
// but never truncate schema responses — the model needs the full schema to
// pick correct field names, otherwise it hallucinates fields and loops.
const MAX_TOOL_RESULT_CHARS = 6000;
const MAX_SCHEMA_RESULT_CHARS = 40000;

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n...[truncated ${text.length - limit} chars]`;
}

// Only keep the system prompt + the most recent N messages to bound the
// context size sent on every turn (schema/query results add up fast).
const MAX_HISTORY_MESSAGES = 16;

export class GraphMindAgent {
  private openai: OpenAI;
  private history: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  private tools: ChatCompletionTool[] = [];

  constructor(
    openaiApiKey: string,
    private mcp: SubgraphMcpClient,
    private model = "gpt-4o-mini",
  ) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  async init(): Promise<void> {
    await this.mcp.connect();
    const mcpTools = await this.mcp.listTools();
    this.tools = toOpenAiTools(mcpTools);
  }

  private trimHistory(): void {
    if (this.history.length <= MAX_HISTORY_MESSAGES + 1) return;
    const [system, ...rest] = this.history;

    // OpenAI requires every 'tool' message to immediately follow the
    // assistant message that requested it. Naively slicing by count can
    // orphan a 'tool' message at the start of the trimmed history, which
    // OpenAI rejects with a 400. Only cut right before a 'user' message,
    // since that always marks the start of a fresh, self-contained turn.
    let cutIndex = rest.length - MAX_HISTORY_MESSAGES;
    while (cutIndex < rest.length && rest[cutIndex].role !== "user") {
      cutIndex++;
    }

    this.history = [system, ...rest.slice(cutIndex)];
  }

  async ask(question: string): Promise<string> {
    this.history.push({ role: "user", content: question });

    // Tool-calling loop: keep letting the model call MCP tools until it
    // produces a final natural-language answer.
    for (let step = 0; step < 12; step++) {
      this.trimHistory();

      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: this.history,
        tools: this.tools,
      });

      const message = completion.choices[0].message;
      this.history.push(message as ChatCompletionMessageParam);

      const toolCalls = message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return message.content ?? "";
      }

      for (const call of toolCalls) {
        const args = call.function.arguments
          ? JSON.parse(call.function.arguments)
          : {};

        console.log(`[MCP] calling tool: ${call.function.name}`, args);

        let toolResult: string;
        try {
          const raw = await this.mcp.callTool(call.function.name, args);
          const limit = call.function.name.includes("schema")
            ? MAX_SCHEMA_RESULT_CHARS
            : MAX_TOOL_RESULT_CHARS;
          toolResult = truncate(raw, limit);
          console.log(
            `[MCP] result from ${call.function.name} (${raw.length} chars):`,
            toolResult.slice(0, 500),
          );
        } catch (err) {
          toolResult = `Error calling tool ${call.function.name}: ${
            (err as Error).message
          }`;
          console.error(`[MCP] error calling ${call.function.name}:`, err);
        }

        this.history.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolResult,
        });
      }
    }

    // Ran out of reasoning steps. Force a final answer (no more tool calls)
    // summarizing whatever data was gathered, instead of dead-ending.
    this.history.push({
      role: "user",
      content:
        "You've used all your tool-calling attempts. Based on everything gathered so far, give your best final answer now without calling any more tools. If the data is incomplete, say so explicitly.",
    });
    const finalCompletion = await this.openai.chat.completions.create({
      model: this.model,
      messages: this.history,
    });
    const finalMessage = finalCompletion.choices[0].message;
    this.history.push(finalMessage as ChatCompletionMessageParam);
    return (
      finalMessage.content ??
      "I couldn't complete the research within the allotted reasoning steps. Try a narrower question."
    );
  }
}
