import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandScope } from './pending-command.js';
import { NoInvoiceReturnApproval, NoInvoiceReturnSubmission, PurchaseEntryEditor, PurchaseReturnForm, submitNoInvoiceReturn } from './App.js';

const supplier='e5b51424-a9af-417d-9efe-71a4790e6ce1',warehouse='e5b51424-a9af-417d-9efe-71a4790e6ce2',product='e5b51424-a9af-417d-9efe-71a4790e6ce3',customer='e5b51424-a9af-417d-9efe-71a4790e6ce4',line='e5b51424-a9af-417d-9efe-71a4790e6ce5',purchaseId='e5b51424-a9af-417d-9efe-71a4790e6ce6';
const options={suppliers:[{id:supplier,name:'المورد'}],warehouses:[{id:warehouse,name:'الفرع'}],products:[{id:product,name:'قميص',barcode:'123',costPrice:'10.0000'}]};
const purchase={id:purchaseId,supplierId:supplier,warehouseId:warehouse,status:'POSTED' as const,total:'10.0000',occurredAt:'2026-10-30T10:00:00.000Z',lines:[{id:line,lineNumber:1,productId:product,productName:'قميص',sku:'SH-1',barcode:'123',quantity:'1.0000',unitCost:'10.0000',total:'10.0000'}]};
const input={supplierId:supplier,warehouseId:warehouse,lines:[{productId:product,quantity:'1',unitCost:'10.0000'}],payments:[{method:'CASH',amount:'10'}],occurredAt:'2026-10-30T10:00:00.000Z'};
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
const click=(name:string)=>fireEvent.click(screen.getByRole('button',{name}));
function save(operation:string,body:unknown){sessionStorage.setItem(`ahmed-store.pending.org.user.${operation}`,JSON.stringify({version:1,key:'original-key',input:body}));}
afterEach(()=>{cleanup();sessionStorage.clear();vi.unstubAllGlobals();});

it('recovers the exact persisted purchase after remount and keeps editing locked until its result is known',async()=>{
  save('purchase-create',input);const post=vi.fn().mockResolvedValue({id:'posted'});
  render(<CommandScope.Provider value="org.user"><PurchaseEntryEditor options={options} post={post}/></CommandScope.Provider>);
  expect(screen.getByLabelText('مورد فاتورة المشتريات')).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));
  expect(await screen.findByText('تم حفظ فاتورة المشتريات posted.')).toBeVisible();
  expect(post).toHaveBeenCalledWith(input,'original-key');expect(sessionStorage.length).toBe(0);
});

it('recovers replacement and purchase-return commands independently from new purchase commands',async()=>{
  save(`purchase-replace.${purchaseId}`,input);const revise=vi.fn().mockResolvedValue({id:'replacement'});
  const view=render(<CommandScope.Provider value="org.user"><PurchaseEntryEditor revisionOf={purchase} options={{...options,products:[]}} revise={revise}/></CommandScope.Provider>);
  fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));await screen.findByText('تم حفظ فاتورة بديلة replacement.');expect(revise).toHaveBeenCalledWith(purchaseId,input,'original-key');view.unmount();
  const returned={purchaseId,lines:[{purchaseLineId:line,quantity:'1'}],reason:'سبب الإرجاع',settlements:[{kind:'SUPPLIER_CREDIT',amount:'10'}],occurredAt:input.occurredAt};
  save(`purchase-return.${purchaseId}`,returned);const send=vi.fn().mockResolvedValue({id:'returned',purchaseId,total:'10'});
  render(<CommandScope.Provider value="org.user"><PurchaseReturnForm purchase={{...purchase,lines:[]}} submitReturn={send}/></CommandScope.Provider>);
  fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));await screen.findByText('تم حفظ مرتجع المشتريات returned بقيمة 10.');expect(send).toHaveBeenCalledWith(returned,'original-key');
});

it('restores no-invoice requests including their original timestamp and blocks invalid saved inputs',async()=>{
  const returned={customerId:customer,warehouseId:warehouse,productId:product,quantity:'1',unitPrice:'10',paymentMethod:'CASH',paymentAmount:'10',reason:'سبب الإرجاع',itemCondition:'صالح للبيع',occurredAt:input.occurredAt};
  const returnOptions={customers:[{id:customer,name:'العميل'}],products:[{id:product,name:'قميص',salePrice:'10'}],branches:[{id:warehouse,name:'الفرع'}]};
  save('no-invoice-return',returned);const send=vi.fn().mockResolvedValue({id:'return',total:'10'});
  const view=render(<CommandScope.Provider value="org.user"><NoInvoiceReturnSubmission loadOptions={async()=>returnOptions} submitReturn={send}/></CommandScope.Provider>);
  await screen.findByLabelText('عميل المرتجع');fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));await screen.findByText(/تم إرسال طلب المرتجع return/);expect(send).toHaveBeenCalledWith(returned,'original-key');view.unmount();
  save('no-invoice-return',{...returned,occurredAt:undefined});
  render(<CommandScope.Provider value="org.user"><NoInvoiceReturnSubmission loadOptions={async()=>returnOptions}/></CommandScope.Provider>);
  expect(screen.getByRole('alert')).toHaveTextContent('تعذر قراءة الطلب المحفوظ');
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'return',total:'10'})});vi.stubGlobal('fetch',fetchMock);
  await submitNoInvoiceReturn(returned as Parameters<typeof submitNoInvoiceReturn>[0],'key');
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body).occurredAt).toBe(input.occurredAt);
});

it('keeps one original command across a failed response and synchronously blocks rapid duplicate submission',async()=>{
  let reject!:(reason:Error)=>void;
  const post=vi.fn().mockImplementationOnce(()=>new Promise((_resolve,fail)=>{reject=fail;})).mockResolvedValue({id:'recovered'});
  const key=vi.fn(()=>'one-key');render(<PurchaseEntryEditor options={options} post={post} createKey={key}/>);
  change('مورد فاتورة المشتريات',supplier);change('فرع فاتورة المشتريات',warehouse);change('منتج فاتورة المشتريات',product);
  change('كمية بند المشتريات','1');fireEvent.click(screen.getByRole('button',{name:'إضافة بند'}));change('مبلغ سداد المشتريات','10');fireEvent.click(screen.getByRole('button',{name:'إضافة دفعة'}));
  const button=screen.getByRole('button',{name:'حفظ فاتورة المشتريات'});
  act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(post).toHaveBeenCalledOnce();
  await act(async()=>{reject(Error('lost response'));});expect(screen.getByLabelText('مورد فاتورة المشتريات')).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));await screen.findByText('تم حفظ فاتورة المشتريات recovered.');
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);expect(key).toHaveBeenCalledOnce();
});

it('blocks duplicate finance approvals while the same return is in flight',async()=>{
  let resolve!:(value:{id:string;total:string})=>void;const approve=vi.fn(()=>new Promise<{id:string;total:string}>(done=>{resolve=done;}));
  render(<NoInvoiceReturnApproval loadPending={async()=>[{id:'pending',customerId:customer,warehouseId:warehouse,reason:'طلب مراجعة',total:'10',status:'PENDING_APPROVAL',occurredAt:input.occurredAt}]} approve={approve}/>);
  const button=await screen.findByRole('button',{name:'اعتماد المرتجع'});
  act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(approve).toHaveBeenCalledOnce();
  await act(async()=>{resolve({id:'pending',total:'10'});});await waitFor(()=>expect(screen.getByText('لا توجد طلبات معلقة.')).toBeVisible());
});

it('blocks rapid duplicate purchase-return commands before React disables the controls',async()=>{
  let resolve!:(value:{id:string;purchaseId:string;total:string})=>void;const submit=vi.fn(()=>new Promise<{id:string;purchaseId:string;total:string}>(done=>{resolve=done;}));
  render(<PurchaseReturnForm purchase={purchase} submitReturn={submit}/>);change('كمية إرجاع قميص','1');change('سبب مرتجع المشتريات','سبب الإرجاع');change('رصيد المورد','10');
  const button=screen.getByRole('button',{name:'حفظ مرتجع المشتريات'});act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(submit).toHaveBeenCalledOnce();
  await act(async()=>{resolve({id:'return',purchaseId,total:'10'});});expect(screen.getByText('تم حفظ مرتجع المشتريات return بقيمة 10.')).toBeVisible();
});

it('blocks rapid duplicate no-invoice requests before React disables the controls',async()=>{
  let resolve!:(value:{id:string;total:string})=>void;const submit=vi.fn(()=>new Promise<{id:string;total:string}>(done=>{resolve=done;}));
  render(<NoInvoiceReturnSubmission loadOptions={async()=>({customers:[{id:customer,name:'العميل'}],branches:[{id:warehouse,name:'الفرع'}],products:[{id:product,name:'قميص',salePrice:'10'}]})} submitReturn={submit}/>);
  await screen.findByLabelText('عميل المرتجع');for(const [label,value] of [['عميل المرتجع',customer],['فرع المرتجع',warehouse],['منتج المرتجع',product],['كمية المرتجع','1'],['مبلغ استرداد المرتجع','10'],['سبب المرتجع بدون فاتورة','سبب الإرجاع'],['حالة منتج المرتجع','صالح للبيع']])change(label!,value!);
  const button=screen.getByRole('button',{name:'إرسال للموافقة المالية'});act(()=>{fireEvent.click(button);fireEvent.click(button);});expect(submit).toHaveBeenCalledOnce();
  await act(async()=>{resolve({id:'return',total:'10'});});expect(screen.getByText(/تم إرسال طلب المرتجع return/)).toBeVisible();
});

it.each(['POSTED','VOIDED'] as const)('recovers the true %s state of an earlier no-invoice request',async status=>{
  const saved={customerId:customer,warehouseId:warehouse,productId:product,quantity:'1',unitPrice:'10',paymentMethod:'CASH',paymentAmount:'10',reason:'سبب الإرجاع',itemCondition:'صالح للبيع',occurredAt:'2026-10-30T10:00:00.000Z'};
  const storageKey='ahmed-store.pending.org.user.no-invoice-return';sessionStorage.setItem(storageKey,JSON.stringify({version:1,key:'original-request',input:saved}));
  render(<CommandScope.Provider value="org.user"><NoInvoiceReturnSubmission loadOptions={async()=>({customers:[{id:customer,name:'العميل'}],branches:[{id:warehouse,name:'الفرع'}],products:[{id:product,name:'قميص',salePrice:'10'}]})} submitReturn={async()=>({id:'prior-return',total:'10',status})}/></CommandScope.Provider>);
  click('إعادة نفس الطلب المحفوظ');expect(await screen.findByText(status==='POSTED' ? 'تم تأكيد الطلب السابق prior-return؛ تمت الموافقة المالية بالفعل.' : 'تم العثور على الطلب السابق prior-return وهو معكوس؛ راجع سجل المرتجعات.')).toBeVisible();expect(sessionStorage.getItem(storageKey)).toBeNull();
});
