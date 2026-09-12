import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const SUBGRAPH_MCP_URL = "https://subgraphs.mcp.thegraph.com/sse";

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Thin wrapper around the MCP SDK client, pre-configured to talk to
 * The Graph's hosted Subgraph MCP server over SSE with a Gateway API key.
 */
export class SubgraphMcpClient {
  private client: Client;
  private connected = false;

  constructor(private gatewayApiKey: string) {
    this.client = new Client(
      { name: "graphmind", version: "0.1.0" },
      { capabilities: {} },
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const transport = new SSEClientTransport(new URL(SUBGRAPH_MCP_URL), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.gatewayApiKey}`,
        },
      },
    });

    await this.client.connect(transport);
    this.connected = true;
  }

  async listTools(): Promise<McpToolDefinition[]> {
    const { tools } = await this.client.listTools();
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;

    return content
      .map((item) =>
        item.type === "text" ? (item.text ?? "") : JSON.stringify(item),
      )
      .join("\n");
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }
}
