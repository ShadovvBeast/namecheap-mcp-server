import { NamecheapClient } from '../namecheap-client.js';

// Initialize Namecheap client
const getClient = () => new NamecheapClient({
  apiUser: process.env.NAMECHEAP_API_USER!,
  apiKey: process.env.NAMECHEAP_API_KEY!,
  clientIp: process.env.NAMECHEAP_CLIENT_IP!,
  sandbox: process.env.NAMECHEAP_SANDBOX === 'true',
});

export const domainListResource = {
  uri: 'namecheap://domains/list',
  name: 'Domain List',
  description: 'List of all domains in your Namecheap account with their status',
  mimeType: 'application/json',
  
  async read(): Promise<string> {
    const client = getClient();
    
    try {
      // Get all domains (up to 100)
      const { domains, totalItems } = await client.listDomains(1, 100);
      
      // Calculate expiry status for each domain
      const today = new Date();
      const domainsWithStatus = domains.map(domain => {
        const expiryDate = new Date(domain.expires);
        const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        let status = 'active';
        if (daysUntilExpiry <= 0) {
          status = 'expired';
        } else if (daysUntilExpiry <= 7) {
          status = 'urgent';
        } else if (daysUntilExpiry <= 30) {
          status = 'expiring-soon';
        }
        
        return {
          ...domain,
          daysUntilExpiry,
          status,
        };
      });
      
      // Sort by expiry date (urgent ones first)
      domainsWithStatus.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      
      const result = {
        totalDomains: totalItems,
        retrievedDomains: domains.length,
        lastUpdated: new Date().toISOString(),
        domains: domainsWithStatus,
        summary: {
          active: domainsWithStatus.filter(d => d.status === 'active').length,
          expiringSoon: domainsWithStatus.filter(d => d.status === 'expiring-soon').length,
          urgent: domainsWithStatus.filter(d => d.status === 'urgent').length,
          expired: domainsWithStatus.filter(d => d.status === 'expired').length,
        },
      };
      
      return JSON.stringify(result, null, 2);
    } catch (error) {
      throw new Error(`Failed to retrieve domain list: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
}; 