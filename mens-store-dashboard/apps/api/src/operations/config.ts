import fs from 'node:fs';import {isIP} from 'node:net';
export type RuntimeConfig={production:boolean;host:string;port:number;origin?:string;trustProxy:false|string[];metricsToken?:string;logLevel:string;bodyLimit:number;rateMax:number;authRateMax:number};
export function runtimeConfig(env:NodeJS.ProcessEnv=process.env):RuntimeConfig{
 const get=(name:string)=>env[name]??(env[name+'_FILE']?fs.readFileSync(env[name+'_FILE']!,'utf8').trim():undefined),production=env.NODE_ENV==='production';
 const number=(key:string,fallback:number,max:number)=>{const n=Number(get(key)??fallback);if(!Number.isInteger(n)||n<1||n>max)throw Error('INVALID_'+key);return n;};
 const metricsToken=get('METRICS_TOKEN'),origin=get('APP_ORIGIN'),proxies=(get('TRUST_PROXY')??'').split(',').map(s=>s.trim()).filter(Boolean);
 for(const proxy of proxies){const [host,prefix]=proxy.split('/'),version=isIP(host);if(!version||prefix!==undefined&&(!/^\d+$/.test(prefix)||Number(prefix)<1||Number(prefix)>(version===4?32:128)))throw Error('INVALID_TRUST_PROXY');}
 if(production){const database=get('DATABASE_URL');if(!database)throw Error('DATABASE_URL_REQUIRED');let u:URL;try{u=new URL(database);}catch{throw Error('INVALID_DATABASE_URL');}if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||/CHANGE_ME|REPLACE/i.test(u.password)||['postgres','root'].includes(decodeURIComponent(u.username)))throw Error('PRODUCTION_APP_DATABASE_ROLE_REQUIRED');if(!['127.0.0.1','localhost','postgres'].includes(u.hostname)&&u.searchParams.get('sslmode')!=='verify-full')throw Error('VERIFIED_DATABASE_TLS_REQUIRED');if(!origin)throw Error('APP_ORIGIN_REQUIRED');let app:URL;try{app=new URL(origin);}catch{throw Error('INVALID_APP_ORIGIN');}if(app.protocol!=='https:'||app.origin!==origin||app.username||app.password)throw Error('HTTPS_APP_ORIGIN_REQUIRED');if(!proxies.length)throw Error('EXPLICIT_TRUST_PROXY_REQUIRED');if(!metricsToken||metricsToken.length<32||/CHANGE_ME|REPLACE/i.test(metricsToken))throw Error('STRONG_METRICS_TOKEN_REQUIRED');}
 const logLevel=get('LOG_LEVEL')??(env.NODE_ENV==='test'?'silent':'info');if(!['fatal','error','warn','info','debug','trace','silent'].includes(logLevel))throw Error('INVALID_LOG_LEVEL');
 return{production,host:get('API_HOST')??'127.0.0.1',port:number('PORT',3000,65535),origin,trustProxy:proxies.length?proxies:false,metricsToken,logLevel,bodyLimit:number('BODY_LIMIT_BYTES',1048576,10485760),rateMax:number('RATE_LIMIT_MAX',env.NODE_ENV==='test'?100000:600,100000),authRateMax:number('AUTH_RATE_LIMIT_MAX',env.NODE_ENV==='test'?100000:10,100000)};
}
export function pooledDatabaseUrl(raw:string,env:NodeJS.ProcessEnv=process.env){
 let url:URL;try{url=new URL(raw)}catch{throw Error('INVALID_DATABASE_URL')};
 for(const [parameter,key,fallback,max] of [['connection_limit','DATABASE_POOL_SIZE',10,50],['pool_timeout','DATABASE_POOL_TIMEOUT_SECONDS',10,120]] as const){
  const value=env[key]??url.searchParams.get(parameter)??String(fallback),n=Number(value);
  if(!Number.isInteger(n)||n<1||n>max)throw Error('INVALID_'+key);
  url.searchParams.set(parameter,String(n));
 }
 return url.toString();
}
export function loadRuntime(){if(!process.env.DATABASE_URL&&process.env.DATABASE_URL_FILE)process.env.DATABASE_URL=fs.readFileSync(process.env.DATABASE_URL_FILE,'utf8').trim();if(process.env.DATABASE_URL)process.env.DATABASE_URL=pooledDatabaseUrl(process.env.DATABASE_URL);return runtimeConfig();}
