/**
 * Dynamic MCP Server - HTTP Transport Implementation
 * 
 * This server implements the Model Context Protocol (MCP) using HTTP transport
 * with Server-Sent Events (SSE) for real-time communication. It demonstrates
 * dynamic tool evolution where tools become available based on user interactions.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { DynamicMCPServer } from "./dynamicMcpServer.js";

// Initialize Express.js HTTP server
const app = express();
app.use(express.json());

// Session storage: Maps session IDs to their corresponding MCP transports
// Each session maintains its own tool state and call history
const transports = {};

/**
 * POST /mcp - Main MCP protocol endpoint
 * 
 * Handles all MCP JSON-RPC requests including:
 * - Session initialization (first request without session ID)
 * - Tool listing and invocation (subsequent requests with session ID)
 * 
 * Session Management:
 * - New sessions are created on initialize requests
 * - Existing sessions are reused based on mcp-session-id header
 * - Each session gets its own DynamicMCPServer instance with isolated state
 */
app.post('/mcp', async (req, res) => {
  // Extract session ID from request headers
  const sessionId = req.headers['mcp-session-id'];
  let transport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport for established session
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // Create new session for initialization request
    transport = new StreamableHTTPServerTransport({
      // Generate unique session identifier
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        // Store transport for future requests from this session
        transports[sessionId] = transport;
      },
      // Security note: DNS rebinding protection is disabled for development
      // In production, enable with:
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });

    // Clean up session when client disconnects
    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };
    
    // Create new MCP server instance for this session
    const server = new DynamicMCPServer();
    // Connect the server to the HTTP transport
    await server.connect(transport);
  } else {
    // Reject invalid requests (no session ID and not an initialize request)
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Forward request to MCP transport for processing
  await transport.handleRequest(req, res, req.body);
});

/**
 * Shared request handler for GET and DELETE endpoints
 * 
 * Validates session ID and forwards requests to appropriate transport.
 * Used for SSE streams and session termination.
 */
const handleSessionRequest = async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

/**
 * GET /mcp - Server-Sent Events (SSE) endpoint
 * 
 * Establishes a persistent connection for receiving real-time notifications
 * from the server, such as tool list changes. This is optional but recommended
 * for dynamic MCP servers that modify their capabilities at runtime.
 */
app.get('/mcp', handleSessionRequest);

/**
 * DELETE /mcp - Session termination endpoint
 * 
 * Allows clients to explicitly close their MCP session and clean up resources.
 * The transport cleanup will automatically remove the session from memory.
 */
app.delete('/mcp', handleSessionRequest);

/**
 * Start the HTTP server on port 3000
 * 
 * The server accepts MCP protocol requests at http://localhost:3000/mcp
 * Each client session maintains its own tool state and progression.
 */
app.listen(3000);