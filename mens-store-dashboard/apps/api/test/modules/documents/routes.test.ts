import Fastify from 'fastify';import {expect,it,vi} from 'vitest';import {registerDocumentRoutes} from '../../../src/modules/documents/routes.js';import {DocumentError} from '../../../src/modules/documents/service.js';
it('guards document reads and never trusts a client tenant or global settlement request from a scoped user',async()=>{
 let auth:any={ok:false,reason:'UNAUTHENTICATED'};const service={settings:vi.fn(async()=>({name:'Shop'})),read:vi.fn(async()=>({id:'document'}))};const app=Fastify();registerDocumentRoutes(app,{authenticate:async()=>auth,service:service as any});const id='a62886aa-d435-4145-a551-37b675a86f84';
 expect((await app.inject('/api/v1/documents/settings')).statusCode).toBe(401);
 auth={ok:true,user:{id,organizationId:id,role:'CASHIER'}};expect((await app.inject('/api/v1/documents/settings')).statusCode).toBe(200);expect((await app.inject('/api/v1/documents/purchase/'+id)).statusCode).toBe(403);
 auth.user.role='FINANCE';auth.user.warehouseIds=[];expect((await app.inject('/api/v1/documents/settlement/'+id)).statusCode).toBe(403);delete auth.user.warehouseIds;
 expect((await app.inject('/api/v1/documents/purchase/invalid')).statusCode).toBe(400);expect((await app.inject('/api/v1/documents/invalid/'+id)).statusCode).toBe(400);
 expect((await app.inject('/api/v1/documents/purchase/'+id)).statusCode).toBe(200);expect(service.read).toHaveBeenCalledWith(id,'purchase',id);
 service.read.mockRejectedValueOnce(new DocumentError(404,'DOCUMENT_NOT_FOUND'));expect((await app.inject('/api/v1/documents/settlement/'+id)).statusCode).toBe(404);await app.close();
 const offline=Fastify();registerDocumentRoutes(offline,{authenticate:async()=>auth});expect((await offline.inject('/api/v1/documents/settings')).statusCode).toBe(503);await offline.close();
});
