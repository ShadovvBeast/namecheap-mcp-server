import { NamecheapClient } from '../namecheap-client.js';

// Prefix-based resource for checking domain availability on-the-fly.
// The caller should use a URI of the form:
//   namecheap://domains/availability/<domain1>[,<domain2>,...]
// For example:
//   namecheap://domains/availability/example.com
//   namecheap://domains/availability/example.com,example.net
//
// This dynamic resource returns a JSON array of objects with fields:
//   domain, available, isPremium, premiumPrice
// If only one domain is requested it will return a single object (not array) for convenience.

const URI_PREFIX = 'namecheap://domains/availability/';

export const domainAvailabilityResource = {
  uri: `${URI_PREFIX}{domain}`,
  name: 'Domain Availability',
  description: 'Check .com /.net etc domain availability. Replace {domain} with the domain name, or a comma-separated list for bulk queries.',
  mimeType: 'application/json',

  // Internal helper used by index.ts when handling read requests.
  async read(domainsStr: string): Promise<string> {
    const client = new NamecheapClient({
      apiUser: process.env.NAMECHEAP_API_USER!,
      apiKey: process.env.NAMECHEAP_API_KEY!,
      clientIp: process.env.NAMECHEAP_CLIENT_IP!,
      sandbox: process.env.NAMECHEAP_SANDBOX === 'true',
    });

    // Split and sanitise domain list
    const domains = domainsStr
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    if (domains.length === 0) {
      throw new Error('No domain specified in availability URI');
    }

    if (domains.length === 1) {
      const res = await client.checkDomain(domains[0]);
      return JSON.stringify(res, null, 2);
    }

    const resArr = await client.checkDomains(domains);
    return JSON.stringify(resArr, null, 2);
  },

  // Utility for index.ts to determine if a given URI belongs to this resource
  matchesUri(uri: string): boolean {
    return uri.startsWith(URI_PREFIX);
  },

  // Extract the domain list part from URI
  extractDomains(uri: string): string {
    return uri.substring(URI_PREFIX.length);
  },
};
