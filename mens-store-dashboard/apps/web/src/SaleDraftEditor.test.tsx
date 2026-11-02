import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SaleDraftEditor} from './SaleDraftEditor.js';
import {draftFixture as draft,draftOptions} from './sale-draft.fixture.js';
import {ApiError,readJson,saleOptions} from './store-api.js';
import {CommandScope} from './pending-command.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn(),saleOptions:vi.fn()}));
const complete=vi.fn(),close=vi.fn(),mount=(editing=false)=>render(<CommandScope.Provider value="draft-editor-test"><SaleDraftEditor draft={editing?draft:undefined} complete={complete} close={close}/></CommandScope.Provider>);
const submit=()=>fireEvent.submit(screen.getByRole('form',{name:'حفظ المسودة'}));
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();vi.mocked(saleOptions).mockResolvedValue(draftOptions);vi.mocked(readJson).mockResolvedValue(draft);});afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('creates a held draft with editable lines and only one in-flight request',async()=>{
  let resolve!:(value:unknown)=>void;vi.mocked(readJson).mockImplementationOnce(()=>new Promise(yes=>{resolve=yes;}));mount();await waitFor(()=>expect(screen.getByRole('button',{name:'إضافة صنف'})).toBeEnabled());submit();expect(screen.getByRole('alert')).toHaveTextContent('اختر العميل');
  fireEvent.change(screen.getByLabelText('نوع المسودة'),{target:{value:'HELD'}});fireEvent.change(screen.getByLabelText('عميل المسودة'),{target:{value:draft.customerId}});fireEvent.change(screen.getByLabelText('فرع المسودة'),{target:{value:draft.warehouseId}});fireEvent.click(screen.getByRole('button',{name:'إضافة صنف'}));fireEvent.click(screen.getByRole('button',{name:'إضافة صنف'}));
  fireEvent.change(screen.getByLabelText('صنف المسودة 1'),{target:{value:draftOptions.products[1]!.id}});fireEvent.change(screen.getByLabelText('كمية 1'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('سعر 1'),{target:{value:'31'}});fireEvent.change(screen.getByLabelText('خصم 1'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'حذف السطر 2'}));submit();submit();
  expect(readJson).toHaveBeenCalledTimes(1);expect(readJson).toHaveBeenCalledWith('/sale-drafts',expect.objectContaining({method:'POST'}));expect(JSON.parse(vi.mocked(readJson).mock.calls[0]![1]!.body as string)).toMatchObject({kind:'HELD',lines:[{quantity:'2',unitPrice:'31',discount:'1'}]});await act(async()=>resolve(draft));expect(complete).toHaveBeenCalledTimes(1);
});
it('reopens an existing draft, handles stale versions and closes explicitly',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(new ApiError(409));mount(true);await waitFor(()=>expect(screen.getByRole('button',{name:'إضافة صنف'})).toBeEnabled());expect(screen.getByLabelText('نوع المسودة')).toBeDisabled();submit();await screen.findByRole('alert');expect(readJson).toHaveBeenCalledWith('/sale-drafts/'+draft.id,expect.objectContaining({method:'PATCH'}));expect(JSON.parse(vi.mocked(readJson).mock.calls[0]![1]!.body as string).version).toBe(1);fireEvent.click(screen.getByRole('button',{name:'إلغاء التعديلات'}));expect(close).toHaveBeenCalled();
});
it('restores the exact pending creation after a lost response',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));mount(true);await waitFor(()=>expect(screen.getByRole('button',{name:'إضافة صنف'})).toBeEnabled());submit();await screen.findByText('تعذر تأكيد الحفظ. أعد نفس الطلب المحفوظ للتحقق من نتيجته.');const first=vi.mocked(readJson).mock.calls[0];cleanup();mount(true);await screen.findByRole('button',{name:'إعادة نفس الطلب المحفوظ'});fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));await waitFor(()=>expect(complete).toHaveBeenCalled());expect(vi.mocked(readJson).mock.calls[1]).toEqual(first);
});
it('retries option loading, handles no products and blocks corrupt recovery',async()=>{
  vi.mocked(saleOptions).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({...draftOptions,products:[]});mount();await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'إعادة تحميل القوائم'}));await waitFor(()=>expect(saleOptions).toHaveBeenCalledTimes(2));expect(screen.getByRole('button',{name:'إضافة صنف'})).toBeDisabled();cleanup();sessionStorage.setItem('ahmed-store.pending.draft-editor-test.draft-save.new','broken');mount();await screen.findByText(/تعذر قراءة الطلب المحفوظ/);expect(screen.getByRole('button',{name:'حفظ المسودة'})).toBeDisabled();
});
it.each([true,false])('ignores delayed option results after unmount (%s)',async success=>{let resolve!:(value:typeof draftOptions)=>void,reject!:(error:Error)=>void;vi.mocked(saleOptions).mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));const view=mount();view.unmount();await act(async()=>{if(success)resolve(draftOptions);else reject(Error('aborted'));});});
