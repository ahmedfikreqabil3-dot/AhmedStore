import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {createDraftSchema,updateDraftSchema,convertDraftSchema,draftVersionSchema,draftQuerySchema} from '@ahmed-store/contracts';
import type {SessionResult} from '../identity/session.js';
import {can} from '../identity/authorization.js';
import {DraftError,type createSaleDraftService} from './drafts.js';
export function registerDraftRoutes(app:FastifyInstance,options:{authenticate:(request:FastifyRequest)=>Promise<SessionResult>;service?:ReturnType<typeof createSaleDraftService>}){
  for(const action of ['list','read','create','update','cancel','convert'] as const){
    const mutation=!['list','read'].includes(action),path=action==='list'||action==='create'?'/api/v1/sale-drafts':`/api/v1/sale-drafts/:id${action==='cancel'||action==='convert'?'/'+action:''}`;
    app.route({method:action==='update'?'PATCH':mutation?'POST':'GET',url:path,handler:async(request,reply)=>{
      const auth=await options.authenticate(request);if(!auth.ok)return reply.code(401).send({error:auth.reason});
      if(!can(auth.user.role,'sales:write')&&(mutation||!can(auth.user.role,'reports:read')))return reply.code(403).send({error:'FORBIDDEN'});
      if(!options.service)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
      const id=z.string().uuid().safeParse((request.params as {id?:string}).id);if(action!=='list'&&action!=='create'&&!id.success)return reply.code(400).send({error:'INVALID_DRAFT_ID'});
      const owner=auth.user.role==='CASHIER'?auth.user.id:undefined,org=auth.user.organizationId,actor=auth.user.id;
      try{
        if(action==='list'){const q=draftQuerySchema.safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_DRAFT_QUERY'});return await options.service.list(org,q.data,owner);}
        if(action==='read')return await options.service.read(org,id.data!,owner);
        if(action==='create'){
          const body=createDraftSchema.safeParse(request.body),key=z.string().uuid().safeParse(request.headers['idempotency-key']);if(!body.success||!key.success)return reply.code(400).send({error:'INVALID_DRAFT'});
          return reply.code(201).send(await options.service.create(org,actor,key.data,body.data));
        }
        if(action==='update'){const body=updateDraftSchema.safeParse(request.body);if(!body.success)return reply.code(400).send({error:'INVALID_DRAFT'});return await options.service.update(org,actor,id.data!,body.data,owner);}
        if(action==='cancel'){const body=draftVersionSchema.safeParse(request.body);if(!body.success)return reply.code(400).send({error:'INVALID_DRAFT'});return await options.service.cancel(org,actor,id.data!,body.data.version,owner);}
        const body=convertDraftSchema.safeParse(request.body);if(!body.success)return reply.code(400).send({error:'INVALID_DRAFT'});return await options.service.convert(org,actor,id.data!,body.data,owner);
      }catch(error){if(error instanceof DraftError)return reply.code(error.status).send({error:error.message});throw error;}
    }});
  }
}
