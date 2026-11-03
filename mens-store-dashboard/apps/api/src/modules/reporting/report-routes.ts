import type { FastifyInstance, FastifyRequest } from 'fastify';
import { analyticsQuerySchema,reportQuerySchema } from '@ahmed-store/contracts';
import ExcelJS from 'exceljs';
import type { SessionResult } from '../identity/session.js';
import type { createReportsService } from './reports.js';
import { can } from '../identity/authorization.js';

export function registerReportRoutes(app: FastifyInstance, options: {
  authenticate: (request: FastifyRequest) => Promise<SessionResult>;
  service?: ReturnType<typeof createReportsService>;
}) {
  for(const analytics of [false,true])app.get(analytics?'/api/v1/reports/analytics':'/api/v1/reports/options',async(request,reply)=>{
    const auth=await options.authenticate(request);if(!auth.ok)return reply.code(401).send({error:auth.reason});if(!can(auth.user.role,'reports:read')||(analytics&&auth.user.warehouseIds!==undefined))return reply.code(403).send({error:'FORBIDDEN'});if(!options.service)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
    if(!analytics)return options.service.choices(auth.user.organizationId);const q=analyticsQuerySchema.safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_ANALYTICS_PERIOD'});return options.service.analytics(auth.user.organizationId,q.data);
  });
  for (const exportAll of [false, true]) app.get(`/api/v1/reports/operations${exportAll ? '/export.xlsx' : ''}`, async (request, reply) => {
    const auth = await options.authenticate(request);
    if (!auth.ok) return reply.code(401).send({ error: auth.reason });
    if (!can(auth.user.role, 'reports:read')) return reply.code(403).send({ error: 'FORBIDDEN' });
    const parsed = reportQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_REPORT_QUERY' });
    if (!options.service) return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE' });
    try {
      const result = await options.service.read(auth.user.organizationId, parsed.data, exportAll);
      if (!exportAll) return result;
      const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Report', { views: [{ rightToLeft: true }] });
      sheet.addRow(['Report', result.kind]);
      sheet.addRow(['From (UTC)', result.from.toISOString(), 'To (UTC)', result.to.toISOString()]);
      sheet.addRow(['Records', result.total, 'Total amount', result.totalAmount, 'Total quantity', result.totalQuantity]);
      sheet.addRow(['Document / item ID', 'Date (UTC)', 'Description / type', 'Reference', 'Amount', 'Quantity']);
      sheet.getRow(4).font = { bold: true };
      for (const row of result.rows) sheet.addRow([row.id, row.occurredAt.toISOString(), row.label, row.reference, row.amount, row.quantity]);
      sheet.columns.forEach(column => { column.width = 28; });
      return reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('content-disposition', `attachment; filename="${result.kind}-report.xlsx"`).send(Buffer.from(await book.xlsx.writeBuffer()));
    } catch (error) {
      if (error instanceof Error && error.message === 'REPORT_EXPORT_TOO_LARGE') return reply.code(422).send({ error: error.message });
      throw error;
    }
  });
}
