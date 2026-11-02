import fs from 'node:fs';import {PrismaClient} from '@prisma/client';import {z} from 'zod';import {bundleSchema,assertTrialUrl} from './schema.js';import {importBundle,reconcileBundle} from './import.js';import {hashPassword} from '../../apps/api/src/modules/identity/password.js';
const [command,file]=process.argv.slice(2);if(!file||!['validate','dry-run','apply','reconcile'].includes(command))throw Error('Usage: cli.ts validate|dry-run|apply|reconcile bundle.json');const b=bundleSchema.parse(JSON.parse(fs.readFileSync(file,'utf8')));
if(command==='validate'){console.log(JSON.stringify({valid:true,sourceSystem:b.sourceSystem,batchKey:b.batchKey}));}else{
 const url=assertTrialUrl(process.env.MIGRATION_DATABASE_URL??''),db=new PrismaClient({datasources:{db:{url:url.toString()}}});try{
 if(command==='reconcile'){console.log(JSON.stringify(await db.$transaction(tx=>reconcileBundle(tx,b),{isolationLevel:'RepeatableRead',timeout:60000}),null,2));}else{const email=z.string().trim().email().toLowerCase().parse(process.env.MIGRATION_ADMIN_EMAIL),password=z.string().min(12).max(128).parse(process.env.MIGRATION_ADMIN_PASSWORD);console.log(JSON.stringify(await importBundle(db,b,{email,passwordHash:await hashPassword(password),dryRun:command==='dry-run'}),null,2));}
 }finally{await db.$disconnect();}
}
