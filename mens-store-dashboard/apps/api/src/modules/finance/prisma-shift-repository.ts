import { Prisma, type PrismaClient, type Shift } from '@prisma/client';
import { can } from '../identity/authorization.js';
import { retryWriteConflict } from '../shared/retry-write-conflict.js';
import { ShiftActorUnavailableError } from './shift-service.js';
import type { ShiftRepository } from './shift-service.js';
function shiftRecord(shift: Shift) {
  return { ...shift, expectedCash: shift.expectedCash?.toFixed(4) ?? null, countedCash: shift.countedCash?.toFixed(4) ?? null, cashDifference: shift.cashDifference?.toFixed(4) ?? null };
}
export function createPrismaShiftRepository(prisma:PrismaClient):ShiftRepository{return {
  async findOpen(organizationId, userId) {
    const shift = await prisma.shift.findFirst({ where: { organizationId, userId, status: 'OPEN' } });
    return shift && shiftRecord(shift);
  },
  async create(organizationId, userId, openedAt) {
    return retryWriteConflict(()=>prisma.$transaction(async tx=>{
      const actor=await tx.user.findFirst({where:{id:userId,organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'shifts:manage_own'))throw new ShiftActorUnavailableError();
      const existing=await tx.shift.findFirst({where:{organizationId,userId,status:'OPEN'}});if(existing)return shiftRecord(existing);
      const shift=await tx.shift.create({data:{organizationId,userId,openedAt}});
      await tx.auditEvent.create({data:{organizationId,actorUserId:userId,action:'SHIFT_OPENED',entityType:'Shift',entityId:shift.id}});return shiftRecord(shift);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  },
  async findById(organizationId, shiftId) {
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, organizationId } });
    return shift && shiftRecord(shift);
  },
  async close(organizationId, shiftId, userId, closedAt, reconciliation) {
    return retryWriteConflict(()=>prisma.$transaction(async tx=>{
      const actor=await tx.user.findFirst({where:{id:userId,organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'shifts:manage_own'))return null;
      const updated=await tx.shift.updateMany({where:{id:shiftId,organizationId,userId,status:'OPEN'},data:{status:'CLOSED',closedAt,closedByUserId:userId,...reconciliation}});if(!updated.count)return null;
      const shift=await tx.shift.findUniqueOrThrow({where:{id:shiftId}});await tx.auditEvent.create({data:{organizationId,actorUserId:userId,action:'SHIFT_CLOSED',entityType:'Shift',entityId:shift.id,details:{...reconciliation,closedAt:closedAt.toISOString()}}});return shiftRecord(shift);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  },
  async review(organizationId, shiftId, reviewerUserId, reviewedAt) {
    return retryWriteConflict(()=>prisma.$transaction(async tx=>{
      const actor=await tx.user.findFirst({where:{id:reviewerUserId,organizationId,active:true},select:{role:true}});if(!actor||!can(actor.role,'shifts:review'))return null;
      const updated=await tx.shift.updateMany({where:{id:shiftId,organizationId,status:'CLOSED'},data:{status:'REVIEWED',reviewedAt,reviewedByUserId:reviewerUserId}});if(!updated.count)return null;
      const shift=await tx.shift.findUniqueOrThrow({where:{id:shiftId}});await tx.auditEvent.create({data:{organizationId,actorUserId:reviewerUserId,action:'SHIFT_REVIEWED',entityType:'Shift',entityId:shift.id}});return shiftRecord(shift);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable}));
  },
  async listClosed(organizationId) {
    return (await prisma.shift.findMany({ where: { organizationId, status: { in: ['CLOSED', 'REVIEWED'] } }, orderBy: { closedAt: 'desc' } })).map(shiftRecord);
  }
};}
