# dynamic-mcp-server
Dynamic MCP (Model Context Protocol) server demonstrating runtime tool mutation using the MCP Streamable HTTP transport (SSE + JSON-RPC over HTTP).

## Features
- **Dynamic Tool Evolution**: Tools are created and modified in response to user interactions
- **Session-based**: Each client gets a unique session with isolated tool state
- **Progressive Tool Unlocking**: New tools become available after using the initial "greet" tool
- **HTTP Streaming**: Uses Server-Sent Events (SSE) per MCP Streamable HTTP specification
- **Real-time Notifications**: Clients are notified when the tool list changes

## How It Works
1. **Initial State**: Server starts with only a "greet" tool available
2. **Tool Unlock**: After calling "greet", three additional tools become available:
   - `calculate`: Performs basic mathematical operations
   - `get_status`: Shows server statistics and available tools
   - `followup`: Executes follow-up actions
3. **Session Management**: Each client session maintains its own tool state and call count

## Running
```bash
node ./src/index.js
```

Server listens at: `http://localhost:3000/mcp`

## Making Requests
Initialization (must be first, obtains session id):
```bash
curl -i \
	-H "Content-Type: application/json" \
	-H "Accept: application/json, text/event-stream" \
	-d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{}}}' \
	http://localhost:3000/mcp
```
Copy the `mcp-session-id` header from the response.

List tools:
```bash
curl -N \
	-H "Content-Type: application/json" \
	-H "Accept: application/json, text/event-stream" \
	-H "Mcp-Session-Id: <session id>" \
	-H "Mcp-Protocol-Version: 2025-03-26" \
	-d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
	http://localhost:3000/mcp
```

Call a tool (example greet):
```bash
curl -N \
	-H "Content-Type: application/json" \
	-H "Accept: application/json, text/event-stream" \
	-H "Mcp-Session-Id: <session id>" \
	-H "Mcp-Protocol-Version: 2025-03-26" \
	-d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"greet","arguments":{"name":"Alice"}}}' \
	http://localhost:3000/mcp
```

Open a dedicated SSE stream (optional) for asynchronous notifications:
```bash
curl -N \
	-H "Accept: text/event-stream" \
	-H "Mcp-Session-Id: <session id>" \
	-H "Mcp-Protocol-Version: 2025-03-26" \
	http://localhost:3000/mcp
```

## Notes
- **Tool Evolution**: Each session starts with only the "greet" tool. Additional tools unlock after greeting.
- **Session Isolation**: Each client session maintains its own tool state and call count.
- **Progressive Discovery**: The server demonstrates how MCP tools can dynamically evolve based on usage patterns.
- **Headers Required**: Always include both `application/json` and `text/event-stream` in `Accept` for POST requests.
- **Session Headers**: For non-initial requests include both `Mcp-Session-Id` and `Mcp-Protocol-Version` headers.

## Architecture
- **HTTP Server**: Express.js server handling MCP protocol over HTTP
- **Session Management**: UUID-based sessions with isolated tool states
- **Transport Layer**: StreamableHTTPServerTransport for real-time communication
- **Dynamic Tools**: Runtime tool modification with client notifications

## Stopping the session
```bash
curl -X DELETE \
	-H "Mcp-Session-Id: <session id>" \
	-H "Mcp-Protocol-Version: 2025-03-26" \
	http://localhost:3000/mcp
```

---
Migrated from stdio transport to Streamable HTTP transport.
