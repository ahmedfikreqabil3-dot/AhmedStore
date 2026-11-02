import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {UsersWorkspace} from './UsersWorkspace.js';
import {ApiError,readJson} from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const user={id:'ab8ce3b4-3af9-4f30-a650-e635dd6b1c80',organizationId:'ce5435a8-93e0-48d8-87b5-cdb58e45f92a',name:'المدير',email:'admin@example.test',role:'ADMIN'};
const created={...user,id:'ab8ce3b4-3af9-4f30-a650-e635dd6b1c81',name:'محاسب جديد',email:'new@example.test',role:'FINANCE'};
const password='Test-only-password';
beforeEach(()=>vi.mocked(readJson).mockReset());afterEach(()=>{cleanup();vi.restoreAllMocks();});
function fill(){fireEvent.change(screen.getByLabelText('اسم المستخدم'),{target:{value:' محاسب جديد '}});fireEvent.change(screen.getByLabelText('البريد الإلكتروني'),{target:{value:' NEW@example.test '}});fireEvent.change(screen.getByLabelText('كلمة المرور'),{target:{value:password}});fireEvent.change(screen.getByLabelText('الدور'),{target:{value:'FINANCE'}});}
it('validates and creates one user, normalizes email, refreshes the list and never stores credentials',async()=>{
  let resolve!:(value:unknown)=>void,committed=false;const storage=vi.spyOn(Storage.prototype,'setItem');
  vi.mocked(readJson).mockImplementation(async(_path,options)=>options?.method==='POST'?new Promise(yes=>{resolve=yes;}):{users:committed?[user,created]:[user]});
  render(<UsersWorkspace/>);expect(screen.getByText('جارٍ تحميل المستخدمين…')).toBeVisible();fireEvent.submit(screen.getByRole('form'));await screen.findByText('المدير');
  expect(screen.getByLabelText('الدور')).toHaveValue('CASHIER');expect(screen.getAllByRole('option')).toHaveLength(5);expect(screen.getByLabelText('كلمة المرور')).toHaveAttribute('type','password');
  fireEvent.change(screen.getByLabelText('بحث المستخدمين'),{target:{value:'missing'}});expect(screen.getByText('لا توجد نتائج للبحث.')).toBeVisible();fireEvent.change(screen.getByLabelText('بحث المستخدمين'),{target:{value:'  ADMIN@EXAMPLE.TEST '}});expect(screen.getByText('عدد النتائج: 1')).toBeVisible();fireEvent.change(screen.getByLabelText('بحث المستخدمين'),{target:{value:''}});
  fireEvent.submit(screen.getByRole('form'));expect(screen.getByRole('alert')).toHaveTextContent('كلمة مرور من 12');fill();fireEvent.change(screen.getByLabelText('البريد الإلكتروني'),{target:{value:' ADMIN@example.test '}});fireEvent.submit(screen.getByRole('form'));expect(screen.getByRole('alert')).toHaveTextContent('مسجل بالفعل');
  fill();fireEvent.submit(screen.getByRole('form'));fireEvent.submit(screen.getByRole('form'));expect(screen.getByRole('button',{name:'جارٍ إنشاء المستخدم…'})).toBeDisabled();
  const posts=vi.mocked(readJson).mock.calls.filter(([,o])=>o?.method==='POST');expect(posts).toHaveLength(1);expect(JSON.parse(posts[0]![1]!.body as string)).toEqual({name:created.name,email:created.email,password,role:'FINANCE'});
  await act(async()=>{committed=true;resolve(created);});await screen.findByText('محاسب جديد');expect(screen.getByText('تم إنشاء المستخدم: محاسب جديد')).toBeVisible();expect(screen.getByLabelText('كلمة المرور')).toHaveValue('');expect(screen.getByLabelText('اسم المستخدم')).toHaveValue('');expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue('');expect(screen.getByLabelText('الدور')).toHaveValue('CASHIER');expect(storage).not.toHaveBeenCalled();
});
it('retries failed loading and supports an empty directory',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline')).mockResolvedValue({users:[]});render(<UsersWorkspace/>);expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل');expect(screen.getByRole('button',{name:'إضافة مستخدم'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'إعادة تحميل المستخدمين'}));await screen.findByText('لا يوجد مستخدمون مسجلون.');expect(screen.getByRole('button',{name:'إضافة مستخدم'})).toBeEnabled();
});
it('rejects malformed directory responses',async()=>{vi.mocked(readJson).mockResolvedValue({users:[{name:'missing identity'}]});render(<UsersWorkspace/>);await screen.findByRole('alert');expect(screen.getByRole('button',{name:'إضافة مستخدم'})).toBeDisabled();});
it.each(['network','duplicate','forbidden','malformed'])('does not automatically replay credentials after %s creation failure',async failure=>{
  let committed=false;vi.mocked(readJson).mockImplementation(async(_path,options)=>{if(options?.method==='POST'){committed=true;if(failure==='malformed')return {};throw failure==='duplicate'?new ApiError(409):failure==='forbidden'?new ApiError(403):Error('lost response');}return {users:committed?[user,created]:[user]};});
  render(<UsersWorkspace/>);await screen.findByText('المدير');fill();fireEvent.submit(screen.getByRole('form'));expect(await screen.findByRole('alert')).toHaveTextContent(failure==='duplicate'?'مسجل بالفعل':'راجع القائمة المحدّثة');await screen.findByText('محاسب جديد');expect(screen.getByLabelText('كلمة المرور')).toHaveValue('');expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue('NEW@example.test');expect(vi.mocked(readJson).mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
it.each([true,false])('ignores aborted directory responses (success=%s)',async success=>{
  let resolve!:(value:unknown)=>void,reject!:(reason:Error)=>void;vi.mocked(readJson).mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));const view=render(<UsersWorkspace/>),signal=vi.mocked(readJson).mock.calls[0]![1]!.signal!;view.unmount();expect(signal.aborted).toBe(true);await act(async()=>{if(success)resolve({users:[]});else reject(Error('abort'));});
});
