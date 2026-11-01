export function publicError(error:unknown,requestId:string){
  const candidate=error!==null&&typeof error==='object'&&'statusCode' in error ? error.statusCode : undefined;
  const statusCode=typeof candidate==='number'&&Number.isInteger(candidate)&&candidate>=400&&candidate<500 ? candidate : 500;
  return {statusCode,body:{error:statusCode===500 ? 'INTERNAL_SERVER_ERROR' : 'INVALID_REQUEST',requestId}};
}
