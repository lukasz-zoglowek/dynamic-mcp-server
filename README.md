# dynamic-mcp-server
Dynamic MCP server demonstrating runtime tool mutation, now using the MCP Streamable HTTP transport (SSE + JSON-RPC over HTTP) instead of stdio.

## Features
- Dynamic creation/removal of tools after each invocation
- Follow-up, milestone, and history tools appear based on call count
- HTTP streaming via Server-Sent Events (SSE) per MCP Streamable HTTP spec
- Optional dedicated GET /mcp SSE stream for notifications

## Running
```bash
node ./src/index.js
```
Environment variables:
- `PORT` or `MCP_PORT` (default: 3000)
- `HOST` (default: 0.0.0.0)

Server listens at: `http://HOST:PORT/mcp`

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
- Each tool call may create new `followup_...` tools and purge older ones.
- Milestone tools appear every 5 calls, history tools every 3 calls.
- Ensure you always send both `application/json` and `text/event-stream` in `Accept` for POST.
- For non-initial requests include both `Mcp-Session-Id` and `Mcp-Protocol-Version` headers.

## Stopping the session
```bash
curl -X DELETE \
	-H "Mcp-Session-Id: <session id>" \
	-H "Mcp-Protocol-Version: 2025-03-26" \
	http://localhost:3000/mcp
```

---
Migrated from stdio transport to Streamable HTTP transport.
