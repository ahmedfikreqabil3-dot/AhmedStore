import {expect,it} from 'vitest';
import {pooledDatabaseUrl} from '../../src/operations/config.js';
it('bounds the shared Prisma pool and preserves explicit connection settings',()=>{
 expect(()=>pooledDatabaseUrl('invalid-secret-url',{})).toThrow('INVALID_DATABASE_URL');
 const raw='postgresql://app:synthetic@localhost/store?sslmode=require&connection_limit=4';
 const url=new URL(pooledDatabaseUrl(raw,{}));expect(url.searchParams.get('connection_limit')).toBe('4');expect(url.searchParams.get('sslmode')).toBe('require');expect(url.searchParams.get('pool_timeout')).toBe('10');
 expect(new URL(pooledDatabaseUrl(raw,{DATABASE_POOL_SIZE:'8'})).searchParams.get('connection_limit')).toBe('8');
 expect(()=>pooledDatabaseUrl(raw,{DATABASE_POOL_SIZE:'100'})).toThrow('INVALID_DATABASE_POOL_SIZE');
 expect(()=>pooledDatabaseUrl(raw,{DATABASE_POOL_TIMEOUT_SECONDS:'0'})).toThrow('INVALID_DATABASE_POOL_TIMEOUT_SECONDS');
});
