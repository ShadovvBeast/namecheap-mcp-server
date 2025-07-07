#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import our tools
import { domainTools } from './tools/domains.js';
import { dnsTools } from './tools/dns.js';
import { utilityTools } from './tools/utilities.js';

// Import our resources
import { domainListResource } from './resources/domain-list.js';
import { domainAvailabilityResource } from './resources/domain-availability.js';

// Import our prompts
import { dnsSetupPrompts } from './prompts/dns-setup.js';

// Validate environment variables
const requiredEnvVars = ['NAMECHEAP_API_USER', 'NAMECHEAP_API_KEY', 'NAMECHEAP_CLIENT_IP'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Create the MCP server
const server = new Server(
  {
    name: 'namecheap-mcp-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Combine all tools
const allTools = [...domainTools, ...dnsTools, ...utilityTools];

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  const tool = allTools.find(t => t.name === name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  try {
    const result = await tool.execute(args);
    return result;
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    };
  }
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: domainListResource.uri,
        name: domainListResource.name,
        description: domainListResource.description,
        mimeType: domainListResource.mimeType,
      },
      {
        uri: domainAvailabilityResource.uri,
        name: domainAvailabilityResource.name,
        description: domainAvailabilityResource.description,
        mimeType: domainAvailabilityResource.mimeType,
      },
    ],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === domainListResource.uri) {
    const content = await domainListResource.read();
    return {
      contents: [
        {
          uri,
          mimeType: domainListResource.mimeType,
          text: content,
        },
      ],
    };
  }

  // Dynamic domain availability resource
  if (domainAvailabilityResource.matchesUri(uri)) {
    const domainsPart = domainAvailabilityResource.extractDomains(uri);
    const content = await domainAvailabilityResource.read(domainsPart);
    return {
      contents: [
        {
          uri,
          mimeType: domainAvailabilityResource.mimeType,
          text: content,
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: dnsSetupPrompts.map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments,
    })),
  };
});

// Get prompt details
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const prompt = dnsSetupPrompts.find(p => p.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return await prompt.getMessages(args);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Namecheap MCP Server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
}); 