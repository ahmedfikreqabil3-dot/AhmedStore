vi.mock('./InventoryTransfers.js',()=>({InventoryTransfers:()=> <section>تحويلات فعلية</section>}));
vi.mock('./InventoryMovements.js',()=>({InventoryMovements:()=> <section>حركات رصيد فعلية</section>}));
vi.mock('./StockCounts.js',()=>({StockCounts:()=> <section>جرد فعلي</section>}));
vi.mock('./StockThresholds.js',()=>({StockThresholds:()=> <section>حدود المخزون</section>}));
vi.mock('./ExpensesWorkspace.js',()=>({ExpensesWorkspace:()=> <section>مصروفات فعلية</section>}));
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@ahmed-store/contracts';
import { StoreApp, StoreLogin } from './StoreApp.js';
import { currentUser, signIn, signOut } from './store-api.js';
import { LivePOS } from './LivePOS.js';
vi.mock('./store-api.js', () => ({ currentUser: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('./PartyWorkspace.js',()=>({PartyWorkspace:({kind,canEdit=true}:{kind:string;canEdit?:boolean})=><section>{kind==='customers' ? `عملاء ${canEdit ? 'تعديل' : 'عرض'}` : 'موردون'}</section>}));
vi.mock('./LivePOS.js', () => ({ LivePOS: vi.fn(() => <div>نقطة البيع المتصلة</div>) }));
vi.mock('./CatalogueWorkspace.js', () => ({ CatalogueWorkspace: ({ view }: { view: string }) => <section>{view === 'products' ? 'كتالوج حي' : 'رصيد المخزون'}</section> }));
vi.mock('./App.js', () => ({
  LoadedProductCatalogue: () => <section>كتالوج حي</section>, CategoryImportPanel: () => <section>استيراد فئات</section>, ProductImportPanel: () => <section>استيراد منتجات</section>,
  HistoricalInventory: () => <section>رصيد المخزون</section>, LoadedPurchaseEntryEditor: () => <section>محرر مشتريات</section>, PurchaseSelector: () => <section>سجل مشتريات</section>,
  SupplierImportPanel: () => <section>استيراد موردين</section>, SalesHistorySearch: () => <section>تاريخ المبيعات</section>, ShiftPanel: () => <section>الوردية الحالية</section>,
  ShiftReviewPanel: () => <section>مراجعة ورديات</section>, NoInvoiceReturnApproval: () => <section>اعتماد مرتجعات</section>, NoInvoiceReturnSubmission: () => <section>إنشاء مرتجع</section>,
  categoryImportActions: {}, productImportActions: {}, supplierImportActions: {}, downloadSalesHistoryXlsx: vi.fn(), loadSalesHistory: vi.fn()
}));
const user: PublicUser = { id: 'a62886aa-d435-4145-a551-37b675a86f84', organizationId: 'ce5435a8-93e0-48d8-87b5-cdb58e45f92a', name: 'أحمد محمود', email: 'ahmed@example.com', role: 'ADMIN' };
beforeEach(() => { location.hash = ''; vi.mocked(currentUser).mockResolvedValue(user); vi.mocked(signIn).mockResolvedValue(user); vi.mocked(signOut).mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
async function route(hash: string) { await act(async () => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); }); }
function fillLogin() { fireEvent.change(screen.getByLabelText('معرّف المؤسسة'), { target: { value: user.organizationId } }); fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), { target: { value: user.email } }); fireEvent.change(screen.getByLabelText('كلمة المرور'), { target: { value: 'secure-password' } }); }

describe('authenticated operational shell', () => {
  it('opens the expense workspace for finance and denies it to a cashier',async()=>{
    vi.mocked(currentUser).mockResolvedValueOnce({...user,role:'FINANCE'});const view=render(<StoreApp/>);await screen.findByRole('heading',{name:'مرحبًا، أحمد محمود'});await route('expenses');expect(await screen.findByText('مصروفات فعلية')).toBeVisible();view.unmount();
    vi.mocked(currentUser).mockResolvedValueOnce({...user,role:'CASHIER'});render(<StoreApp/>);await screen.findByText('نقطة البيع المتصلة');expect(screen.queryByRole('link',{name:'المصروفات'})).not.toBeInTheDocument();expect(screen.queryByText('مصروفات فعلية')).not.toBeInTheDocument();
  });
  it('restores the server session and separates operations into authorized pages', async () => {
    render(<StoreApp/>); expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحقق'); await screen.findByText('مرحبًا، أحمد محمود');
    for (const [hash, content] of [['stock-operations','تحويلات فعلية'],['customers','عملاء تعديل'],['suppliers','موردون'],['products', 'كتالوج حي'], ['sales', 'تاريخ المبيعات'], ['purchases', 'محرر مشتريات'], ['inventory', 'رصيد المخزون'], ['finance', 'مراجعة ورديات'], ['returns', 'اعتماد مرتجعات'], ['pos', 'نقطة البيع المتصلة']]) {
      await route(hash); expect(screen.getByText(content)).toBeVisible();
    }
    fireEvent.click(screen.getByRole('link', { name: 'انتقل لمساحة العمل' })); expect(document.activeElement).toHaveAttribute('id', 'workspace');
    await route('not-authorized'); expect(screen.getByText('مرحبًا، أحمد محمود')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' })); await screen.findByRole('heading', { name: 'سجّل دخولك' }); expect(signOut).toHaveBeenCalledTimes(1);
  });
  it.each(['CASHIER', 'MANAGER', 'WAREHOUSE', 'FINANCE'] as const)('reflects %s permissions and rejects an unauthorized URL', async (role) => {
    vi.mocked(currentUser).mockResolvedValue({ ...user, role }); render(<StoreApp/>); await screen.findByText('مرحبًا، أحمد محمود');
    const nav = screen.getByRole('navigation', { name: 'التنقل الرئيسي' });
    if (role === 'CASHIER') { await route('customers');expect(screen.getByText('عملاء عرض')).toBeVisible(); expect(nav).not.toHaveTextContent('المنتجات'); await route('finance'); expect(screen.getByText('الوردية الحالية')).toBeVisible(); expect(screen.queryByText('مراجعة ورديات')).not.toBeInTheDocument(); await route('products'); expect(screen.getByText('مرحبًا، أحمد محمود')).toBeVisible(); }
    if (role === 'MANAGER') { await route('returns'); expect(screen.getByText('إنشاء مرتجع')).toBeVisible(); expect(screen.queryByText('اعتماد مرتجعات')).not.toBeInTheDocument(); }
    if (role === 'WAREHOUSE') { expect(nav).not.toHaveTextContent('نقطة البيع'); await route('pos'); expect(screen.getByText('مرحبًا، أحمد محمود')).toBeVisible(); }
    if (role === 'FINANCE') { await route('returns'); expect(screen.getByText('اعتماد مرتجعات')).toBeVisible(); expect(screen.queryByText('إنشاء مرتجع')).not.toBeInTheDocument(); }
  });
  it('does not mount protected operations before login and uses the authenticated identity after login', async () => {
    vi.mocked(currentUser).mockResolvedValue(null); render(<StoreApp/>); await screen.findByRole('heading', { name: 'سجّل دخولك' }); expect(LivePOS).not.toHaveBeenCalled();
    fillLogin(); fireEvent.submit(screen.getByRole('form', { name: 'تسجيل الدخول' })); await screen.findByText('مرحبًا، أحمد محمود'); expect(signIn).toHaveBeenCalledWith(user.organizationId, user.email, 'secure-password');
  });
  it('allows retry after a failed session check and keeps the session on failed logout', async () => {
    vi.mocked(currentUser).mockRejectedValueOnce(Error('offline')); render(<StoreApp/>); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر التحقق'); fireEvent.click(screen.getByRole('button', { name: 'إعادة التحقق من الجلسة' })); await screen.findByText('مرحبًا، أحمد محمود');
    vi.mocked(signOut).mockRejectedValueOnce(Error('offline')); fireEvent.click(screen.getByRole('button', { name: 'تسجيل الخروج' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تسجيل الخروج'); expect(screen.getByText('مرحبًا، أحمد محمود')).toBeVisible();
  });
  it('shows a rejected login without mounting operations', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(Error('invalid')); const accepted = vi.fn(); render(<StoreLogin onSuccess={accepted}/>); fillLogin(); fireEvent.submit(screen.getByRole('form', { name: 'تسجيل الدخول' })); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تسجيل الدخول'); expect(accepted).not.toHaveBeenCalled();
  });
  it('ignores successful and failed session checks after unmount', async () => {
    let resolve!: (user: PublicUser | null) => void; vi.mocked(currentUser).mockReturnValueOnce(new Promise((done) => { resolve = done; })); const pending = render(<StoreApp/>); pending.unmount(); await act(async () => resolve(user));
    let reject!: (reason: unknown) => void; vi.mocked(currentUser).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; })); const failing = render(<StoreApp/>); failing.unmount(); await act(async () => reject(Error('offline')));
  });
});
