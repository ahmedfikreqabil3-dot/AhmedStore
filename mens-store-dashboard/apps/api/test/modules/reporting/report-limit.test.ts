import { expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createReportsService } from '../../../src/modules/reporting/reports.js';
it('rejects oversized exports before retrieving or silently truncating rows',async()=>{
  let reads=0;
  const prisma={$transaction:async(work:(tx:unknown)=>Promise<unknown>)=>work({$queryRaw:async()=>{reads++;return[{total:10001}];}})} as unknown as PrismaClient;
  await expect(createReportsService(prisma).read('org',{kind:'sales',from:new Date('2026-11-01'),to:new Date('2026-11-02'),limit:25,offset:0},true)).rejects.toThrow('REPORT_EXPORT_TOO_LARGE');
  expect(reads).toBe(1);
});
