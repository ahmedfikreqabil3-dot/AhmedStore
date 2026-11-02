import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {orderInputSchema,orderVersionSchema,receiptInputSchema} from '@ahmed-store/contracts';
import {can} from '../identity/authorization.js';
import type {SessionResult} from '../identity/session.js';
import {OrderError,type createPurchaseOrderService} from './orders.js';
export function registerOrderRoutes(app:FastifyInstance,options:{authenticate:(request:FastifyRequest)=>Promise<SessionResult>;service?:ReturnType<typeof createPurchaseOrderService>}){
  for(const action of ['list','read','create','cancel','receive'] as const){const mutation=!['list','read'].includes(action),url='/api/v1/purchase-orders'+(action==='list'||action==='create'?'':`/:id${action==='read'?'':'/'+action}`);app.route({method:mutation?'POST':'GET',url,handler:async(request,reply)=>{
    const auth=await options.authenticate(request);if(!auth.ok)return reply.code(401).send({error:auth.reason});if(!can(auth.user.role,'purchases:manage')&&(mutation||!can(auth.user.role,'reports:read')))return reply.code(403).send({error:'FORBIDDEN'});if(!options.service)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
    const org=auth.user.organizationId,user=auth.user.id,id=z.string().uuid().safeParse((request.params as {id?:string}).id),key=z.string().uuid().safeParse(request.headers['idempotency-key']);if(!['list','create'].includes(action)&&!id.success)return reply.code(400).send({error:'INVALID_ID'});
    try{
      if(action==='list'){const q=z.object({offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict().safeParse(request.query);if(!q.success)return reply.code(400).send({error:'INVALID_QUERY'});return options.service.list(org,q.data.offset);}
      if(action==='read')return await options.service.read(org,id.data!);
      if(action==='create'){const body=orderInputSchema.safeParse(request.body);if(!body.success||!key.success)return reply.code(400).send({error:'INVALID_ORDER'});return reply.code(201).send(await options.service.create(org,user,key.data,body.data));}
      if(action==='cancel'){const body=orderVersionSchema.safeParse(request.body);if(!body.success)return reply.code(400).send({error:'INVALID_ORDER'});return await options.service.cancel(org,user,id.data!,body.data.version);}
      const body=receiptInputSchema.safeParse(request.body);if(!body.success||!key.success)return reply.code(400).send({error:'INVALID_RECEIPT'});return await options.service.receive(org,user,id.data!,key.data,body.data);
    }catch(error){if(error instanceof OrderError)return reply.code(error.status).send({error:error.message});throw error;}
  }});}
}
