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

// Domain expiry check tool
const checkDomainExpiryTool: Tool = {
  name: 'check-domain-expiry',
  description: 'Check expiration dates for all domains and warn about expiring ones',
  inputSchema: z.object({
    daysThreshold: z.number().optional().default(30).describe('Warn about domains expiring within this many days (default: 30)'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const { domains } = await client.listDomains(1, 100); // Get up to 100 domains
      const today = new Date();
      const expiringDomains: Array<{ domain: string; daysUntilExpiry: number; expiryDate: string }> = [];
      
      domains.forEach(domain => {
        const expiryDate = new Date(domain.expires);
        const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilExpiry <= args.daysThreshold) {
          expiringDomains.push({
            domain: domain.domainName,
            daysUntilExpiry,
            expiryDate: domain.expires,
          });
        }
      });
      
      let message = `Domain Expiry Check (threshold: ${args.daysThreshold} days):\n\n`;
      
      if (expiringDomains.length === 0) {
        message += '✅ No domains are expiring soon!';
      } else {
        message += `⚠️ ${expiringDomains.length} domain(s) expiring soon:\n\n`;
        
        // Sort by days until expiry
        expiringDomains.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
        
        expiringDomains.forEach(({ domain, daysUntilExpiry, expiryDate }) => {
          const urgency = daysUntilExpiry <= 7 ? '🚨' : daysUntilExpiry <= 14 ? '⚠️' : '📅';
          message += `${urgency} ${domain}: ${daysUntilExpiry} days (expires: ${expiryDate})\n`;
        });
      }
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to check domain expiry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Suggest domains tool
const suggestDomainsTool: Tool = {
  name: 'suggest-domains',
  description: 'Generate and check availability of domain name suggestions',
  inputSchema: z.object({
    baseKeyword: z.string().describe('Base keyword to generate suggestions from'),
    tlds: z.array(z.string()).optional().default(['.com', '.io', '.net', '.org']).describe('TLDs to check'),
    includeVariations: z.boolean().optional().default(true).describe('Include variations like prefixes/suffixes'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const suggestions: string[] = [];
      const base = args.baseKeyword.toLowerCase().replace(/[^a-z0-9-]/g, '');
      
      // Generate domain suggestions
      args.tlds.forEach((tld: string) => {
        suggestions.push(`${base}${tld}`);
        
        if (args.includeVariations) {
          // Common prefixes
          suggestions.push(`get${base}${tld}`);
          suggestions.push(`my${base}${tld}`);
          suggestions.push(`the${base}${tld}`);
          suggestions.push(`go${base}${tld}`);
          
          // Common suffixes
          suggestions.push(`${base}app${tld}`);
          suggestions.push(`${base}hq${tld}`);
          suggestions.push(`${base}io${tld}`);
          suggestions.push(`${base}pro${tld}`);
          
          // Hyphenated variations
          suggestions.push(`${base}-app${tld}`);
          suggestions.push(`${base}-online${tld}`);
        }
      });
      
      // Check availability in batches
      const batchSize = 20;
      const results: Array<{ domain: string; available: boolean; isPremium: boolean }> = [];
      
      for (let i = 0; i < suggestions.length; i += batchSize) {
        const batch = suggestions.slice(i, i + batchSize);
        const batchResults = await client.checkDomains(batch);
        results.push(...batchResults.map(r => ({
          domain: r.domain,
          available: r.available,
          isPremium: r.isPremium || false,
        })));
      }
      
      // Group by availability
      const available = results.filter(r => r.available && !r.isPremium);
      const premium = results.filter(r => r.available && r.isPremium);
      const unavailable = results.filter(r => !r.available);
      
      let message = `Domain Suggestions for "${args.baseKeyword}":\n\n`;
      
      if (available.length > 0) {
        message += `✅ Available Domains (${available.length}):\n`;
        available.forEach(r => message += `  - ${r.domain}\n`);
        message += '\n';
      }
      
      if (premium.length > 0) {
        message += `💎 Premium Domains (${premium.length}):\n`;
        premium.forEach(r => message += `  - ${r.domain} (premium)\n`);
        message += '\n';
      }
      
      message += `❌ Unavailable: ${unavailable.length} domains`;
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to suggest domains: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// DNS configuration helper tool
const suggestDNSConfigTool: Tool = {
  name: 'suggest-dns-config',
  description: 'Get DNS configuration suggestions for common use cases',
  inputSchema: z.object({
    domain: z.string().describe('The domain to configure'),
    useCase: z.enum([
      'website',
      'email',
      'website-and-email',
      'subdomain-delegation',
      'domain-parking',
    ]).describe('What you want to use the domain for'),
    provider: z.string().optional().describe('Optional: specific provider (e.g., Vercel, Google)'),
  }),
  async execute(args) {
    let message = `DNS Configuration Suggestions for ${args.domain}:\n\n`;
    message += `Use Case: ${args.useCase}\n`;
    if (args.provider) message += `Provider: ${args.provider}\n`;
    message += '\n';
    
    switch (args.useCase) {
      case 'website':
        message += 'Recommended DNS Records:\n\n';
        message += '1. A Record (for root domain):\n';
        message += '   Type: A\n';
        message += '   Name: @\n';
        message += '   Value: Your server IP address\n\n';
        
        message += '2. CNAME Record (for www):\n';
        message += '   Type: CNAME\n';
        message += '   Name: www\n';
        message += '   Value: @ (or your-app.provider.com)\n\n';
        
        if (args.provider?.toLowerCase().includes('vercel')) {
          message += 'For Vercel specifically:\n';
          message += '   A Record: @ → 76.76.21.21\n';
          message += '   CNAME: www → cname.vercel-dns.com\n';
        }
        break;
        
      case 'email':
        message += 'Recommended DNS Records for Email:\n\n';
        message += '1. MX Records (mail servers):\n';
        message += '   Type: MX\n';
        message += '   Name: @\n';
        message += '   Priority: 10\n';
        message += '   Value: mail.your-provider.com\n\n';
        
        message += '2. SPF Record (sender authentication):\n';
        message += '   Type: TXT\n';
        message += '   Name: @\n';
        message += '   Value: v=spf1 include:your-provider.com ~all\n\n';
        
        message += '3. DKIM Record (optional but recommended):\n';
        message += '   Type: TXT\n';
        message += '   Name: default._domainkey\n';
        message += '   Value: (provided by your email provider)\n';
        
        if (args.provider?.toLowerCase().includes('google')) {
          message += '\nFor Google Workspace, use the apply-dns-template tool with template="google-workspace"';
        }
        break;
        
      case 'website-and-email':
        message += 'You need both website and email records.\n';
        message += 'Run this tool twice:\n';
        message += '1. Once with useCase="website"\n';
        message += '2. Once with useCase="email"\n';
        break;
        
      case 'subdomain-delegation':
        message += 'To delegate a subdomain:\n\n';
        message += 'NS Records:\n';
        message += '   Type: NS\n';
        message += '   Name: subdomain\n';
        message += '   Value: ns1.other-provider.com\n';
        message += '   (Add multiple NS records as provided)\n';
        break;
        
      case 'domain-parking':
        message += 'For domain parking:\n\n';
        message += 'A Records:\n';
        message += '   Type: A\n';
        message += '   Name: @\n';
        message += '   Value: Parking service IP\n\n';
        message += 'CNAME Record:\n';
        message += '   Type: CNAME\n';
        message += '   Name: www\n';
        message += '   Value: @\n';
        break;
    }
    
    message += '\n💡 Tip: Use the add-dns-record or apply-dns-template tools to implement these suggestions.';
    
    return {
      content: [{
        type: 'text',
        text: message,
      }],
    };
  },
};

// Export all utility tools
export const utilityTools: Tool[] = [
  checkDomainExpiryTool,
  suggestDomainsTool,
  suggestDNSConfigTool,
]; 