export interface StockRepository {
  quantityAsOf(input: { organizationId: string; productId: string; warehouseId?: string; asOf: Date }): Promise<string>;
}

export function createStockService(repository: StockRepository) {
  return {
    async quantityAsOf(organizationId: string, productId: string, asOf: Date, warehouseId?: string) {
      return repository.quantityAsOf({ organizationId, productId, warehouseId, asOf });
    }
  };
}
