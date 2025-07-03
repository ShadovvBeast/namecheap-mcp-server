import { z } from 'zod';
import { NamecheapClient } from '../namecheap-client.js';

// Initialize Namecheap client
const getClient = () => new NamecheapClient({
  apiUser: process.env.NAMECHEAP_API_USER!,
  apiKey: process.env.NAMECHEAP_API_KEY!,
  clientIp: process.env.NAMECHEAP_CLIENT_IP!,
  sandbox: process.env.NAMECHEAP_SANDBOX === 'true',
});

// Tool interface for MCP
interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  execute: (args: any) => Promise<{ content: Array<{ type: string; text: string }> }>;
}

// Check domain availability tool
const checkDomainTool: Tool = {
  name: 'check-domain',
  description: 'Check if a domain name is available for registration',
  inputSchema: z.object({
    domain: z.string().describe('The domain name to check (e.g., example.com)'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const result = await client.checkDomain(args.domain);
      
      let message = `Domain: ${result.domain}\n`;
      message += `Available: ${result.available ? 'Yes' : 'No'}\n`;
      
      if (result.isPremium) {
        message += `Premium Domain: Yes\n`;
        message += `Premium Price: $${result.premiumPrice}\n`;
      }
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to check domain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Check multiple domains tool
const checkDomainsTool: Tool = {
  name: 'check-domains',
  description: 'Check availability of multiple domain names at once',
  inputSchema: z.object({
    domains: z.array(z.string()).describe('Array of domain names to check'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const results = await client.checkDomains(args.domains);
      
      let message = 'Domain Availability Check Results:\n\n';
      results.forEach(result => {
        message += `${result.domain}: ${result.available ? 'Available' : 'Not Available'}`;
        if (result.isPremium) {
          message += ` (Premium: $${result.premiumPrice})`;
        }
        message += '\n';
      });
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to check domains: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// List all domains tool
const listDomainsTool: Tool = {
  name: 'list-domains',
  description: 'List all domains in your Namecheap account',
  inputSchema: z.object({
    page: z.number().optional().default(1).describe('Page number (default: 1)'),
    pageSize: z.number().optional().default(20).describe('Number of domains per page (default: 20)'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const { domains, totalItems } = await client.listDomains(args.page, args.pageSize);
      
      let message = `Total Domains: ${totalItems}\n`;
      message += `Page: ${args.page} (showing ${domains.length} domains)\n\n`;
      
      domains.forEach(domain => {
        message += `Domain: ${domain.domainName}\n`;
        message += `  Created: ${domain.created}\n`;
        message += `  Expires: ${domain.expires}\n`;
        message += `  Auto-Renew: ${domain.isAutoRenew ? 'Yes' : 'No'}\n`;
        message += `  Locked: ${domain.isLocked ? 'Yes' : 'No'}\n`;
        message += `  WhoisGuard: ${domain.whoisGuard ? 'Enabled' : 'Disabled'}\n\n`;
      });
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to list domains: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Get domain info tool
const getDomainInfoTool: Tool = {
  name: 'get-domain-info',
  description: 'Get detailed information about a specific domain',
  inputSchema: z.object({
    domain: z.string().describe('The domain name to get information for'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const domainInfo = await client.getDomainInfo(args.domain);
      
      let message = `Domain Information for ${domainInfo.domainName}:\n\n`;
      message += `Created: ${domainInfo.created}\n`;
      message += `Expires: ${domainInfo.expires}\n`;
      message += `Auto-Renew: ${domainInfo.isAutoRenew ? 'Enabled' : 'Disabled'}\n`;
      message += `Domain Lock: ${domainInfo.isLocked ? 'Enabled' : 'Disabled'}\n`;
      message += `WhoisGuard: ${domainInfo.whoisGuard ? 'Enabled' : 'Disabled'}\n`;
      
      // Calculate days until expiration
      const expiryDate = new Date(domainInfo.expires);
      const today = new Date();
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry < 30) {
        message += `\n⚠️ WARNING: Domain expires in ${daysUntilExpiry} days!`;
      }
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to get domain info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Register domain tool (simplified version)
const registerDomainTool: Tool = {
  name: 'register-domain',
  description: 'Register a new domain (requires contact information)',
  inputSchema: z.object({
    domain: z.string().describe('The domain name to register'),
    years: z.number().optional().default(1).describe('Number of years to register for (default: 1)'),
    firstName: z.string().describe('Contact first name'),
    lastName: z.string().describe('Contact last name'),
    address: z.string().describe('Contact address'),
    city: z.string().describe('Contact city'),
    stateProvince: z.string().describe('Contact state/province'),
    postalCode: z.string().describe('Contact postal code'),
    country: z.string().describe('Contact country (2-letter code, e.g., US)'),
    phone: z.string().describe('Contact phone (format: +1.1234567890)'),
    email: z.string().email().describe('Contact email address'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      // First check if domain is available
      const availability = await client.checkDomain(args.domain);
      if (!availability.available) {
        return {
          content: [{
            type: 'text',
            text: `Domain ${args.domain} is not available for registration.`,
          }],
        };
      }

      // Register the domain
      const result = await client.registerDomain(args.domain, args.years, {
        firstName: args.firstName,
        lastName: args.lastName,
        address1: args.address,
        city: args.city,
        stateProvince: args.stateProvince,
        postalCode: args.postalCode,
        country: args.country,
        phone: args.phone,
        emailAddress: args.email,
      });
      
      return {
        content: [{
          type: 'text',
          text: `Successfully registered ${args.domain} for ${args.years} year(s)!\n\nDomain ID: ${result.domainId}\nOrder ID: ${result.orderId}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to register domain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Export all domain tools
export const domainTools: Tool[] = [
  checkDomainTool,
  checkDomainsTool,
  listDomainsTool,
  getDomainInfoTool,
  registerDomainTool,
]; 