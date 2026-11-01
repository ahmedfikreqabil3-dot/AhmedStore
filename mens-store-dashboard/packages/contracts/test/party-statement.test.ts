import { expect, it } from 'vitest';
import { partyStatementQuerySchema } from '../src/party-statement.js';
it('accepts inclusive statement dates with bounded pagination and rejects reversed or foreign-scope queries',()=>{
  const period={from:'2026-10-01T00:00:00Z',to:'2026-10-31T23:59:59Z'};
  expect(partyStatementQuerySchema.parse(period)).toMatchObject({from:expect.any(Date),to:expect.any(Date),limit:25,offset:0});
  expect(partyStatementQuerySchema.parse({...period,limit:'100',offset:'25'})).toMatchObject({limit:100,offset:25});
  for(const extra of [{from:'bad'},{from:'2027-01-01'},{limit:0},{limit:101},{offset:-1},{offset:100001},{organizationId:'foreign'}])expect(partyStatementQuerySchema.safeParse({...period,...extra}).success).toBe(false);
});
