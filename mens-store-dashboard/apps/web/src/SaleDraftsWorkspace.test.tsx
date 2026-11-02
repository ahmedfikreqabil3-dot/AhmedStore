import '@testing-library/jest-dom/vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SaleDraftsWorkspace} from './SaleDraftsWorkspace.js';
import {draftFixture as draft} from './sale-draft.fixture.js';
import {readJson} from './store-api.js';
vi.mock('./store-api.js',()=>({readJson:vi.fn()}));
vi.mock('./SaleDraftEditor.js',()=>({SaleDraftEditor:({draft:value,complete,close}:{draft?:typeof draft;complete:(value:typeof draft)=>void;close:()=>void})=><section><p>{value?'تعديل اختبار':'جديد اختبار'}</p><button onClick={()=>complete(draft)}>حفظ اختبار</button><button onClick={close}>إغلاق اختبار</button></section>}));
vi.mock('./SaleDraftActions.js',()=>({SaleDraftActions:({complete}:{complete:(value:typeof draft)=>void})=><button onClick={()=>complete({...draft,status:'CONVERTED',version:2,saleId:draft.id})}>تحويل اختبار</button>}));
vi.mock('./InvoiceDocument.js',()=>({InvoiceDocument:()=> <p>فاتورة المسودة</p>}));
const page={items:[draft,{...draft,id:draft.warehouseId,kind:'QUOTATION',status:'CANCELLED'},{...draft,id:draft.customerId,kind:'QUOTATION',status:'CONVERTED',saleId:draft.id}],total:26,limit:25,offset:0},click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
beforeEach(()=>{vi.mocked(readJson).mockReset().mockImplementation(async path=>({...page,offset:Number(new URLSearchParams(path.split('?')[1]).get('offset'))}));});afterEach(cleanup);
it('creates, reopens, edits and converts drafts, then opens the resulting invoice',async()=>{
  render(<SaleDraftsWorkspace canEdit/>);await screen.findByText('عدد المسودات: 26');click('مسودة جديدة');expect(screen.getByText('جديد اختبار')).toBeVisible();click('إغلاق اختبار');click('مسودة جديدة');click('حفظ اختبار');await screen.findByText('مسودة مفتوحة');click('تعديل المسودة');expect(screen.getByText('تعديل اختبار')).toBeVisible();click('حفظ اختبار');click('تحويل اختبار');await screen.findByText('تم التحويل لفاتورة بيع');click('عرض فاتورة البيع');expect(screen.getByText('فاتورة المسودة')).toBeVisible();click('عرض فاتورة البيع');expect(screen.queryByText('فاتورة المسودة')).not.toBeInTheDocument();
  click('فتح المسودة '+draft.warehouseId);expect(screen.getByText('تم إلغاء المسودة')).toBeVisible();click('التالي');await waitFor(()=>expect(screen.getByRole('button',{name:'السابق'})).toBeEnabled());click('السابق');fireEvent.change(screen.getByLabelText('نوع قائمة المسودات'),{target:{value:'HELD'}});fireEvent.change(screen.getByLabelText('حالة المسودات'),{target:{value:''}});await waitFor(()=>expect(readJson).toHaveBeenLastCalledWith(expect.stringContaining('kind=HELD'),expect.any(Object)));
});
it('supports read-only roles, errors, empty results and refresh',async()=>{
  vi.mocked(readJson).mockRejectedValueOnce(Error('offline'));const view=render(<SaleDraftsWorkspace canEdit={false}/>);await screen.findByRole('alert');click('تحديث المسودات');await screen.findByText('عدد المسودات: 26');expect(screen.queryByRole('button',{name:'مسودة جديدة'})).not.toBeInTheDocument();click('فتح المسودة '+draft.id);expect(screen.queryByRole('button',{name:'تعديل المسودة'})).not.toBeInTheDocument();vi.mocked(readJson).mockResolvedValueOnce({...page,items:[],total:0});click('تحديث المسودات');await screen.findByText('لا توجد مسودات للفلاتر المحددة.');view.rerender(<SaleDraftsWorkspace canEdit/>);click('مسودة جديدة');view.rerender(<SaleDraftsWorkspace canEdit={false}/>);expect(screen.queryByText('جديد اختبار')).not.toBeInTheDocument();
});
it.each([true,false])('ignores stale list results (%s)',async success=>{let resolve!:(value:unknown)=>void,reject!:(value:Error)=>void;vi.mocked(readJson).mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}));const view=render(<SaleDraftsWorkspace canEdit/>);view.unmount();await act(async()=>{if(success)resolve(page);else reject(Error('aborted'));});});
