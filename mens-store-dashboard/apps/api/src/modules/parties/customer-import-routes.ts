import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify';
import type {SessionResult} from '../identity/session.js';
import {mayManageParty} from './lifecycle.js';
import type {createCustomerImportService} from './customer-import.js';

type Options={authenticate:(request:FastifyRequest)=>Promise<SessionResult>;service?:ReturnType<typeof createCustomerImportService>};
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function registerCustomerImportRoutes(app:FastifyInstance,options:Options){
  async function access(request:FastifyRequest,reply:FastifyReply){
    const auth=await options.authenticate(request);if(!auth.ok){reply.code(401).send({error:auth.reason});return null;}
    if(!mayManageParty(auth.user.role,'customers')){reply.code(403).send({error:'FORBIDDEN'});return null;}
    const service=options.service;if(!service){reply.code(503).send({error:'SERVICE_UNAVAILABLE'});return null;}
    return {user:auth.user,service};
  }
  app.get('/api/v1/customers/import-template',async(request,reply)=>{
    const allowed=await access(request,reply);if(!allowed)return;
    return reply.header('content-type',mime).header('content-disposition','attachment; filename="customers-template.xlsx"').send(await allowed.service.template());
  });
  app.post('/api/v1/customers/import-preview',{bodyLimit:1048576},async(request,reply)=>{
    const allowed=await access(request,reply);if(!allowed)return;
    if(!Buffer.isBuffer(request.body))return reply.code(400).send({error:'INVALID_WORKBOOK'});
    return allowed.service.preview(allowed.user.organizationId,request.body);
  });
  app.post('/api/v1/customers/import',{bodyLimit:1048576},async(request,reply)=>{
    const allowed=await access(request,reply);if(!allowed)return;
    const key=request.headers['idempotency-key'];if(typeof key!=='string'||key.length===0||key.length>200)return reply.code(400).send({error:'IDEMPOTENCY_KEY_REQUIRED'});
    if(!Buffer.isBuffer(request.body))return reply.code(400).send({error:'INVALID_WORKBOOK'});
    const result=await allowed.service.import(allowed.user.organizationId,allowed.user.id,key,request.body);
    if(!result.ok)return reply.code(result.reason==='INVALID_IMPORT'?400:409).send({error:result.reason,...(result.reason==='INVALID_IMPORT'?{preview:result.preview}:{})});
    return reply.code(result.replayed?200:201).send({imported:result.imported,replayed:result.replayed});
  });
}
