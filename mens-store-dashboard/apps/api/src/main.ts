import { PrismaClient } from '@prisma/client';
import { startServer } from './server.js';
import { createApplicationServices } from './services.js';

const prisma=new PrismaClient();
const services=createApplicationServices(prisma);
await startServer(Number(process.env.PORT ?? 3000),services.identityService,services.authenticationService,services.userDirectoryService,services.categoryService,services.productService,services.warehouseService,services.stockService,services.inventoryMovementService,services.customerService,services.salesService,services.invoiceReturnService,services.noInvoiceReturnService,services.noInvoiceApprovalService,services.shiftTotalsService,services.returnRevisionService,services.shiftService,services.expenseService,services.supplierService,services.purchaseService,services.purchaseReturnService,services.purchaseRevisionService,services.salesExportService,services.salesHistoryService,services.categoryImportService,services.productImportService,services.supplierImportService,services.inventoryTransferService,services.stockCountService,services.stockThresholdService);
