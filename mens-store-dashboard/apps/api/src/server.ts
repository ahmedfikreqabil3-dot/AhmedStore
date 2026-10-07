import type { CategoryService, CustomerService, IdentityService, InvoiceReturnService, InventoryMovementService, NoInvoiceReturnService, ProductService, SalesService, StockService, UserDirectoryService, WarehouseService } from './app.js';
import { buildApp } from './app.js';
import type { AuthenticationService } from './modules/identity/session.js';

export async function startServer(port: number, identityService: IdentityService, authenticationService: AuthenticationService, userDirectoryService: UserDirectoryService, categoryService: CategoryService, productService: ProductService, warehouseService: WarehouseService, stockService: StockService, inventoryMovementService: InventoryMovementService, customerService: CustomerService, salesService: SalesService, invoiceReturnService?: InvoiceReturnService, noInvoiceReturnService?: NoInvoiceReturnService) {
  const app = await buildApp(identityService, authenticationService, userDirectoryService, categoryService, productService, warehouseService, stockService, inventoryMovementService, customerService, salesService, invoiceReturnService, noInvoiceReturnService);
  await app.listen({ host: '0.0.0.0', port });
  return app;
}
