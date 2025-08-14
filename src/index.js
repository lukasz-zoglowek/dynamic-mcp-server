#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError
} from "@modelcontextprotocol/sdk/types.js";

class DynamicMCPServer {
    constructor() {
        this.server = new Server(
            {
                name: "dynamic-tools-demo",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {
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

    setupHandlers() {
        // Handle tools/list requests
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = Array.from(this.tools.entries()).map(([name, config]) => ({
                name,
                description: config.description,
                inputSchema: config.schema
            }));

            console.error(`[Server] Returning ${tools.length} tools`);
            return { tools };
        });

        // Handle tools/call requests
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

                // Dynamic behavior: modify tools after each call
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

    registerInitialTools() {
        console.error("[Server] Registering initial tools");

        this.addTool("calculate", {
            schema: {
                type: "object",
                properties: {
                    expression: {
                        type: "string",
                        description: "Mathematical expression (e.g., '5 + 3')"
                    },
                    operation: {
                        type: "string",
                        enum: ["add", "subtract", "multiply", "divide"],
                        description: "Type of operation"
                    }
                },
                required: ["expression", "operation"]
            },
            description: "Perform basic mathematical calculations",
            handler: async ({ expression, operation }) => {
                const result = this.evaluateExpression(expression, operation);
                return {
                    content: [{
                        type: "text",
                        text: `Calculation: ${expression} (${operation}) = ${result}`
                    }]
                };
            }
        }, false); // Don't notify during initial setup

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
        }, false);

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
        }, false);
    }

    addTool(name, config, notify = false) {
        this.tools.set(name, config);
        console.error(`[Server] Added tool: ${name}`);

        if (notify) {
            this.notifyToolsChanged();
        }
    }

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

    async updateToolsAfterCall(calledTool) {
        const timestamp = Date.now();

        // Add a new contextual tool based on the call
        const newToolName = `followup_${timestamp}`;
        this.addTool(newToolName, {
            schema: {
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        description: "Action to take as followup"
                    },
                    details: {
                        type: "string",
                        description: "Additional details for the action"
                    }
                },
                required: ["action"]
            },
            description: `Followup tool created after calling '${calledTool}' (call #${this.callCount})`,
            handler: async ({ action, details }) => ({
                content: [{
                    type: "text",
                    text: `Executing followup action: ${action}${details ? ` - ${details}` : ''}\n(This tool was created after calling '${calledTool}')`
                }]
            })
        });

        // Remove old followup tools to keep the list manageable
        const followupTools = Array.from(this.tools.keys())
            .filter(name => name.startsWith("followup_"))
            .sort()
            .slice(0, -3); // Keep only the last 3 followup tools

        followupTools.forEach(toolName => {
            this.removeTool(toolName, false); // Don't notify for each removal
        });

        // Every 5th call, add a special milestone tool
        if (this.callCount % 5 === 0) {
            this.addTool(`milestone_${this.callCount}`, {
                schema: {
                    type: "object",
                    properties: {
                        celebration: {
                            type: "string",
                            description: "How to celebrate this milestone"
                        }
                    },
                    required: ["celebration"]
                },
                description: `Milestone celebration tool for reaching ${this.callCount} calls!`,
                handler: async ({ celebration }) => ({
                    content: [{
                        type: "text",
                        text: `🎉 Milestone ${this.callCount} reached! Celebration: ${celebration}\n\nYou've made ${this.callCount} tool calls total!`
                    }]
                })
            });
        }

        // Every 3rd call, add a tool that references call history
        if (this.callCount % 3 === 0) {
            this.addTool(`history_${this.callCount}`, {
                schema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "What to know about the call history"
                        }
                    },
                    required: ["query"]
                },
                description: `History tool - knows about your ${this.callCount} calls`,
                handler: async ({ query }) => ({
                    content: [{
                        type: "text",
                        text: `Call History Query: "${query}"\n\nResponse: You've made ${this.callCount} calls total. The last tool called was '${calledTool}'. This server demonstrates dynamic tool creation!`
                    }]
                })
            });
        }

        // Final notification after all changes
        this.notifyToolsChanged();
    }

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

    evaluateExpression(expression, operation) {
        try {
            // Simple expression evaluation - in production, use a proper math parser
            const parts = expression.replace(/\s+/g, '').split(/[\+\-\*\/]/);
            if (parts.length !== 2) return "Invalid expression format";

            const a = parseFloat(parts[0]);
            const b = parseFloat(parts[1]);

            if (isNaN(a) || isNaN(b)) return "Invalid numbers in expression";

            switch (operation) {
                case "add": return (a + b).toString();
                case "subtract": return (a - b).toString();
                case "multiply": return (a * b).toString();
                case "divide":
                    if (b === 0) return "Cannot divide by zero";
                    return (a / b).toString();
                default: return "Unknown operation";
            }
        } catch (error) {
            return `Error: ${error.message}`;
        }
    }

    async start() {
        const transport = new StdioServerTransport();
        console.error("[Server] Starting Dynamic MCP Server...");

        await this.server.connect(transport);
        console.error("[Server] Server connected via STDIO transport");
        console.error(`[Server] Initial tools registered: ${Array.from(this.tools.keys()).join(', ')}`);
    }
}

// Start the server
const server = new DynamicMCPServer();
server.start().catch(error => {
    console.error("[Server] Failed to start:", error);
});