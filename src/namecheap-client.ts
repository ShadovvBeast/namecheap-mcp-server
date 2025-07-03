import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { z } from 'zod';

// Types for Namecheap API responses
export interface NamecheapConfig {
  apiUser: string;
  apiKey: string;
  clientIp: string;
  sandbox?: boolean;
}

export interface DomainCheckResult {
  domain: string;
  available: boolean;
  isPremium?: boolean;
  premiumPrice?: number;
}

export interface DomainInfo {
  domainName: string;
  created: string;
  expires: string;
  isLocked: boolean;
  isAutoRenew: boolean;
  whoisGuard: boolean;
}

export interface DNSRecord {
  hostId?: string;
  name: string;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA';
  address: string;
  mxPref?: string;
  ttl?: string;
}

export class NamecheapError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'NamecheapError';
  }
}

export class NamecheapClient {
  private apiUrl: string;
  private config: NamecheapConfig;

  constructor(config: NamecheapConfig) {
    this.config = config;
    this.apiUrl = config.sandbox
      ? 'https://api.sandbox.namecheap.com/xml.response'
      : 'https://api.namecheap.com/xml.response';
  }

  private async makeRequest(command: string, params: Record<string, any> = {}): Promise<any> {
    const requestParams = {
      ApiUser: this.config.apiUser,
      ApiKey: this.config.apiKey,
      UserName: this.config.apiUser,
      ClientIp: this.config.clientIp,
      Command: command,
      ...params,
    };

    try {
      const response = await axios.post(this.apiUrl, null, { params: requestParams });
      const result = await parseStringPromise(response.data);
      
      // Check for API errors
      const apiResponse = result.ApiResponse;
      if (apiResponse.$.Status === 'ERROR') {
        const error = apiResponse.Errors[0].Error[0];
        throw new NamecheapError(error._, error.$.Number);
      }

      return apiResponse;
    } catch (error) {
      if (error instanceof NamecheapError) {
        throw error;
      }
      throw new NamecheapError(
        `API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REQUEST_FAILED',
        error
      );
    }
  }

  // Domain operations
  async checkDomain(domain: string): Promise<DomainCheckResult> {
    const response = await this.makeRequest('namecheap.domains.check', {
      DomainList: domain,
    });

    const result = response.CommandResponse[0].DomainCheckResult[0];
    return {
      domain: result.$.Domain,
      available: result.$.Available === 'true',
      isPremium: result.$.IsPremiumName === 'true',
      premiumPrice: result.$.PremiumRegistrationPrice 
        ? parseFloat(result.$.PremiumRegistrationPrice) 
        : undefined,
    };
  }

  async checkDomains(domains: string[]): Promise<DomainCheckResult[]> {
    const response = await this.makeRequest('namecheap.domains.check', {
      DomainList: domains.join(','),
    });

    return response.CommandResponse[0].DomainCheckResult.map((result: any) => ({
      domain: result.$.Domain,
      available: result.$.Available === 'true',
      isPremium: result.$.IsPremiumName === 'true',
      premiumPrice: result.$.PremiumRegistrationPrice 
        ? parseFloat(result.$.PremiumRegistrationPrice) 
        : undefined,
    }));
  }

  async listDomains(page = 1, pageSize = 20): Promise<{ domains: DomainInfo[], totalItems: number }> {
    const response = await this.makeRequest('namecheap.domains.getList', {
      Page: page,
      PageSize: pageSize,
    });

    const paging = response.Paging[0].$;
    const domainList = response.CommandResponse[0].DomainGetListResult[0].Domain || [];

    const domains = domainList.map((domain: any) => ({
      domainName: domain.$.Name,
      created: domain.$.Created,
      expires: domain.$.Expires,
      isLocked: domain.$.IsLocked === 'true',
      isAutoRenew: domain.$.AutoRenew === 'true',
      whoisGuard: domain.$.WhoisGuard === 'ENABLED',
    }));

    return {
      domains,
      totalItems: parseInt(paging.TotalItems, 10),
    };
  }

  async getDomainInfo(domain: string): Promise<DomainInfo> {
    const response = await this.makeRequest('namecheap.domains.getInfo', {
      DomainName: domain,
    });

    const domainDetail = response.CommandResponse[0].DomainGetInfoResult[0].DomainDetails[0];
    return {
      domainName: domain,
      created: domainDetail.CreatedDate[0],
      expires: domainDetail.ExpiredDate[0],
      isLocked: domainDetail.IsLocked[0] === 'true',
      isAutoRenew: domainDetail.AutoRenew[0] === 'true',
      whoisGuard: domainDetail.WhoisGuard[0].$.Enabled === 'true',
    };
  }

  // DNS operations
  async getDNSRecords(domain: string): Promise<DNSRecord[]> {
    const sld = domain.split('.')[0];
    const tld = domain.split('.').slice(1).join('.');

    const response = await this.makeRequest('namecheap.domains.dns.getHosts', {
      SLD: sld,
      TLD: tld,
    });

    const hosts = response.CommandResponse[0].DomainDNSGetHostsResult[0].host || [];
    return hosts.map((host: any) => ({
      hostId: host.$.HostId,
      name: host.$.Name,
      type: host.$.Type,
      address: host.$.Address,
      mxPref: host.$.MXPref,
      ttl: host.$.TTL,
    }));
  }

  async setDNSRecords(domain: string, records: DNSRecord[]): Promise<void> {
    const sld = domain.split('.')[0];
    const tld = domain.split('.').slice(1).join('.');

    // Namecheap requires specific parameter format for setting hosts
    const params: Record<string, any> = {
      SLD: sld,
      TLD: tld,
    };

    records.forEach((record, index) => {
      const num = index + 1;
      params[`HostName${num}`] = record.name;
      params[`RecordType${num}`] = record.type;
      params[`Address${num}`] = record.address;
      if (record.mxPref) params[`MXPref${num}`] = record.mxPref;
      if (record.ttl) params[`TTL${num}`] = record.ttl;
    });

    await this.makeRequest('namecheap.domains.dns.setHosts', params);
  }

  async addDNSRecord(domain: string, record: DNSRecord): Promise<void> {
    // Get existing records first
    const existingRecords = await this.getDNSRecords(domain);
    
    // Add the new record
    const updatedRecords = [...existingRecords, record];
    
    // Update all records
    await this.setDNSRecords(domain, updatedRecords);
  }

  async updateDNSRecord(
    domain: string, 
    criteria: Partial<DNSRecord>, 
    updates: Partial<DNSRecord>
  ): Promise<void> {
    const records = await this.getDNSRecords(domain);
    
    // Find and update matching records
    const updatedRecords = records.map(record => {
      const matches = Object.entries(criteria).every(
        ([key, value]) => record[key as keyof DNSRecord] === value
      );
      
      if (matches) {
        return { ...record, ...updates };
      }
      return record;
    });

    await this.setDNSRecords(domain, updatedRecords);
  }

  async deleteDNSRecord(domain: string, criteria: Partial<DNSRecord>): Promise<void> {
    const records = await this.getDNSRecords(domain);
    
    // Filter out matching records
    const filteredRecords = records.filter(record => {
      return !Object.entries(criteria).every(
        ([key, value]) => record[key as keyof DNSRecord] === value
      );
    });

    await this.setDNSRecords(domain, filteredRecords);
  }

  // Register domain (simplified version - full implementation would need more parameters)
  async registerDomain(
    domain: string,
    years = 1,
    contactInfo: {
      firstName: string;
      lastName: string;
      address1: string;
      city: string;
      stateProvince: string;
      postalCode: string;
      country: string;
      phone: string;
      emailAddress: string;
    }
  ): Promise<{ domainId: string; orderId: string }> {
    const params = {
      DomainName: domain,
      Years: years,
      AuxBillingFirstName: contactInfo.firstName,
      AuxBillingLastName: contactInfo.lastName,
      AuxBillingAddress1: contactInfo.address1,
      AuxBillingCity: contactInfo.city,
      AuxBillingStateProvince: contactInfo.stateProvince,
      AuxBillingPostalCode: contactInfo.postalCode,
      AuxBillingCountry: contactInfo.country,
      AuxBillingPhone: contactInfo.phone,
      AuxBillingEmailAddress: contactInfo.emailAddress,
      // Same for Tech, Admin, and Registrant contacts (simplified here)
      TechFirstName: contactInfo.firstName,
      TechLastName: contactInfo.lastName,
      TechAddress1: contactInfo.address1,
      TechCity: contactInfo.city,
      TechStateProvince: contactInfo.stateProvince,
      TechPostalCode: contactInfo.postalCode,
      TechCountry: contactInfo.country,
      TechPhone: contactInfo.phone,
      TechEmailAddress: contactInfo.emailAddress,
      AdminFirstName: contactInfo.firstName,
      AdminLastName: contactInfo.lastName,
      AdminAddress1: contactInfo.address1,
      AdminCity: contactInfo.city,
      AdminStateProvince: contactInfo.stateProvince,
      AdminPostalCode: contactInfo.postalCode,
      AdminCountry: contactInfo.country,
      AdminPhone: contactInfo.phone,
      AdminEmailAddress: contactInfo.emailAddress,
      RegistrantFirstName: contactInfo.firstName,
      RegistrantLastName: contactInfo.lastName,
      RegistrantAddress1: contactInfo.address1,
      RegistrantCity: contactInfo.city,
      RegistrantStateProvince: contactInfo.stateProvince,
      RegistrantPostalCode: contactInfo.postalCode,
      RegistrantCountry: contactInfo.country,
      RegistrantPhone: contactInfo.phone,
      RegistrantEmailAddress: contactInfo.emailAddress,
    };

    const response = await this.makeRequest('namecheap.domains.create', params);
    const result = response.CommandResponse[0].DomainCreateResult[0];

    return {
      domainId: result.$.DomainID,
      orderId: result.$.OrderID,
    };
  }
} 