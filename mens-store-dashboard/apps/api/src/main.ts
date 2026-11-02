import {loadRuntime} from './operations/config.js';
import {readiness} from './operations/readiness.js';
import { PrismaClient } from '@prisma/client';
import { startServer } from './server.js';
import { createApplicationServices } from './services.js';

const config=loadRuntime(),prisma=new PrismaClient();
const ready=readiness(prisma,config.production);if(!await ready()){await prisma.$disconnect();throw Error('DATABASE_READINESS_CHECK_FAILED');}
let draining=false;
const services=createApplicationServices(prisma);
const app=await startServer(config.port,services.identityService,services.authenticationService,services.userDirectoryService,services.categoryService,services.productService,services.warehouseService,services.stockService,services.inventoryMovementService,services.customerService,services.salesService,services.invoiceReturnService,services.noInvoiceReturnService,services.noInvoiceApprovalService,services.shiftTotalsService,services.returnRevisionService,services.shiftService,services.expenseService,services.supplierService,services.purchaseService,services.purchaseReturnService,services.purchaseRevisionService,services.salesExportService,services.salesHistoryService,services.categoryImportService,services.productImportService,services.supplierImportService,services.inventoryTransferService,services.stockCountService,services.stockThresholdService,services.reportsService,services.treasuryService,{config,ready,draining:()=>draining});
const shutdown=async()=>{if(draining)return;draining=true;const timer=setTimeout(()=>process.exit(1),30000);timer.unref();try{await app.close();await prisma.$disconnect();clearTimeout(timer);}catch{process.exitCode=1;}};process.once('SIGTERM',()=>void shutdown());process.once('SIGINT',()=>void shutdown());
