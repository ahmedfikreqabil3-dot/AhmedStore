import {afterEach,expect,it,vi} from 'vitest';
import {invoiceFixture} from './sale-document.fixture.js';
import {printSaleDocument} from './invoice-print.js';
afterEach(()=>vi.restoreAllMocks());
it('prints exact invoice and return amounts on A4 and 80mm with escaped user content',async()=>{
  const write=vi.fn(),print=vi.fn(),append=vi.fn(),popup={opener:window,closed:false,print,document:{write,close:vi.fn(),fonts:{ready:Promise.resolve()},body:{getBoundingClientRect:()=>({height:300})},createElement:()=>({textContent:''}),head:{append}}};vi.spyOn(window,'open').mockReturnValue(popup as unknown as Window);
  await printSaleDocument({...invoiceFixture,organizationName:'<script>alert(1)</script>'},'a4');expect(write.mock.calls[0]![0]).toContain('&lt;script&gt;');expect(write.mock.calls[0]![0]).toContain('39.9000');expect(write.mock.calls[0]![0]).toContain('size:A4');expect(popup.opener).toBeNull();expect(print).toHaveBeenCalledOnce();
  await printSaleDocument(invoiceFixture,'80mm',invoiceFixture.returns[0]!.id);expect(write.mock.calls[1]![0]).toContain('إيصال مرتجع بيع');expect(write.mock.calls[1]![0]).toContain('9.9750');expect(append.mock.calls[0]![0].textContent).toContain('size:80mm');
  popup.closed=true;await printSaleDocument(invoiceFixture,'80mm');expect(print).toHaveBeenCalledTimes(2);
});
it('reports blocked windows and unavailable return documents',async()=>{
  vi.spyOn(window,'open').mockReturnValue(null);await expect(printSaleDocument(invoiceFixture,'a4')).rejects.toThrow('PRINT_POPUP_BLOCKED');await expect(printSaleDocument(invoiceFixture,'a4','missing')).rejects.toThrow('RETURN_UNAVAILABLE');
});
