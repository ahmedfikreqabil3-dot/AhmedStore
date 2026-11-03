import type {FastifyInstance,FastifyRequest} from 'fastify';import {z} from 'zod';import {documentKindSchema} from '@ahmed-store/contracts';import type {SessionResult} from '../identity/session.js';import {can} from '../identity/authorization.js';import {DocumentError,type createDocumentService} from './service.js';
export function registerDocumentRoutes(app:FastifyInstance,options:{authenticate:(r:FastifyRequest)=>Promise<SessionResult>;service?:ReturnType<typeof createDocumentService>}){
 for(const settings of [true,false])app.get(settings?'/api/v1/documents/settings':'/api/v1/documents/:kind/:id',async(r,reply)=>{
  const auth=await options.authenticate(r);if(!auth.ok)return reply.code(401).send({error:auth.reason});if(!options.service)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
  if(settings)return options.service.settings(auth.user.organizationId);
  const p=z.object({kind:documentKindSchema,id:z.string().uuid()}).safeParse(r.params);if(!p.success)return reply.code(400).send({error:'INVALID_DOCUMENT'});
  if(p.data.kind==='settlement'?(!can(auth.user.role,'treasury:manage')||auth.user.warehouseIds!==undefined):(!can(auth.user.role,'purchases:manage')&&!can(auth.user.role,'reports:read')))return reply.code(403).send({error:'FORBIDDEN'});
  try{return await options.service.read(auth.user.organizationId,p.data.kind,p.data.id);}catch(e){if(e instanceof DocumentError)return reply.code(e.status).send({error:e.message});throw e;}
 });
}
