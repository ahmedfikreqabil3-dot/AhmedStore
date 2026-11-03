import Fastify from 'fastify';
import ExcelJS from 'exceljs';
import { expect, it, vi } from 'vitest';
import { registerReportRoutes } from '../../../src/modules/reporting/report-routes.js';
const id = 'ab8ce3b4-3af9-4f30-a650-e635dd6b1c80';
const result = { kind: 'sales' as const, from: new Date('2026-11-01'), to: new Date('2026-11-02'), total: 1, totalAmount: '9007199254740993.0001', totalQuantity: null, limit: 25, offset: 0, rows: [{ id, occurredAt: new Date('2026-11-01'), label: '=1+1', reference: id, amount: '9007199254740993.0001', quantity: null }] };
function setup(role: 'ADMIN'|'MANAGER'|'FINANCE'|'CASHIER'|'WAREHOUSE'|null = 'ADMIN', configured = true) {
  const app = Fastify(), service = { read: vi.fn(async () => result),choices:vi.fn(async()=>({customers:[],suppliers:[],products:[],categories:[],accounts:[]})),analytics:vi.fn(async()=>({from:result.from,to:result.to,points:[],exceptions:{negativeStock:0,expiredQuotations:0,pendingReturns:0,overCreditLimit:0,negativeAccounts:0}})) };
  registerReportRoutes(app, { service: configured ? service : undefined, authenticate: async () => role ? { ok: true, token: 'test', user: { id, organizationId: id, email: 'test@example.test', name: 'Test', role } } : { ok: false, reason: 'UNAUTHENTICATED' } });
  return { app, service };
}
const url = '/api/v1/reports/operations', query = '?kind=sales&from=2026-11-01&to=2026-11-02';
it('authenticates and authorizes both reporting endpoints', async () => {
  for (const role of [null, 'CASHIER', 'WAREHOUSE'] as const) {
    const {app,service}=setup(role);
    try { for(const path of [url,url+'/export.xlsx']) expect((await app.inject(path+query)).statusCode).toBe(role?403:401); expect(service.read).not.toHaveBeenCalled(); } finally { await app.close(); }
  }
  const {app}=setup('ADMIN',false);try{expect((await app.inject(url+query)).statusCode).toBe(503);}finally{await app.close();}
});
it('validates queries and exports all filtered results as exact text cells without formulas', async () => {
  for (const role of ['ADMIN','MANAGER','FINANCE'] as const) {
    const {app,service}=setup(role);
    try {
      expect((await app.inject(url+'?kind=expenses')).statusCode).toBe(400);
      expect((await app.inject(url+query)).json()).toHaveProperty('totalAmount',result.totalAmount);
      expect(service.read).toHaveBeenCalledWith(id,expect.objectContaining({kind:'sales',limit:25}),false);
      const file=await app.inject(url+'/export.xlsx'+query);expect(file.statusCode).toBe(200);
      expect(service.read).toHaveBeenLastCalledWith(id,expect.any(Object),true);
      const book=new ExcelJS.Workbook();await book.xlsx.load(Uint8Array.from(file.rawPayload).buffer);
      expect(book.worksheets[0]!.getCell('E5').value).toBe(result.totalAmount);expect(book.worksheets[0]!.getCell('C5').value).toBe('=1+1');
      service.read.mockRejectedValueOnce(Error('REPORT_EXPORT_TOO_LARGE'));expect((await app.inject(url+'/export.xlsx'+query)).statusCode).toBe(422);
      service.read.mockRejectedValueOnce(Error('unexpected'));expect((await app.inject(url+query)).statusCode).toBe(500);
    } finally { await app.close(); }
  }
});

it('guards analytics/options and bounds analytics periods',async()=>{
 for(const role of [null,'CASHIER','WAREHOUSE'] as const){const {app}=setup(role);expect((await app.inject('/api/v1/reports/analytics?from=2026-01-01&to=2026-01-02')).statusCode).toBe(role?403:401);await app.close();}
 const {app,service}=setup();expect((await app.inject('/api/v1/reports/options')).statusCode).toBe(200);expect((await app.inject('/api/v1/reports/analytics?from=2026-01-01&to=2026-01-02')).statusCode).toBe(200);expect(service.analytics).toHaveBeenCalled();expect((await app.inject('/api/v1/reports/analytics?from=2025-01-01&to=2027-01-01')).statusCode).toBe(400);await app.close();
});
