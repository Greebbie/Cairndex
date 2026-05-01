/** Wire-format types matching MCP. Defined locally so the pure handlers don't depend on the SDK. */

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ListResourcesResult {
  resources: McpResource[];
}

export interface ReadResourceResult {
  contents: McpResourceContents[];
}

export interface ListToolsResult {
  tools: McpTool[];
}
