import {expect,it,vi} from 'vitest';import {createDocumentService} from '../../../src/modules/documents/service.js';
it('projects only public print settings and tolerates unrelated legacy JSON fields',async()=>{
 const findUniqueOrThrow=vi.fn(async()=>({name:'Shop',settings:{phone:'123',receiptHeader:'Header',receiptFooter:'Footer',version:2,privateToken:'hidden'}}));
 const service=createDocumentService({organization:{findUniqueOrThrow}} as never);
 expect(await service.settings('org')).toEqual({name:'Shop',phone:'123',address:'',receiptHeader:'Header',receiptFooter:'Footer'});
 findUniqueOrThrow.mockResolvedValueOnce({name:'Shop',settings:null} as never);expect(await service.settings('org')).toEqual({name:'Shop',phone:'',address:'',receiptHeader:'',receiptFooter:''});
});
