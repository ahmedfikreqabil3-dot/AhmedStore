import Fastify from 'fastify';
import {expect,it,vi} from 'vitest';
import {registerTreasuryRoutes} from '../../../src/modules/finance/treasury-routes.js';
import {publicError} from '../../../src/modules/shared/public-error.js';
import {TreasuryError} from '../../../src/modules/finance/treasury-errors.js';
import type {createTreasuryService} from '../../../src/modules/finance/treasury-service.js';
const id='25a0aad8-edb0-4091-ad94-4d5a6d5a6d50',other='25a0aad8-edb0-4091-ad94-4d5a6d5a6d51';
const posted={id,amount:'1.1234',occurredAt:new Date(),replayed:false};
const service=()=>({accounts:vi.fn(async()=>({accounts:[]})),createAccount:vi.fn(async()=>posted),transfer:vi.fn(async()=>posted),settle:vi.fn(async()=>posted),parties:vi.fn(async()=>({parties:[]})),invoices:vi.fn(async()=>({invoices:[]})),ledger:vi.fn(async()=>null)});
async function setup(role:'ADMIN'|'FINANCE'|'MANAGER'|'CASHIER'|'WAREHOUSE'|null='ADMIN',configured=true){
  const app=Fastify(),treasury=service();app.setErrorHandler((error,request,reply)=>{const result=publicError(error,request.id);return reply.code(result.statusCode).send(result.body);});
  await app.register(async scope=>registerTreasuryRoutes(scope,{service:configured?treasury as unknown as ReturnType<typeof createTreasuryService>:undefined,authenticate:async()=>role?{ok:true,token:'test',user:{id,organizationId:id,name:'Finance',email:'finance@example.test',role}}:{ok:false,reason:'UNAUTHENTICATED'}}),{prefix:'/api/v1/treasury'});return{app,treasury};
}
const paths=['/accounts',`/accounts/${id}/ledger?from=2026-01-01&to=2026-12-31`,'/parties?kind=customers','/invoices?kind=customers&partyId='+id];
it('guards every treasury read/write endpoint without changing unrelated application routes',async()=>{
  for(const role of [null,'MANAGER','CASHIER','WAREHOUSE'] as const){const{app}=await setup(role);try{for(const path of paths)expect((await app.inject('/api/v1/treasury'+path)).statusCode).toBe(role?403:401);for(const path of ['/accounts','/transfers','/settlements'])expect((await app.inject({method:'POST',url:'/api/v1/treasury'+path,payload:{}})).statusCode).toBe(role?403:401);}finally{await app.close();}}
  const{app}=await setup('ADMIN',false);try{expect((await app.inject('/api/v1/treasury/accounts')).statusCode).toBe(503);}finally{await app.close();}
});
it('reads scoped accounts/options/ledger and validates dates and identifiers',async()=>{
  const{app,treasury}=await setup('FINANCE');try{
    for(const path of paths)expect([200,404]).toContain((await app.inject('/api/v1/treasury'+path)).statusCode);
    expect(treasury.accounts).toHaveBeenCalledWith(id);expect(treasury.invoices).toHaveBeenCalledWith(id,{kind:'customers',partyId:id});
    for(const path of ['/accounts/invalid/ledger?from=2026-01-01&to=2026-12-31',`/accounts/${id}/ledger?from=bad&to=bad`,'/parties?kind=other','/invoices?partyId=bad'])expect((await app.inject('/api/v1/treasury'+path)).statusCode).toBe(400);
    treasury.ledger.mockResolvedValueOnce({test:true} as never);expect((await app.inject('/api/v1/treasury'+paths[1])).json()).toEqual({test:true});
  }finally{await app.close();}
});
it('validates immutable financial commands and propagates typed domain errors without leaking internals',async()=>{
  const{app,treasury}=await setup();try{
    const commands=[['/accounts',{name:'Cash desk',paymentMethod:'CASH',openingBalance:'1.1234',reason:'Actual opening'}],['/transfers',{fromAccountId:id,toAccountId:other,amount:'1.1234',reason:'Move funds'}],['/settlements',{kind:'customers',partyId:id,accountId:other,amount:'1.1234',reason:'Collect debt',allocations:[]}]] as const;
    for(const[path,payload]of commands){
      const request={method:'POST' as const,url:'/api/v1/treasury'+path,headers:{'idempotency-key':'original-key'},payload};
      expect((await app.inject({...request,headers:{}})).statusCode).toBe(400);expect((await app.inject({...request,headers:{'idempotency-key':'x'.repeat(201)}})).statusCode).toBe(400);expect((await app.inject({...request,payload:{}})).statusCode).toBe(400);expect((await app.inject(request)).statusCode).toBe(201);
      const fn=path==='/accounts'?treasury.createAccount:path==='/transfers'?treasury.transfer:treasury.settle;expect(fn).toHaveBeenCalledWith(id,id,'original-key',payload);fn.mockResolvedValueOnce({...posted,replayed:true});expect((await app.inject(request)).statusCode).toBe(200);
    }
    treasury.transfer.mockRejectedValueOnce(new TreasuryError('INSUFFICIENT_FUNDS'));expect((await app.inject({method:'POST',url:'/api/v1/treasury/transfers',headers:{'idempotency-key':'key'},payload:commands[1][1]})).json()).toHaveProperty('error','INSUFFICIENT_FUNDS');
  }finally{await app.close();}
});
