import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CustomerImport } from './CustomerImport.js';
import { CommandScope } from './pending-command.js';
import { ApiError, readJson } from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const row={row:2,name:'عميل المراجعة',phone:null,email:null,address:null,notes:null,creditLimit:'00'};
const preview={valid:true,rows:[row],errors:[]};
const saved=vi.fn();
beforeEach(()=>{sessionStorage.clear();vi.mocked(readJson).mockReset();saved.mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const mount=()=>render(<CommandScope.Provider value="customer-import-test"><CustomerImport saved={saved}/></CommandScope.Provider>);
function upload(name='customers.xlsx',size=3){const file=new File([new Uint8Array(size)],name);Object.defineProperty(file,'arrayBuffer',{value:async()=>new Uint8Array(size).buffer});fireEvent.change(screen.getByLabelText('ملف العملاء'),{target:{files:[file]}});}
async function prepare(){vi.mocked(readJson).mockResolvedValueOnce(preview);upload();await screen.findByText(row.name);fireEvent.click(screen.getByRole('checkbox'));}
it('requires review and imports the exact reviewed bytes using an idempotency key',async()=>{
  mount();vi.mocked(readJson).mockResolvedValueOnce(preview);upload();await screen.findByText(row.name);
  expect(screen.getByText('بدون سقف')).toBeVisible();expect(screen.getByRole('button',{name:'تأكيد استيراد العملاء'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));vi.mocked(readJson).mockResolvedValueOnce({imported:1,replayed:false});fireEvent.click(screen.getByRole('button',{name:'تأكيد استيراد العملاء'}));
  await screen.findByText('تم استيراد 1 عميل بنجاح.');expect(saved).toHaveBeenCalledOnce();expect(sessionStorage.length).toBe(0);
  expect(readJson).toHaveBeenLastCalledWith('/customers/import',expect.objectContaining({method:'POST',headers:expect.objectContaining({'idempotency-key':expect.any(String)})}));
});
it('recovers the identical upload and key after an uncertain network failure and remount',async()=>{
  const view=mount();await prepare();vi.mocked(readJson).mockRejectedValueOnce(Error('timeout'));fireEvent.click(screen.getByRole('button',{name:'تأكيد استيراد العملاء'}));await screen.findByRole('alert');
  const original=vi.mocked(readJson).mock.calls.at(-1)!;expect(screen.getByLabelText('ملف العملاء')).toBeDisabled();view.unmount();
  mount();expect(screen.getByText(/الملف المحفوظ: customers.xlsx/)).toBeVisible();vi.mocked(readJson).mockResolvedValueOnce({imported:1,replayed:true});fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));await screen.findByText('تم استيراد 1 عميل بنجاح.');
  expect(vi.mocked(readJson).mock.calls.at(-1)![1]!.headers).toEqual(original[1]!.headers);expect(saved).toHaveBeenCalledOnce();
});
it('blocks invalid and oversized files, reports preview failures and invalid rows without enabling import',async()=>{
  mount();upload('wrong.csv');await screen.findByRole('alert');expect(readJson).not.toHaveBeenCalled();upload('big.xlsx',1048577);expect(readJson).not.toHaveBeenCalled();
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));upload();await screen.findByText(/تعذرت معاينة/);
  vi.mocked(readJson).mockResolvedValueOnce({valid:false,rows:[],errors:[{row:2,message:'CUSTOMER_EXISTS'}]});upload();await screen.findByText(/عميل موجود بالفعل/);expect(screen.queryByRole('button',{name:'تأكيد استيراد العملاء'})).not.toBeInTheDocument();
});
it('clears a definitive rejected attempt and blocks unreadable stored commands',async()=>{
  const view=mount();await prepare();vi.mocked(readJson).mockRejectedValueOnce(new ApiError(400,'INVALID_IMPORT'));fireEvent.click(screen.getByRole('button',{name:'تأكيد استيراد العملاء'}));await screen.findByRole('alert');expect(sessionStorage.length).toBe(0);view.unmount();
  sessionStorage.setItem('ahmed-store.pending.customer-import-test.customer-import','broken');mount();expect(screen.getByText(/تعذر قراءة الطلب المحفوظ/)).toBeVisible();expect(screen.getByLabelText('ملف العملاء')).toBeDisabled();
});
it('paginates every preview row before confirmation',async()=>{
  mount();vi.mocked(readJson).mockResolvedValueOnce({...preview,rows:Array.from({length:26},(_,index)=>({...row,row:index+2,name:'عميل '+index}))});upload();await screen.findByText('عميل 0');
  fireEvent.click(screen.getByRole('button',{name:'صفوف تالية'}));expect(screen.getByText('عميل 25')).toBeVisible();expect(screen.queryByText('عميل 0')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'صفوف سابقة'}));expect(screen.getByText('عميل 0')).toBeVisible();
});

it('downloads the template, handles failures and prevents overlapping template requests',async()=>{
  const revoke=vi.fn();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=> 'blob:template')});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const fetcher=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,blob:async()=>new Blob(['template'])});vi.stubGlobal('fetch',fetcher);
  mount();fireEvent.click(screen.getByRole('button',{name:'تنزيل نموذج العملاء'}));await screen.findByText(/تعذر تنزيل/);
  await act(async()=>{const button=screen.getByRole('button',{name:'تنزيل نموذج العملاء'});button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  expect(fetcher).toHaveBeenCalledTimes(2);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1100));});expect(revoke).toHaveBeenCalledWith('blob:template');
});

it('handles cancelled selections, ignores overlapping previews and shows full customer data',async()=>{
  mount();fireEvent.change(screen.getByLabelText('ملف العملاء'),{target:{files:[]}});expect(readJson).not.toHaveBeenCalled();
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  await act(async()=>{upload();upload();});expect(readJson).toHaveBeenCalledTimes(1);
  await act(async()=>resolve({...preview,rows:[{...row,phone:'0501234567',email:'full@example.test',address:'عنوان العميل',notes:'ملاحظات العميل',creditLimit:'5'}]}));
  expect(screen.getByText('0501234567')).toBeVisible();fireEvent.click(screen.getByText('العنوان والملاحظات'));expect(screen.getByText('عنوان العميل')).toBeVisible();
});

it('preserves uncertain malformed responses and prevents double submission',async()=>{
  mount();await prepare();vi.mocked(readJson).mockResolvedValueOnce({imported:0});
  await act(async()=>{const button=screen.getByRole('button',{name:'تأكيد استيراد العملاء'});button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  expect(readJson).toHaveBeenCalledTimes(2);expect(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'})).toBeVisible();expect(saved).not.toHaveBeenCalled();
});
