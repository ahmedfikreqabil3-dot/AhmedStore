import { expect, it } from 'vitest';
import { customerImportCommandSchema, customerImportPreviewSchema } from '../src/customer-import.js';
it('bounds stored import commands and validates typed preview errors',()=>{
  expect(customerImportCommandSchema.parse({filename:'customers.xlsx',content:'AA=='})).toHaveProperty('content','AA==');
  for(const value of [{filename:'',content:'AA=='},{filename:'test',content:'not base64?'},{filename:'test',content:'A'.repeat(1398108)}])expect(customerImportCommandSchema.safeParse(value).success).toBe(false);
  expect(customerImportPreviewSchema.parse({valid:false,rows:[],errors:[{row:1,message:'INVALID_WORKBOOK'}]}).valid).toBe(false);
});
