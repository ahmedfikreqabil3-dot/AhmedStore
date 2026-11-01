import { Prisma } from '@prisma/client';

// Posting callers re-read their idempotency record inside each fresh transaction.
export async function retryWriteConflict<T>(work:()=>Promise<T>,remaining=2):Promise<T>{
  try{return await work();}
  catch(error){
    if(error instanceof Prisma.PrismaClientKnownRequestError && ['P2034','P2002'].includes(error.code) && remaining>0)return retryWriteConflict(work,remaining-1);
    throw error;
  }
}
