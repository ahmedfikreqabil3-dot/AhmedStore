import { Prisma } from '@prisma/client';

// Posting callers re-read their idempotency record inside each fresh transaction.
export async function retryWriteConflict<T>(work:()=>Promise<T>,remaining=2):Promise<T>{
  try{return await work();}
  catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError && remaining>0 &&
      (error.code==='P2028'&&error.meta?.error==='Unable to start a transaction in the given time.' || ['P2034','P2002'].includes(error.code) || error.code==='P2010' && ['40001','40P01'].includes(String(error.meta?.code))))return retryWriteConflict(work,remaining-1);
    throw error;
  }
}
