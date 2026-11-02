import fs from 'node:fs';import path from 'node:path';import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';import {pipeline} from 'node:stream/promises';import {spawn} from 'node:child_process';import {Prisma,type PrismaClient} from '@prisma/client';
export const secret=(name:string,env:NodeJS.ProcessEnv=process.env)=>env[name]??(env[name+'_FILE']?fs.readFileSync(env[name+'_FILE']!,'utf8').trim():undefined);
export function databaseUrl(raw:string){const u=new URL(raw);if(!['postgres:','postgresql:'].includes(u.protocol))throw Error('POSTGRES_DATABASE_URL_REQUIRED');if(!['localhost','127.0.0.1','postgres'].includes(u.hostname)&&u.searchParams.get('sslmode')!=='verify-full')throw Error('VERIFIED_DATABASE_TLS_REQUIRED');return u;}
export const sha=async(file:string)=>{const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');};
export async function snapshot(tx:Prisma.TransactionClient){
 const tables=await tx.$queryRaw<Array<{name:string}>>`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,rows=[];
 for(const {name} of tables){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))throw Error('INVALID_TABLE');const [r]=await tx.$queryRawUnsafe<Array<{count:number;fingerprint:string}>>(`SELECT count(*)::int AS count,md5(COALESCE(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) AS fingerprint FROM "${name}" t`);rows.push({table:name,...r});}
 const schema=await tx.$queryRaw<Array<{kind:string;name:string;definition:string}>>`
 SELECT 'column' AS kind,c.table_name||'.'||c.column_name AS name,c.udt_name||':'||c.is_nullable||':'||COALESCE(c.column_default,'') AS definition FROM information_schema.columns c WHERE c.table_schema='public'
 UNION ALL SELECT 'constraint',conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace
 UNION ALL SELECT 'index',indexname,indexdef FROM pg_indexes WHERE schemaname='public'
 UNION ALL SELECT 'trigger',tgrelid::regclass::text||'.'||tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)
 UNION ALL SELECT 'function',proname||'('||pg_get_function_identity_arguments(oid)||')',pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'
 UNION ALL SELECT 'grant',table_name||'.'||grantee||'.'||privilege_type,is_grantable FROM information_schema.role_table_grants WHERE table_schema='public'
 ORDER BY kind,name,definition`;
 return{tables:rows,schemaHash:createHash('sha256').update(JSON.stringify(schema)).digest('hex')};
}
export async function readSnapshot(db:PrismaClient){return db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;return snapshot(tx);},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000});}
export async function runPg(tool:'pg_dump'|'pg_restore',url:string,args:string[]){
 const u=databaseUrl(url),exe=process.env.PG_BIN?path.join(process.env.PG_BIN,tool+(process.platform==='win32'?'.exe':'')):tool;
 const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGSSLMODE:u.searchParams.get('sslmode')??(['localhost','127.0.0.1','postgres'].includes(u.hostname)?'disable':'verify-full')};
 await new Promise<void>((yes,no)=>{const child=spawn(exe,['--no-password',...(tool==='pg_restore'?['--dbname',env.PGDATABASE]:[]),...args],{env,windowsHide:true,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>{if(error.length<20000)error+=b.toString();});const timer=setTimeout(()=>{child.kill();no(Error('POSTGRES_TOOL_TIMEOUT'));},300000);child.once('error',e=>{clearTimeout(timer);no(e);});child.once('exit',code=>{clearTimeout(timer);code===0?yes():no(Error(tool+' failed: '+error.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')));});});
}
const magic=Buffer.from('ASBK1');
export function backupKey(){const raw=secret('BACKUP_ENCRYPTION_KEY');if(!raw||!/^[a-fA-F0-9]{64}$/.test(raw))throw Error('BACKUP_ENCRYPTION_KEY_REQUIRED_64_HEX');return Buffer.from(raw,'hex');}
export async function encrypt(input:string,output:string,key:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),out=fs.createWriteStream(output,{mode:0o600});out.write(Buffer.concat([magic,iv,Buffer.alloc(16)]));await pipeline(fs.createReadStream(input),cipher,out);const fd=fs.openSync(output,'r+');try{fs.writeSync(fd,cipher.getAuthTag(),0,16,17);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export async function decrypt(input:string,output:string,key:Buffer){const fd=fs.openSync(input,'r'),header=Buffer.alloc(33);try{if(fs.readSync(fd,header)!==33||!header.subarray(0,5).equals(magic))throw Error('INVALID_BACKUP_ARCHIVE');}finally{fs.closeSync(fd);}const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(5,17));decipher.setAuthTag(header.subarray(17,33));await pipeline(fs.createReadStream(input,{start:33}),decipher,fs.createWriteStream(output,{mode:0o600}));}
