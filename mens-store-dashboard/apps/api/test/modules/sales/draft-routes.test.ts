import Fastify from 'fastify';
import {expect,it,vi} from 'vitest';
import {registerDraftRoutes} from '../../../src/modules/sales/draft-routes.js';
import {DraftError} from '../../../src/modules/sales/drafts.js';
import type {Role} from '@ahmed-store/contracts';
const id='ab8ce3b4-3af9-4f30-a650-e635dd6b1c80',base='/api/v1/sale-drafts',input={kind:'HELD',customerId:id,warehouseId:id,lines:[{productId:id,quantity:'1',unitPrice:'20',discount:'0'}]};
const requests=[{method:'GET',url:base},{method:'GET',url:base+'/'+id},{method:'POST',url:base,payload:input,headers:{'idempotency-key':id}},{method:'PATCH',url:base+'/'+id,payload:{customerId:id,warehouseId:id,lines:input.lines,version:1}},{method:'POST',url:base+'/'+id+'/cancel',payload:{version:1}},{method:'POST',url:base+'/'+id+'/convert',payload:{version:1,payments:[{method:'CASH',amount:'20'}]}}] as const;
function setup(role:Role|null='ADMIN',configured=true){const app=Fastify(),service={list:vi.fn(async()=>({items:[]})),read:vi.fn(async()=>({id})),create:vi.fn(async()=>({id})),update:vi.fn(async()=>({id})),cancel:vi.fn(async()=>({id})),convert:vi.fn(async()=>({id}))};registerDraftRoutes(app,{service:configured?service as never:undefined,authenticate:async()=>role?{ok:true,token:'test',user:{id,organizationId:id,name:'User',email:'user@example.test',role}}:{ok:false,reason:'UNAUTHENTICATED'}});return{app,service};}
it('enforces authentication and role permissions on all draft operations',async()=>{
  for(const role of [null,'WAREHOUSE','FINANCE'] as const){const {app}=setup(role);try{for(const r of requests){const response=await app.inject({...r});expect(response.statusCode).toBe(role===null?401:role==='FINANCE'&&r.method==='GET'?200:403);}}finally{await app.close();}}
  const {app}=setup('ADMIN',false);try{expect((await app.inject(base)).statusCode).toBe(503);}finally{await app.close();}
});
it('validates inputs and keeps organization/owner scope server controlled',async()=>{
  const {app,service}=setup('CASHIER');try{
    for(const r of requests)expect((await app.inject({...r})).statusCode).toBe(r.url===base&&r.method==='POST'?201:200);
    expect(service.list).toHaveBeenCalledWith(id,{limit:25,offset:0},id);expect(service.read).toHaveBeenCalledWith(id,id,id);expect(service.convert).toHaveBeenCalledWith(id,id,id,requests[5].payload,id);
    expect((await app.inject(base+'?kind=bad')).statusCode).toBe(400);expect((await app.inject(base+'/bad')).statusCode).toBe(400);
    expect((await app.inject({method:'POST',url:base,payload:input})).statusCode).toBe(400);expect((await app.inject({method:'POST',url:base,payload:{},headers:{'idempotency-key':id}})).statusCode).toBe(400);
    for(const index of [3,4,5])expect((await app.inject({...requests[index]!,payload:{}})).statusCode).toBe(400);
  }finally{await app.close();}
});
it('supports administrative access and translates domain failures without hiding unexpected errors',async()=>{
  const {app,service}=setup('MANAGER');try{await app.inject(base);expect(service.list).toHaveBeenCalledWith(id,{limit:25,offset:0},undefined);service.read.mockRejectedValueOnce(new DraftError('DRAFT_NOT_FOUND',404));expect((await app.inject(base+'/'+id)).statusCode).toBe(404);service.read.mockRejectedValueOnce(Error('Unexpected'));expect((await app.inject(base+'/'+id)).statusCode).toBe(500);}finally{await app.close();}
});
