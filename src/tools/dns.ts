import { z } from 'zod';
import { NamecheapClient, DNSRecord } from '../namecheap-client.js';

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

// DNS record type enum
const DNSRecordTypeEnum = z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']);

// List DNS records tool
const listDNSRecordsTool: Tool = {
  name: 'list-dns-records',
  description: 'List all DNS records for a domain',
  inputSchema: z.object({
    domain: z.string().describe('The domain name to list DNS records for'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const records = await client.getDNSRecords(args.domain);
      
      let message = `DNS Records for ${args.domain}:\n\n`;
      
      if (records.length === 0) {
        message += 'No DNS records found.';
      } else {
        // Group records by type
        const recordsByType = records.reduce((acc, record) => {
          if (!acc[record.type]) acc[record.type] = [];
          acc[record.type].push(record);
          return acc;
        }, {} as Record<string, DNSRecord[]>);
        
        // Display records grouped by type
        Object.entries(recordsByType).forEach(([type, typeRecords]) => {
          message += `${type} Records:\n`;
          typeRecords.forEach(record => {
            message += `  ${record.name || '@'} → ${record.address}`;
            if (record.mxPref) message += ` (Priority: ${record.mxPref})`;
            if (record.ttl) message += ` [TTL: ${record.ttl}]`;
            message += '\n';
          });
          message += '\n';
        });
      }
      
      return {
        content: [{
          type: 'text',
          text: message,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to list DNS records: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Add DNS record tool
const addDNSRecordTool: Tool = {
  name: 'add-dns-record',
  description: 'Add a new DNS record to a domain',
  inputSchema: z.object({
    domain: z.string().describe('The domain name to add the record to'),
    name: z.string().describe('The hostname/subdomain (use @ for root domain)'),
    type: DNSRecordTypeEnum.describe('The type of DNS record'),
    address: z.string().describe('The value/address for the record'),
    mxPref: z.string().optional().describe('MX preference (priority) for MX records only'),
    ttl: z.string().optional().describe('Time to live in seconds (default: automatic)'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const record: DNSRecord = {
        name: args.name,
        type: args.type,
        address: args.address,
        mxPref: args.mxPref,
        ttl: args.ttl,
      };
      
      await client.addDNSRecord(args.domain, record);
      
      return {
        content: [{
          type: 'text',
          text: `Successfully added ${args.type} record:\n${args.name} → ${args.address}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to add DNS record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Update DNS record tool
const updateDNSRecordTool: Tool = {
  name: 'update-dns-record',
  description: 'Update an existing DNS record',
  inputSchema: z.object({
    domain: z.string().describe('The domain name'),
    findName: z.string().describe('The hostname to find'),
    findType: DNSRecordTypeEnum.describe('The record type to find'),
    newAddress: z.string().optional().describe('New address/value for the record'),
    newName: z.string().optional().describe('New hostname for the record'),
    newTtl: z.string().optional().describe('New TTL value'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const criteria: Partial<DNSRecord> = {
        name: args.findName,
        type: args.findType,
      };
      
      const updates: Partial<DNSRecord> = {};
      if (args.newAddress) updates.address = args.newAddress;
      if (args.newName) updates.name = args.newName;
      if (args.newTtl) updates.ttl = args.newTtl;
      
      await client.updateDNSRecord(args.domain, criteria, updates);
      
      return {
        content: [{
          type: 'text',
          text: `Successfully updated ${args.findType} record for ${args.findName}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to update DNS record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Delete DNS record tool
const deleteDNSRecordTool: Tool = {
  name: 'delete-dns-record',
  description: 'Delete a DNS record from a domain',
  inputSchema: z.object({
    domain: z.string().describe('The domain name'),
    name: z.string().describe('The hostname/subdomain to delete'),
    type: DNSRecordTypeEnum.describe('The type of record to delete'),
    address: z.string().optional().describe('Optional: specific address to match'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      const criteria: Partial<DNSRecord> = {
        name: args.name,
        type: args.type,
      };
      
      if (args.address) {
        criteria.address = args.address;
      }
      
      await client.deleteDNSRecord(args.domain, criteria);
      
      return {
        content: [{
          type: 'text',
          text: `Successfully deleted ${args.type} record for ${args.name}`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to delete DNS record: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Apply DNS template tool
const applyDNSTemplateTool: Tool = {
  name: 'apply-dns-template',
  description: 'Apply a predefined DNS template for common services',
  inputSchema: z.object({
    domain: z.string().describe('The domain name'),
    template: z.enum(['google-workspace', 'microsoft-365', 'vercel', 'netlify', 'github-pages'])
      .describe('The template to apply'),
    customValue: z.string().optional().describe('Custom value for some templates (e.g., Vercel app name)'),
  }),
  async execute(args) {
    const client = getClient();
    try {
      let records: DNSRecord[] = [];
      
      switch (args.template) {
        case 'google-workspace':
          records = [
            { name: '@', type: 'MX', address: 'aspmx.l.google.com', mxPref: '1' },
            { name: '@', type: 'MX', address: 'alt1.aspmx.l.google.com', mxPref: '5' },
            { name: '@', type: 'MX', address: 'alt2.aspmx.l.google.com', mxPref: '5' },
            { name: '@', type: 'MX', address: 'alt3.aspmx.l.google.com', mxPref: '10' },
            { name: '@', type: 'MX', address: 'alt4.aspmx.l.google.com', mxPref: '10' },
            { name: '@', type: 'TXT', address: 'v=spf1 include:_spf.google.com ~all' },
          ];
          break;
          
        case 'microsoft-365':
          records = [
            { name: '@', type: 'MX', address: `${args.domain.replace('.', '-')}.mail.protection.outlook.com`, mxPref: '0' },
            { name: '@', type: 'TXT', address: 'v=spf1 include:spf.protection.outlook.com -all' },
            { name: 'autodiscover', type: 'CNAME', address: 'autodiscover.outlook.com' },
          ];
          break;
          
        case 'vercel':
          const vercelApp = args.customValue || 'cname.vercel-dns.com';
          records = [
            { name: '@', type: 'A', address: '76.76.21.21' },
            { name: 'www', type: 'CNAME', address: vercelApp },
          ];
          break;
          
        case 'netlify':
          const netlifyApp = args.customValue || 'apex-loadbalancer.netlify.com';
          records = [
            { name: '@', type: 'A', address: '75.2.60.5' },
            { name: 'www', type: 'CNAME', address: netlifyApp },
          ];
          break;
          
        case 'github-pages':
          records = [
            { name: '@', type: 'A', address: '185.199.108.153' },
            { name: '@', type: 'A', address: '185.199.109.153' },
            { name: '@', type: 'A', address: '185.199.110.153' },
            { name: '@', type: 'A', address: '185.199.111.153' },
            { name: 'www', type: 'CNAME', address: `${args.customValue || 'username'}.github.io` },
          ];
          break;
      }
      
      // Get existing records
      const existingRecords = await client.getDNSRecords(args.domain);
      
      // Filter out records that would conflict with the template
      const nonConflictingRecords = existingRecords.filter(existing => {
        return !records.some(newRecord => 
          existing.name === newRecord.name && existing.type === newRecord.type
        );
      });
      
      // Combine with new records
      const allRecords = [...nonConflictingRecords, ...records];
      
      // Apply all records
      await client.setDNSRecords(args.domain, allRecords);
      
      return {
        content: [{
          type: 'text',
          text: `Successfully applied ${args.template} template to ${args.domain}\n\nAdded records:\n${
            records.map(r => `${r.type} ${r.name} → ${r.address}`).join('\n')
          }`,
        }],
      };
    } catch (error) {
      throw new Error(`Failed to apply DNS template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};

// Export all DNS tools
export const dnsTools: Tool[] = [
  listDNSRecordsTool,
  addDNSRecordTool,
  updateDNSRecordTool,
  deleteDNSRecordTool,
  applyDNSTemplateTool,
]; 