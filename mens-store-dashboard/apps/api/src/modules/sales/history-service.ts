import type { SalesHistoryQuery } from '@ahmed-store/contracts';

export type SalesHistoryItem = {
  id: string;
  customerName: string;
  warehouseName: string;
  total: string;
  status: 'POSTED' | 'VOIDED';
  occurredAt: Date;
};

export interface SalesHistoryRepository {
  list(organizationId: string, query: SalesHistoryQuery): Promise<SalesHistoryItem[]>;
  count(organizationId: string, query: SalesHistoryQuery): Promise<number>;
}

export function createSalesHistoryService(repository: SalesHistoryRepository) {
  return {
    async list(organizationId: string, query: SalesHistoryQuery) {
      const [sales, total] = await Promise.all([
        repository.list(organizationId, query),
        repository.count(organizationId, query)
      ]);
      return { sales, total, limit: query.limit, offset: query.offset };
    }
  };
}
