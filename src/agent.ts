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
   names — never guess a GraphQL schema.
3. Execute the query to get real data.
4. REASON over the results — don't just dump raw JSON. Summarize, compare,
   compute deltas/percentages, flag anomalies or risk, and highlight the
   headline answer first.
5. If comparing multiple protocols/pools, present a compact comparison table.
6. Be explicit about the timeframe and data source (subgraph name/id) you used.

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

export class GraphMindAgent {
  private openai: OpenAI;
  private history: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  private tools: ChatCompletionTool[] = [];

  constructor(
    openaiApiKey: string,
    private mcp: SubgraphMcpClient,
    private model = "gpt-4o",
  ) {
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  async init(): Promise<void> {
    await this.mcp.connect();
    const mcpTools = await this.mcp.listTools();
    this.tools = toOpenAiTools(mcpTools);
  }

  async ask(question: string): Promise<string> {
    this.history.push({ role: "user", content: question });

    // Tool-calling loop: keep letting the model call MCP tools until it
    // produces a final natural-language answer.
    for (let step = 0; step < 8; step++) {
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

        let toolResult: string;
        try {
          toolResult = await this.mcp.callTool(call.function.name, args);
        } catch (err) {
          toolResult = `Error calling tool ${call.function.name}: ${
            (err as Error).message
          }`;
        }

        this.history.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolResult,
        });
      }
    }

    return "I couldn't complete the research within the allotted reasoning steps. Try a narrower question.";
  }
}
