import Fastify from 'fastify';
import {expect,it,vi} from 'vitest';
import {registerCustomerImportRoutes} from '../../../src/modules/parties/customer-import-routes.js';
import type {createCustomerImportService} from '../../../src/modules/parties/customer-import.js';
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f',mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const file=Buffer.from('xlsx test payload'),preview={valid:true,rows:[],errors:[]};
const services=()=>({template:vi.fn(async()=>file),preview:vi.fn(async()=>preview),import:vi.fn(async()=>({ok:true as const,imported:2,replayed:false}))});
function make(service:ReturnType<typeof createCustomerImportService>|undefined,role:'ADMIN'|'MANAGER'|'FINANCE'|'CASHIER'|'WAREHOUSE'|null='ADMIN'){
  const app=Fastify({logger:false});app.addContentTypeParser(mime,{parseAs:'buffer'},(_request,body,done)=>done(null,body));registerCustomerImportRoutes(app,{service,authenticate:async()=>role?{ok:true as const,token:'token',user:{id,organizationId:id,name:'Admin',email:'admin@example.test',role}}:{ok:false as const,reason:'UNAUTHENTICATED' as const}});return app;
}
const paths=[{method:'GET' as const,url:'/api/v1/customers/import-template'},{method:'POST' as const,url:'/api/v1/customers/import-preview'},{method:'POST' as const,url:'/api/v1/customers/import'}];
it('requires authenticated party administrators and a configured import service on every endpoint',async()=>{
  for(const role of [null,'FINANCE','CASHIER','WAREHOUSE'] as const){const app=make(services(),role);try{for(const path of paths)expect((await app.inject(path)).statusCode).toBe(role===null?401:403);}finally{await app.close();}}
  const app=make(undefined);try{for(const path of paths)expect((await app.inject(path)).statusCode).toBe(503);}finally{await app.close();}
});
it('provides a template and passes preview/import only the session organization and actor',async()=>{
  const service=services(),app=make(service,'MANAGER');try{
    const template=await app.inject(paths[0]!);expect(template.statusCode).toBe(200);expect(template.headers['content-type']).toContain(mime);expect(template.headers['content-disposition']).toContain('customers-template.xlsx');
    expect((await app.inject({...paths[1]!,headers:{'content-type':mime},payload:file})).json()).toEqual(preview);expect(service.preview).toHaveBeenCalledWith(id,file);
    const call=()=>app.inject({...paths[2]!,headers:{'content-type':mime,'idempotency-key':'import-key'},payload:file});expect((await call()).statusCode).toBe(201);expect(service.import).toHaveBeenLastCalledWith(id,id,'import-key',file);
    service.import.mockResolvedValueOnce({ok:true,imported:2,replayed:true});expect((await call()).statusCode).toBe(200);
  }finally{await app.close();}
});
it('validates upload bodies and bounded keys and reports definitive import rejection without claiming success',async()=>{
  const service=services(),app=make(service);try{
    expect((await app.inject({...paths[1]!,payload:{wrong:'json'}})).statusCode).toBe(400);
    for(const key of ['', 'x'.repeat(201)])expect((await app.inject({...paths[2]!,headers:{'content-type':mime,'idempotency-key':key},payload:file})).statusCode).toBe(400);
    expect((await app.inject({...paths[2]!,headers:{'idempotency-key':'valid'},payload:{wrong:'json'}})).statusCode).toBe(400);
    const call=()=>app.inject({...paths[2]!,headers:{'content-type':mime,'idempotency-key':'valid'},payload:file});
    service.import.mockResolvedValueOnce({ok:false,reason:'INVALID_IMPORT',preview:{...preview,valid:false}} as never);const invalid=await call();expect(invalid.statusCode).toBe(400);expect(invalid.json()).toHaveProperty('preview.valid',false);
    service.import.mockResolvedValueOnce({ok:false,reason:'IDEMPOTENCY_KEY_CONFLICT'} as never);expect((await call()).statusCode).toBe(409);
    expect((await app.inject({...paths[1]!,headers:{'content-type':mime},payload:Buffer.alloc(1048577)})).statusCode).toBe(413);
  }finally{await app.close();}
});
