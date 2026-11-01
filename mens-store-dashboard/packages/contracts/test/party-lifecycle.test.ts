import {expect,it} from 'vitest';
import {partyDirectoryQuerySchema,partyLifecycleSchema} from '../src/party-lifecycle.js';
it('requires a reason, version and explicit target state and bounds directory pagination',()=>{
  const command={version:1,active:false,reason:'  توقف التعامل  '};expect(partyLifecycleSchema.parse(command).reason).toBe('توقف التعامل');
  for(const fields of [{version:0},{reason:'x'},{reason:'x'.repeat(501)},{active:'false'},{organizationId:'foreign'}])expect(partyLifecycleSchema.safeParse({...command,...fields}).success).toBe(false);
  expect(partyDirectoryQuerySchema.parse({})).toEqual({status:'all',limit:25,offset:0});
  for(const query of [{status:'deleted'},{limit:101},{limit:0},{offset:-1},{offset:100001},{organizationId:'foreign'}])expect(partyDirectoryQuerySchema.safeParse(query).success).toBe(false);
});
