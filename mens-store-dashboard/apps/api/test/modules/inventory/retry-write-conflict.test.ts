import { Prisma } from '@prisma/client';
import { expect, it, vi } from 'vitest';
import { retryWriteConflict } from '../../../src/modules/shared/retry-write-conflict.js';
it('retries only bounded serializable/unique write conflicts and propagates other failures',async()=>{
  for(const code of ['P2034','P2002']){
    const error=new Prisma.PrismaClientKnownRequestError('conflict',{code,clientVersion:'test'});
    const work=vi.fn().mockRejectedValueOnce(error).mockResolvedValue('done');expect(await retryWriteConflict(work)).toBe('done');expect(work).toHaveBeenCalledTimes(2);
    const exhausted=vi.fn().mockRejectedValue(error);await expect(retryWriteConflict(exhausted)).rejects.toBe(error);expect(exhausted).toHaveBeenCalledTimes(3);
  }
  for(const error of [Error('audit unavailable'),new Prisma.PrismaClientKnownRequestError('foreign key',{code:'P2003',clientVersion:'test'})]){
    const work=vi.fn().mockRejectedValue(error);await expect(retryWriteConflict(work)).rejects.toBe(error);expect(work).toHaveBeenCalledOnce();
  }
});
it.each(['40001','40P01'])('retries raw PostgreSQL conflict %s with a fresh transaction and bounded attempts',async code=>{
  const error=new Prisma.PrismaClientKnownRequestError('raw transaction conflict',{code:'P2010',clientVersion:'test',meta:{code}});
  const work=vi.fn().mockRejectedValueOnce(error).mockResolvedValue('replayed');expect(await retryWriteConflict(work)).toBe('replayed');expect(work).toHaveBeenCalledTimes(2);
  const exhausted=vi.fn().mockRejectedValue(error);await expect(retryWriteConflict(exhausted)).rejects.toBe(error);expect(exhausted).toHaveBeenCalledTimes(3);
});
it('does not retry unrelated or unclassified raw SQL errors',async()=>{
  for(const meta of [undefined,{code:'23505'},{code:'42601'}]){
    const error=new Prisma.PrismaClientKnownRequestError('raw query failure',{code:'P2010',clientVersion:'test',meta}),work=vi.fn().mockRejectedValue(error);
    await expect(retryWriteConflict(work)).rejects.toBe(error);expect(work).toHaveBeenCalledOnce();
  }
});
