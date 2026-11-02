import { PostingPeriodError } from '../finance/posting-period.js';
import { TreasuryError } from '../finance/treasury-errors.js';
export function publicError(error:unknown,requestId:string){
  if(error instanceof PostingPeriodError)return {statusCode:409,body:{error:error.reason,requestId}};
  if(error instanceof TreasuryError)return {statusCode:409,body:{error:error.reason,requestId}};
  const candidate=error!==null&&typeof error==='object'&&'statusCode' in error ? error.statusCode : undefined;
  const statusCode=typeof candidate==='number'&&Number.isInteger(candidate)&&candidate>=400&&candidate<500 ? candidate : 500;
  return {statusCode,body:{error:statusCode===500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST',requestId}};
}
