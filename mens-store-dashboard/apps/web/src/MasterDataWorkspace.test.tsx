import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MasterDataWorkspace} from './MasterDataWorkspace.js';
import {ApiError,readJson} from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));
const organizationId='ce5435a8-93e0-48d8-87b5-cdb58e45f92a',id='ab8ce3b4-3af9-4f30-a650-e635dd6b1c80',id2='ab8ce3b4-3af9-4f30-a650-e635dd6b1c81';
const modes=[{kind:'warehouses',label:'اسم الفرع',add:'إضافة فرع',search:'بحث الفروع'},{kind:'categories',label:'اسم الفئة',add:'إضافة فئة',search:'بحث الفئات'}] as const;
function row(kind:string,name='الأساسي',active=true){return{id,organizationId,name,...kind==='warehouses'?{active}:{archivedAt:active?null:'2026-01-01'}};}
beforeEach(()=>vi.mocked(readJson).mockReset());afterEach(()=>cleanup());
it.each(modes)('lists, searches, validates and creates $kind with one POST during a pending submission',async mode=>{
  let resolve!:(value:unknown)=>void,created=false;
  vi.mocked(readJson).mockImplementation(async(_path,options)=>{
    if(options?.method==='POST')return new Promise(yes=>{resolve=yes;});
    return {[mode.kind]:[row(mode.kind),{...row(mode.kind,'سابق',false),id:id2},...created?[{...row(mode.kind,'جديد'),id:organizationId}]:[]]};
  });
  render(<MasterDataWorkspace kind={mode.kind}/>);expect(screen.getByText('جارٍ تحميل القائمة…')).toBeVisible();
  fireEvent.submit(screen.getByRole('form'));await screen.findByText('الأساسي');expect(screen.getByText('نشط')).toBeVisible();expect(screen.getByText('غير نشط')).toBeVisible();
  fireEvent.change(screen.getByLabelText(mode.search),{target:{value:' السابق '}});expect(screen.getByText('لا توجد نتائج للبحث.')).toBeVisible();
  fireEvent.change(screen.getByLabelText(mode.search),{target:{value:'  سابق '}});expect(screen.getByText('عدد النتائج: 1')).toBeVisible();fireEvent.change(screen.getByLabelText(mode.search),{target:{value:''}});
  fireEvent.change(screen.getByLabelText(mode.label),{target:{value:' '}});fireEvent.submit(screen.getByRole('form'));expect(screen.getByRole('alert')).toHaveTextContent('الاسم مطلوب');expect(screen.getByLabelText(mode.label)).toHaveAttribute('aria-invalid','true');
  fireEvent.change(screen.getByLabelText(mode.label),{target:{value:' الأساسي '}});fireEvent.submit(screen.getByRole('form'));expect(screen.getByRole('alert')).toHaveTextContent('مسجل بالفعل');
  fireEvent.change(screen.getByLabelText(mode.label),{target:{value:' جديد '}});fireEvent.submit(screen.getByRole('form'));fireEvent.submit(screen.getByRole('form'));
  expect(screen.getByRole('button',{name:'جارٍ الإضافة…'})).toBeDisabled();expect(vi.mocked(readJson).mock.calls.filter(([,options])=>options?.method==='POST')).toHaveLength(1);
  expect(readJson).toHaveBeenCalledWith('/'+mode.kind,expect.objectContaining({method:'POST',body:'{"name":"جديد"}'}));
  await act(async()=>{created=true;resolve({...row(mode.kind,'جديد'),id:organizationId});});
  await screen.findByText('جديد');expect(screen.getByText('تمت الإضافة: جديد')).toBeVisible();expect(screen.getByLabelText(mode.label)).toHaveValue('');
});
it.each(modes)('loads an empty $kind list and retries a failed initial read',async mode=>{
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline')).mockResolvedValue({[mode.kind]:[]});render(<MasterDataWorkspace kind={mode.kind}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل');expect(screen.getByRole('button',{name:mode.add})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'إعادة تحميل القائمة'}));
  await screen.findByText('عدد النتائج: 0');expect(screen.getByRole('button',{name:mode.add})).toBeEnabled();expect(screen.getByText(mode.kind==='warehouses'?'لا توجد فروع مسجلة.':'لا توجد فئات مسجلة.')).toBeVisible();
});
it.each(['network','duplicate','forbidden','malformed'])('keeps the name and refreshes the authoritative list after %s creation failure',async failure=>{
  let committed=false;
  vi.mocked(readJson).mockImplementation(async(_path,options)=>{
    if(options?.method==='POST'){committed=true;if(failure==='malformed')return {};throw failure==='duplicate'?new ApiError(409):failure==='forbidden'?new ApiError(403):Error('lost response');}
    return {warehouses:committed?[row('warehouses','مضاف')]:[]};
  });
  render(<MasterDataWorkspace kind="warehouses"/>);await screen.findByText('عدد النتائج: 0');fireEvent.change(screen.getByLabelText('اسم الفرع'),{target:{value:'مضاف'}});fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByRole('alert')).toHaveTextContent(failure==='duplicate'?'مسجل بالفعل':'راجع القائمة المحدّثة');await screen.findByText('مضاف');expect(screen.getByLabelText('اسم الفرع')).toHaveValue('مضاف');
  fireEvent.submit(screen.getByRole('form'));expect(vi.mocked(readJson).mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
it.each([true,false])('ignores stale list completion on unmount (success=%s)',async success=>{
  let resolve!:(value:unknown)=>void,reject!:(reason:Error)=>void;vi.mocked(readJson).mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));
  const view=render(<MasterDataWorkspace kind="categories"/>),signal=vi.mocked(readJson).mock.calls[0]![1]!.signal!;view.unmount();expect(signal.aborted).toBe(true);
  await act(async()=>{if(success)resolve({categories:[]});else reject(Error('abort'));});
});
