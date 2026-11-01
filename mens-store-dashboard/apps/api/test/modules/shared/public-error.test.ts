import { expect,it } from 'vitest';
import { publicError } from '../../../src/modules/shared/public-error.js';
it('preserves valid client statuses without exposing internal data and normalizes unknown failures',()=>{
  for(const statusCode of [400,401,408,413,415,429,499])expect(publicError({statusCode,message:'sensitive input',sql:'private query'},'req-1')).toEqual({statusCode,body:{error:'INVALID_REQUEST',requestId:'req-1'}});
  for(const error of [null,undefined,'private failure',{},new Error('database credentials'),{statusCode:'400'},{statusCode:400.5},{statusCode:399},{statusCode:500},{statusCode:503},{statusCode:NaN}])expect(publicError(error,'req-2')).toEqual({statusCode:500,body:{error:'INTERNAL_SERVER_ERROR',requestId:'req-2'}});
});
