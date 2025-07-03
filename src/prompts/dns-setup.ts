import { z } from 'zod';

interface Prompt {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  getMessages: (args: any) => Promise<{
    messages: Array<{
      role: 'user' | 'assistant';
      content: {
        type: 'text';
        text: string;
      };
    }>;
  }>;
}

export const dnsSetupPrompts: Prompt[] = [
  {
    name: 'setup-vercel-dns',
    description: 'Interactive prompt to set up DNS for a Vercel deployment',
    arguments: [
      {
        name: 'domain',
        description: 'The domain to configure',
        required: true,
      },
      {
        name: 'projectName',
        description: 'Your Vercel project name',
        required: false,
      },
    ],
    async getMessages(args) {
      const domain = args.domain || 'example.com';
      const projectName = args.projectName || 'your-project';
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to set up DNS for my Vercel deployment. My domain is ${domain} and my Vercel project is ${projectName}.`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll help you set up DNS for your Vercel deployment on ${domain}. Here's what we need to do:

1. First, let me check the current DNS records for ${domain}
2. Then I'll add the necessary records for Vercel:
   - An A record pointing to Vercel's IP (76.76.21.21)
   - A CNAME record for www pointing to cname.vercel-dns.com

Let me start by checking your current DNS configuration...

You can either:
- Use the command: apply-dns-template with domain="${domain}" and template="vercel"
- Or manually add the records using add-dns-record

Would you like me to proceed with applying the Vercel template?`,
            },
          },
        ],
      };
    },
  },
  
  {
    name: 'setup-email-dns',
    description: 'Interactive prompt to set up email DNS records',
    arguments: [
      {
        name: 'domain',
        description: 'The domain to configure',
        required: true,
      },
      {
        name: 'provider',
        description: 'Email provider (google, microsoft, custom)',
        required: true,
      },
    ],
    async getMessages(args) {
      const domain = args.domain || 'example.com';
      const provider = args.provider || 'google';
      
      let setupInstructions = '';
      
      switch (provider.toLowerCase()) {
        case 'google':
          setupInstructions = `For Google Workspace:
1. MX Records (mail routing):
   - aspmx.l.google.com (priority 1)
   - alt1.aspmx.l.google.com (priority 5)
   - alt2.aspmx.l.google.com (priority 5)
   - alt3.aspmx.l.google.com (priority 10)
   - alt4.aspmx.l.google.com (priority 10)

2. SPF Record (prevent spoofing):
   - TXT record: "v=spf1 include:_spf.google.com ~all"

3. Optional DKIM (you'll get this from Google Admin):
   - TXT record at google._domainkey

Use: apply-dns-template with domain="${domain}" and template="google-workspace"`;
          break;
          
        case 'microsoft':
          setupInstructions = `For Microsoft 365:
1. MX Record:
   - ${domain.replace('.', '-')}.mail.protection.outlook.com (priority 0)

2. SPF Record:
   - TXT record: "v=spf1 include:spf.protection.outlook.com -all"

3. Autodiscover:
   - CNAME: autodiscover → autodiscover.outlook.com

Use: apply-dns-template with domain="${domain}" and template="microsoft-365"`;
          break;
          
        default:
          setupInstructions = `For custom email providers, you'll need:
1. MX Records pointing to your mail server
2. SPF Record for sender authentication
3. Optional: DKIM and DMARC records

Use the add-dns-record tool to add each record individually.`;
      }
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need to set up email for ${domain} using ${provider}.`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll help you configure email DNS records for ${domain} with ${provider}.

${setupInstructions}

Before we proceed, let me check your current DNS configuration to avoid conflicts...

Would you like me to:
1. Apply the email template automatically
2. Show you the current DNS records first
3. Add records one by one for more control?`,
            },
          },
        ],
      };
    },
  },
  
  {
    name: 'migrate-dns',
    description: 'Interactive prompt to help migrate DNS from another provider',
    arguments: [
      {
        name: 'domain',
        description: 'The domain to migrate',
        required: true,
      },
      {
        name: 'currentProvider',
        description: 'Current DNS provider',
        required: false,
      },
    ],
    async getMessages(args) {
      const domain = args.domain || 'example.com';
      const currentProvider = args.currentProvider || 'another provider';
      
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to migrate DNS for ${domain} from ${currentProvider} to Namecheap.`,
            },
          },
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: `I'll help you migrate DNS for ${domain} from ${currentProvider} to Namecheap. Here's the migration process:

**Step 1: Document Current DNS Records**
First, make sure you have a complete list of all DNS records from ${currentProvider}. You'll need:
- A records (IPv4 addresses)
- AAAA records (IPv6 addresses)
- CNAME records (aliases)
- MX records (email)
- TXT records (verification, SPF, etc.)
- Any other custom records

**Step 2: Add Records to Namecheap**
I can help you add all these records. Use the list-dns-records tool to see current records.

**Step 3: Update Nameservers**
After all records are added, update your domain's nameservers at your registrar to:
- dns1.registrar-servers.com
- dns2.registrar-servers.com
- dns3.registrar-servers.com
- dns4.registrar-servers.com
- dns5.registrar-servers.com

**Step 4: Wait for Propagation**
DNS changes can take 24-48 hours to propagate fully.

Would you like me to:
1. Show you the current DNS records on Namecheap
2. Help you add specific records
3. Provide a checklist for the migration?`,
            },
          },
        ],
      };
    },
  },
]; 