import { InventoryTransfers } from './InventoryTransfers.js';
import { ExpensesWorkspace } from './ExpensesWorkspace.js';
import { InventoryMovements } from './InventoryMovements.js';
import { StockCounts } from './StockCounts.js';
import { StockThresholds } from './StockThresholds.js';
import { PartyWorkspace } from './PartyWorkspace.js';
import { CommandScope } from './pending-command.js';
import { useEffect, useState, type FormEvent } from 'react';
import type { PublicUser } from '@ahmed-store/contracts';
import { LoadedPurchaseEntryEditor, NoInvoiceReturnApproval, NoInvoiceReturnSubmission, PurchaseSelector, SalesHistorySearch, ShiftPanel, ShiftReviewPanel, SupplierImportPanel, downloadSalesHistoryXlsx, loadSalesHistory, supplierImportActions } from './App.js';
import { currentUser, signIn, signOut } from './store-api.js';
import { CatalogueWorkspace } from './CatalogueWorkspace.js';
import { LivePOS } from './LivePOS.js';
import { Icon } from './ui/Icon.js';

const pages = [
  { id: 'home', description: 'ابدأ مهمة جديدة أو انتقل إلى سجلات متجرك.', label: 'نظرة عامة', icon: 'dashboard', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE', 'FINANCE'] },
  { id: 'pos', description: 'أضف الأصناف وحدّد الفرع والعميل، ثم راجع السداد.', label: 'نقطة البيع', icon: 'pos', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
  { id: 'customers', description: 'بيانات العملاء والتواصل وحدود الائتمان.', label: 'العملاء', icon: 'user', roles: ['ADMIN','MANAGER','CASHIER'] },
  { id: 'suppliers', description: 'بيانات الموردين والتواصل.', label: 'الموردون', icon: 'purchase', roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'products', description: 'كل تفاصيل منتجاتك وأسعارها وأرصدة فروعك.', label: 'المنتجات', icon: 'box', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { id: 'sales', description: 'راجع الفواتير المسجلة وحدّد الفترة المطلوبة.', label: 'سجل المبيعات', icon: 'sales', roles: ['ADMIN', 'MANAGER', 'FINANCE'] },
  { id: 'purchases', description: 'استلام البضاعة، فواتير الموردين، ومرتجعات التوريد.', label: 'المشتريات', icon: 'purchase', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { id: 'stock-operations', description: 'الجرد الفعلي، الأرصدة الافتتاحية والتسويات والتحويل بين الفروع.', label: 'حركات المخزون', icon: 'inventory', roles: ['ADMIN','MANAGER','WAREHOUSE'] },
  { id: 'inventory', description: 'أرصدة الأصناف حسب الفرع والتاريخ.', label: 'المخزون والفروع', icon: 'inventory', roles: ['ADMIN', 'MANAGER', 'WAREHOUSE'] },
  { id: 'finance', description: 'تابع ورديتك وراجع حركة النقد والسداد.', label: 'المالية والورديات', icon: 'wallet', roles: ['ADMIN', 'FINANCE', 'CASHIER'] },
  { id: 'expenses', description: 'تسجيل المصروفات ومراجعة حركة الدفع وسجل الفترة.', label: 'المصروفات', icon: 'wallet', roles: ['ADMIN','FINANCE'] },
  { id: 'returns', description: 'طلبات الاسترداد والموافقات المالية في مكان واحد.', label: 'المرتجعات والموافقات', icon: 'receipt', roles: ['ADMIN', 'MANAGER', 'FINANCE'] }
] as const;
const roleNames = { ADMIN: 'مدير النظام', MANAGER: 'مدير المتجر', CASHIER: 'كاشير', WAREHOUSE: 'مسؤول المخزن', FINANCE: 'المالية' };

export function StoreLogin({ onSuccess }: { onSuccess: (user: PublicUser) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { onSuccess(await signIn(String(form.get('organizationId')), String(form.get('email')), String(form.get('password')))); }
    catch { setError('تعذر تسجيل الدخول. تحقق من معرّف المؤسسة والبريد وكلمة المرور ثم أعد المحاولة.'); }
    finally { setBusy(false); }
  }
  return <div className="login-layout"><aside className="login-brand-side"><div className="brand"><span className="brand-mark"><Icon name="store" size={27}/></span><span><strong>أحمد ستور</strong><small>كل تفاصيل شغلك، أقرب.</small></span></div><div className="login-brand-message"><span className="login-eyebrow">يوم شغلك يبدأ من هنا</span><h1>تركيزك على عميلك.<br/>وتفاصيل متجرك عندنا.</h1><p>المبيعات، المخزون، والحسابات.<br/>مساحة واحدة تجمع كل اللي محتاجه.</p><div className="login-receipt"><div><Icon name="store"/><span>أحمد ستور</span></div><strong>كل حاجة في مكانها.</strong><p>من أول صنف لآخر فاتورة.</p><div className="receipt-lines"><span/><span/><span/></div></div></div></aside><main id="workspace" tabIndex={-1} className="login-form-side"><div className="login-form-wrap"><span className="login-welcome"><span className="live-dot"/>أهلًا برجوعك</span><h2>سجّل دخولك</h2><p>ابدأ يومك، وكل شغلك قدامك.</p><form onSubmit={(event) => void submit(event)} aria-label="تسجيل الدخول"><fieldset disabled={busy} className="login-fields"><label className="field"><span>معرّف المؤسسة</span><input name="organizationId" aria-label="معرّف المؤسسة" aria-describedby="organization-help" autoComplete="organization" dir="ltr" placeholder="معرّف المؤسسة المخصص لحسابك" required/><small id="organization-help" className="login-help">استخدم معرّف المؤسسة اللي استلمته من مدير المتجر.</small></label><label className="field"><span>البريد الإلكتروني</span><input name="email" type="email" autoComplete="username" dir="ltr" placeholder="name@store.com" required/></label><label className="field"><span>كلمة المرور</span><input name="password" type="password" autoComplete="current-password" required/></label></fieldset>{error && <p role="alert">{error}</p>}<button className="button primary login-submit" disabled={busy} type="submit">{busy ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}<Icon name="arrow"/></button></form><div className="login-form-footer"><Icon name="store" size={17}/>أحمد ستور · إدارة متجرك ببساطة</div></div></main></div>;
}

export function StoreApp() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restore, setRestore] = useState(0);
  const [hash, setHash] = useState(() => location.hash.slice(1));
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void currentUser().then((value) => { if (active) setUser(value); }).catch(() => { if (active) setError('تعذر التحقق من الجلسة. تحقق من الاتصال وأعد المحاولة.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [restore]);
  useEffect(() => { const changed = () => setHash(location.hash.slice(1)); window.addEventListener('hashchange', changed); return () => window.removeEventListener('hashchange', changed); }, []);
  async function logout() {
    setLoggingOut(true); setError('');
    try { await signOut(); setUser(null); }
    catch { setError('تعذر تسجيل الخروج. أعد المحاولة.'); }
    finally { setLoggingOut(false); }
  }
  if (loading) return <div className="design-preview loading-screen" dir="rtl" role="status">جارٍ التحقق من جلستك…</div>;
  if (!user) return <div className="design-preview live-app" dir="rtl" lang="ar">{error ? <main className="loading-screen"><p role="alert">{error}</p><button className="button primary" onClick={() => setRestore((value) => value + 1)}>إعادة التحقق من الجلسة</button></main> : <StoreLogin onSuccess={setUser}/>}</div>;
  const available = pages.filter((page) => (page.roles as readonly string[]).includes(user.role));
  const page = available.find((item) => item.id === hash) ?? available[0];
  const seller = ['ADMIN', 'MANAGER', 'CASHIER'].includes(user.role);
  const approver = ['ADMIN', 'FINANCE'].includes(user.role);
  return <CommandScope.Provider value={`${user.organizationId}.${user.id}`}><div className="design-preview live-app" dir="rtl" lang="ar"><a className="skip-link" href="#workspace" onClick={(event) => { event.preventDefault(); document.getElementById('workspace')!.focus(); }}>انتقل لمساحة العمل</a><aside className="sidebar"><a href="#home" className="brand"><span className="brand-mark"><Icon name="store" size={25}/></span><span><strong>أحمد ستور</strong><small>كل تفاصيل شغلك، أقرب.</small></span></a><div className="store-switch"><span className="store-avatar">أ</span><div><strong>مساحة مؤسستك</strong><small>{roleNames[user.role]}</small></div></div><p className="nav-label">مساحة العمل</p><nav aria-label="التنقل الرئيسي">{available.map((item) => <a key={item.id} href={`#${item.id}`} className={`nav-item ${page.id === item.id ? 'is-active' : ''}`} aria-current={page.id === item.id ? 'page' : undefined}><Icon name={item.icon}/><span>{item.label}</span></a>)}</nav><div className="sidebar-bottom"><div className="sidebar-foot"><span>أحمد ستور</span><span>نظام إدارة المتجر</span></div></div></aside><div className="workspace-shell"><header className="topbar"><div className="breadcrumb"><span>مساحة العمل</span><Icon name="chevron" size={13}/><strong>{page.label}</strong></div><div className="topbar-tools"><span className="profile-avatar">{user.name.slice(0, 1)}</span><span className="profile-label"><strong>{user.name}</strong><small>{roleNames[user.role]}</small></span><button className="button secondary compact" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? 'جارٍ الخروج…' : 'تسجيل الخروج'}</button></div></header><main id="workspace" tabIndex={-1} className="main-workspace"><div className="page-heading"><div><div className="heading-kicker">أحمد ستور / إدارة يومك ببساطة</div><h1>{page.label}</h1><p className="live-page-description">{page.description}</p></div></div>{error && <p role="alert" className="error-banner">{error}</p>}
    {page.id === 'home' && <><section className="surface welcome-panel"><h2>مرحبًا، {user.name}</h2><p>اختار المهمة اللي محتاج تبدأ بيها. البيانات والعمليات متصلة بمؤسستك.</p></section><div className="home-shortcuts">{available.filter((item) => item.id !== 'home').map((item) => <a className="surface home-shortcut" key={item.id} href={`#${item.id}`}><span className="section-icon"><Icon name={item.icon}/></span><strong>{item.label}</strong><Icon name="arrow" size={17}/></a>)}</div></>}
    {seller && <div hidden={page.id !== 'pos'}><LivePOS key={user.id} userId={user.id} organizationId={user.organizationId}/></div>}
    <div className="operational-content">
      {page.id === 'customers' && <PartyWorkspace kind="customers" canEdit={user.role!=='CASHIER'}/>}
      {page.id === 'suppliers' && <PartyWorkspace kind="suppliers"/>}
      {page.id === 'products' && <CatalogueWorkspace view="products"/>}
      {page.id === 'sales' && <SalesHistorySearch loadSales={loadSalesHistory} exportSales={downloadSalesHistoryXlsx}/>}
      {page.id === 'purchases' && <div className="operations-page"><LoadedPurchaseEntryEditor/><PurchaseSelector/><details className="surface"><summary>استيراد الموردين من Excel</summary><SupplierImportPanel actions={supplierImportActions}/></details></div>}
      {page.id === 'stock-operations' && <div className="operations-page"><StockCounts/><InventoryMovements/><InventoryTransfers/></div>}
      {page.id === 'inventory' && <div className="operations-page"><StockThresholds canEdit={['ADMIN','MANAGER','WAREHOUSE'].includes(user.role)}/><CatalogueWorkspace view="inventory"/></div>}
      {page.id === 'finance' && <div className="operations-page"><ShiftPanel/>{approver && <ShiftReviewPanel/>}</div>}
      {page.id === 'expenses' && <ExpensesWorkspace/>}
      {page.id === 'returns' && <div className="operations-page">{['ADMIN', 'MANAGER'].includes(user.role) && <NoInvoiceReturnSubmission/>}{approver && <NoInvoiceReturnApproval/>}</div>}
    </div><footer className="workspace-footer"><span>أحمد ستور · إدارة متجرك ببساطة</span><a href="/design-preview.html#pos" target="_blank" rel="noreferrer">معاينة التصميم</a></footer></main></div></div></CommandScope.Provider>;
}
