import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { PublicUser } from '@ahmed-store/contracts';
import { createTreasuryAccountSchema, treasuryTransferSchema, settlementSchema, treasuryHistoryQuerySchema, settlementPartyQuerySchema, settlementInvoiceQuerySchema } from '@ahmed-store/contracts';
import { can } from '../identity/authorization.js';
import type { SessionResult } from '../identity/session.js';
import type { createTreasuryService } from './treasury-service.js';

export function registerTreasuryRoutes(app:FastifyInstance,options:{authenticate:(request:FastifyRequest)=>Promise<SessionResult>;service?:ReturnType<typeof createTreasuryService>}) {
  const sessions=new WeakMap<FastifyRequest,PublicUser>();
  app.addHook('preHandler',async(request,reply)=>{
    const auth=await options.authenticate(request);if(!auth.ok)return reply.code(401).send({error:auth.reason});
    if(!can(auth.user.role,'treasury:manage'))return reply.code(403).send({error:'FORBIDDEN'});
    if(!options.service)return reply.code(503).send({error:'SERVICE_UNAVAILABLE'});
    sessions.set(request,auth.user);
  });
  async function user(request:FastifyRequest){return sessions.get(request)!;}
  app.get('/accounts',async request=>options.service!.accounts((await user(request)).organizationId));
  app.get('/accounts/:accountId/ledger',async(request,reply)=>{
    const params=z.object({accountId:z.string().uuid()}).safeParse(request.params),query=treasuryHistoryQuerySchema.safeParse(request.query);
    if(!params.success||!query.success)return reply.code(400).send({error:'INVALID_TREASURY_QUERY'});
    const result=await options.service!.ledger((await user(request)).organizationId,params.data.accountId,query.data);
    return result??reply.code(404).send({error:'ACCOUNT_NOT_FOUND'});
  });
  app.get('/parties',async(request,reply)=>{
    const query=settlementPartyQuerySchema.safeParse(request.query);if(!query.success)return reply.code(400).send({error:'INVALID_TREASURY_QUERY'});
    return options.service!.parties((await user(request)).organizationId,query.data);
  });
  app.get('/invoices',async(request,reply)=>{
    const query=settlementInvoiceQuerySchema.safeParse(request.query);if(!query.success)return reply.code(400).send({error:'INVALID_TREASURY_QUERY'});
    return options.service!.invoices((await user(request)).organizationId,query.data);
  });
  for(const operation of ['account','transfer','settlement'] as const)app.post(operation==='account'?'/accounts':operation==='transfer'?'/transfers':'/settlements',async(request,reply)=>{
    const key=request.headers['idempotency-key'];if(typeof key!=='string'||key.length<1||key.length>200)return reply.code(400).send({error:'IDEMPOTENCY_KEY_REQUIRED'});
    const actor=await user(request),service=options.service!;
    if(operation==='account'){const parsed=createTreasuryAccountSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_TREASURY_COMMAND'});const result=await service.createAccount(actor.organizationId,actor.id,key,parsed.data);return reply.code(result.replayed?200:201).send(result);}
    if(operation==='transfer'){const parsed=treasuryTransferSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_TREASURY_COMMAND'});const result=await service.transfer(actor.organizationId,actor.id,key,parsed.data);return reply.code(result.replayed?200:201).send(result);}
    const parsed=settlementSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'INVALID_TREASURY_COMMAND'});const result=await service.settle(actor.organizationId,actor.id,key,parsed.data);return reply.code(result.replayed?200:201).send(result);
  });
}
