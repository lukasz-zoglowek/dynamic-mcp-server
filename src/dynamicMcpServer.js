#!/usr/bin/env node

/**
 * Dynamic MCP Server Implementation
 * 
 * This class implements a Model Context Protocol (MCP) server that demonstrates
 * dynamic tool evolution. The server starts with a single "greet" tool and
 * progressively unlocks additional tools based on user interactions.
 * 
 * Key Features:
 * - Progressive tool unlocking (greet → calculate, get_status, followup)
 * - Session-isolated state management (call counts, tool availability)
 * - Real-time client notifications when tool list changes
 * - Safe mathematical expression evaluation
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from "@modelcontextprotocol/sdk/types.js";

export class DynamicMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: "dynamic-tools-demo",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {
                        // Enable notifications when tool list changes
                        listChanged: true
                    },
                },
            }
        );

        this.tools = new Map();
        this.callCount = 0;
        this.setupHandlers();
        this.registerInitialTools();
    }

    /**
     * Configure MCP protocol request handlers
     * 
     * Sets up handlers for the two main MCP tool operations:
     * - tools/list: Return available tools to the client
     * - tools/call: Execute a specific tool with provided arguments
     */
    setupHandlers() {
        // Handle tools/list requests - return current available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = Array.from(this.tools.entries()).map(([name, config]) => ({
                name,
                description: config.description,
                inputSchema: config.schema
            }));

            console.error(`[Server] Returning ${tools.length} tools`);
            return { tools };
        });

        // Handle tools/call requests - execute tools and trigger dynamic behavior
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            const tool = this.tools.get(name);

            if (!tool) {
                throw new McpError(ErrorCode.MethodNotFound, `Tool '${name}' not found`);
            }

            try {
                this.callCount++;
                console.error(`[Server] Executing tool '${name}' (call #${this.callCount})`);

                const result = await tool.handler(args || {});

                // Dynamic behavior: modify available tools after each call
                await this.updateToolsAfterCall(name);

                return result;
            } catch (error) {
                console.error(`[Server] Tool execution error:`, error);
                return {
                    content: [{
                        type: "text",
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    /**
     * Register the initial tool set
     * 
     * The server starts with only the "greet" tool available.
     * This demonstrates the progressive tool unlocking concept.
     */
    registerInitialTools() {
        console.error("[Server] Registering initial tools");

        // The only tool available at startup - the gateway to unlocking others
        this.addTool("greet", {
            schema: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Name of the person to greet"
                    }
                },
                required: ["name"]
            },
            description: "Generate a personalized greeting",
            handler: async ({ name }) => ({
                content: [{
                    type: "text",
                    text: `Hello, ${name}! This server has been called ${this.callCount} times.`
                }]
            })
        }, false); // Don't notify on initial registration
    }

    /**
     * Add a tool to the registry
     * 
     * @param {string} name - Tool identifier
     * @param {Object} config - Tool configuration (schema, description, handler)
     * @param {boolean} notify - Whether to notify clients of tool list changes
     */
    addTool(name, config, notify = false) {
        this.tools.set(name, config);
        console.error(`[Server] Added tool: ${name}`);

        if (notify) {
            this.notifyToolsChanged();
        }
    }

    /**
     * Remove a tool from the registry
     * 
     * @param {string} name - Tool identifier to remove
     * @param {boolean} notify - Whether to notify clients of tool list changes
     * @returns {boolean} - Whether the tool was successfully removed
     */
    removeTool(name, notify = false) {
        const removed = this.tools.delete(name);
        if (removed) {
            console.error(`[Server] Removed tool: ${name}`);
            if (notify) {
                this.notifyToolsChanged();
            }
        }
        return removed;
    }

    /**
     * Dynamic tool evolution logic
     * 
     * This method implements the core dynamic behavior of the server.
     * When specific tools are called, it unlocks new capabilities.
     * 
     * @param {string} calledTool - The name of the tool that was just executed
     */
    async updateToolsAfterCall(calledTool) {
        // Tool unlocking: After greeting, make additional tools available
        if (calledTool === "greet") {
            this.addTool("calculate", {
                schema: {
                    type: "object",
                    properties: {
                        expression: {
                            type: "string",
                            description: "Mathematical expression (e.g., '5 + 3', '10 - 2', '4 * 6', '8 / 2')"
                        }
                    },
                    required: ["expression"]
                },
                description: "Perform basic mathematical calculations",
                handler: async ({ expression }) => {
                    const result = this.evaluateExpression(expression);
                    return {
                        content: [{
                            type: "text",
                            text: `Calculation: ${expression} = ${result}`
                        }]
                    };
                }
            });

            this.addTool("get_status", {
                schema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false
                },
                description: "Get current server status and tool count",
                handler: async () => ({
                    content: [{
                        type: "text",
                        text: `Server Status:\n- Total calls: ${this.callCount}\n- Available tools: ${this.tools.size}\n- Tools: ${Array.from(this.tools.keys()).join(', ')}`
                    }]
                })
            });

            this.addTool("followup", {
                schema: {
                    type: "object",
                    properties: {
                        action: {
                            type: "string",
                            description: "Action to take as a followup"
                        },
                        details: {
                            type: "string",
                            description: "Additional details for the action"
                        }
                    },
                    required: ["action"]
                },
                description: "Execute a followup action after greeting",
                handler: async ({ action, details }) => ({
                    content: [{
                        type: "text",
                        text: `Executing followup action: ${action}${details ? ` - ${details}` : ''}\n(This followup tool was unlocked after greeting!)`
                    }]
                })
            });

            this.notifyToolsChanged();
        }
    }

    /**
     * Send notification to clients when tool list changes
     * 
     * Uses the MCP protocol's notification system to inform clients
     * that they should refresh their tool list. This enables real-time
     * discovery of new capabilities.
     */
    async notifyToolsChanged() {
        try {
            await this.server.notification({
                method: "notifications/tools/list_changed"
            });
            console.error(`[Server] Sent tools/list_changed notification (${this.tools.size} tools available)`);
        } catch (error) {
            console.error(`[Server] Failed to send notification:`, error);
        }
    }

    /**
     * Connect the MCP server to a transport layer
     * 
     * @param {Transport} transport - MCP transport implementation (HTTP, stdio, etc.)
     */
    async connect(transport) {
        console.error("[Server] Starting Dynamic MCP Server...");
        await this.server.connect(transport);
    }

    /**
     * Safe mathematical expression evaluator
     * 
     * Evaluates basic mathematical expressions without using eval() for security.
     * Supports: addition (+), subtraction (-), multiplication (*), division (/)
     * 
     * @param {string} expression - Mathematical expression to evaluate
     * @returns {string} - Calculation result or error message
     */
    evaluateExpression(expression) {
        try {
            // Remove all whitespace for easier parsing
            const cleanExpression = expression.replace(/\s+/g, '');
            
            // Parse the expression to find operator and operands
            let operator = null;
            let parts = null;
            
            // Check for operators in order of precedence
            // Note: Handle negative numbers by checking operator position
            if (cleanExpression.includes('+')) {
                operator = '+';
                parts = cleanExpression.split('+');
            } else if (cleanExpression.includes('-') && cleanExpression.indexOf('-') > 0) {
                operator = '-';
                parts = cleanExpression.split('-');
            } else if (cleanExpression.includes('*')) {
                operator = '*';
                parts = cleanExpression.split('*');
            } else if (cleanExpression.includes('/')) {
                operator = '/';
                parts = cleanExpression.split('/');
            } else {
                return "No valid operator found (+, -, *, /)";
            }
            
            if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
                return "Invalid expression format";
            }

            const a = parseFloat(parts[0]);
            const b = parseFloat(parts[1]);

            if (isNaN(a) || isNaN(b)) {
                return "Invalid numbers in expression";
            }

            switch (operator) {
                case '+': return (a + b).toString();
                case '-': return (a - b).toString();
                case '*': return (a * b).toString();
                case '/':
                    if (b === 0) return "Cannot divide by zero";
                    return (a / b).toString();
                default: return "Unknown operation";
            }
        } catch (error) {
            return `Error: ${error.message}`;
        }
    }
}