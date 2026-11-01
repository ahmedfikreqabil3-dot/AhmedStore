import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PartyLifecycle} from './PartyLifecycle.js';
import {ApiError,readJson} from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const id='63c8a4d3-1a33-4d0a-bb8f-0a85ad29a14f';
const party={id,organizationId:id,name:'شركة الملابس',phone:null,email:null,address:null,notes:null,active:true,version:1};
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
const reason=(value:string)=>fireEvent.change(screen.getByLabelText('سبب إجراء الطرف'),{target:{value}});
beforeEach(()=>{vi.mocked(readJson).mockResolvedValue({id,active:false,version:2});});afterEach(()=>{cleanup();vi.resetAllMocks();});

it('validates, reviews and archives a supplier with its original version and a reason',async()=>{
  const complete=vi.fn(),close=vi.fn();render(<PartyLifecycle kind="suppliers" party={party} complete={complete} close={close}/>);
  expect(screen.getByRole('heading',{name:'أرشفة شركة الملابس'})).toHaveFocus();click('مراجعة إجراء الطرف');expect(screen.getByRole('alert')).toHaveTextContent('اكتب سببًا');reason('  توقف التعامل  ');click('مراجعة إجراء الطرف');click('رجوع لسبب الإجراء');expect(screen.getByLabelText('سبب إجراء الطرف')).toHaveValue('  توقف التعامل  ');click('مراجعة إجراء الطرف');click('تأكيد أرشفة الطرف');await act(async()=>{});
  expect(complete).toHaveBeenCalledOnce();expect(readJson).toHaveBeenCalledWith(`/suppliers/${id}/lifecycle`,expect.objectContaining({method:'PATCH',body:JSON.stringify({version:1,active:false,reason:'توقف التعامل'})}));expect(close).not.toHaveBeenCalled();
});

it('reactivates an archived party without changing history and makes abandoning a reason explicit',async()=>{
  const close=vi.fn();const view=render(<PartyLifecycle kind="suppliers" party={{...party,active:false}} complete={vi.fn()} close={close}/>);
  expect(screen.getByText(/التفعيل يعيد السجل/)).toBeVisible();click('إلغاء إجراء الطرف');expect(close).toHaveBeenCalledOnce();reason('استئناف التعامل');click('إلغاء إجراء الطرف');click('استكمال إجراء الطرف');expect(screen.getByLabelText('سبب إجراء الطرف')).toHaveValue('استئناف التعامل');click('إلغاء إجراء الطرف');click('تجاهل الإجراء وإغلاق');expect(close).toHaveBeenCalledTimes(2);
  view.unmount();vi.mocked(readJson).mockResolvedValueOnce({id,active:true,version:3});render(<PartyLifecycle kind="suppliers" party={{...party,active:false,version:2}} complete={vi.fn()} close={vi.fn()}/>);reason('استئناف التعامل');click('مراجعة إجراء الطرف');click('تأكيد إعادة تفعيل الطرف');await act(async()=>{});expect(JSON.parse(vi.mocked(readJson).mock.calls[0]![1]!.body as string).active).toBe(true);
});

it.each(['OPEN_BALANCE','PENDING_DOCUMENT','VERSION_CONFLICT','ACTOR_UNAVAILABLE','PARTY_NOT_FOUND','UNKNOWN'])('explains the lifecycle rejection %s and offers a fresh read instead of pretending to save',async code=>{
  const complete=vi.fn(),close=vi.fn();vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409,code));render(<PartyLifecycle kind="suppliers" party={party} complete={complete} close={close}/>);reason('توقف التعامل');click('مراجعة إجراء الطرف');click('تأكيد أرشفة الطرف');await screen.findByRole('alert');expect(complete).not.toHaveBeenCalled();click('تحديث السجل وإغلاق');expect(close).toHaveBeenCalledOnce();
});

it.each([Error('offline'),{invalid:true}])('does not claim a confirmed lifecycle result for a network or malformed response',async failure=>{
  if('invalid' in failure)vi.mocked(readJson).mockResolvedValueOnce(failure);else vi.mocked(readJson).mockRejectedValueOnce(failure);
  render(<PartyLifecycle kind="suppliers" party={party} complete={vi.fn()} close={vi.fn()}/>);reason('توقف التعامل');click('مراجعة إجراء الطرف');click('تأكيد أرشفة الطرف');expect(await screen.findByRole('alert')).toHaveTextContent('قد تكون حالة السجل');
});

it('locks both duplicate saves and cancellation synchronously while the lifecycle request is pending',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockReturnValueOnce(new Promise(done=>{resolve=done;}));const close=vi.fn();render(<PartyLifecycle kind="suppliers" party={party} complete={vi.fn()} close={close}/>);reason('توقف التعامل');click('مراجعة إجراء الطرف');const save=screen.getByRole('button',{name:'تأكيد أرشفة الطرف'}),cancel=screen.getByRole('button',{name:'إلغاء إجراء الطرف'});
  act(()=>{save.dispatchEvent(new MouseEvent('click',{bubbles:true}));save.dispatchEvent(new MouseEvent('click',{bubbles:true}));cancel.dispatchEvent(new MouseEvent('click',{bubbles:true}));});expect(readJson).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'جارٍ التحقق والحفظ…'})).toBeDisabled();await act(async()=>{resolve({id,active:false,version:2});});
});
