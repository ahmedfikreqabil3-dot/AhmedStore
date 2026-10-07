import type { CategoryService, IdentityService, InventoryMovementService, ProductService, StockService, UserDirectoryService, WarehouseService } from './app.js';
import { buildApp } from './app.js';
import type { AuthenticationService } from './modules/identity/session.js';

export async function startServer(port: number, identityService: IdentityService, authenticationService: AuthenticationService, userDirectoryService: UserDirectoryService, categoryService: CategoryService, productService: ProductService, warehouseService: WarehouseService, stockService: StockService, inventoryMovementService: InventoryMovementService) {
  const app = await buildApp(identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService);
  await app.listen({ host: '0.0.0.0', port });
  return app;
}
