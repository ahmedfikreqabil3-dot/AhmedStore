import { useEffect, useRef, useState } from 'react';
import type { CreateSaleInput, PaymentMethod } from '@ahmed-store/contracts';
import { ApiError, decimal, displayMoney, loadAttempt, postSale, saleOptions, saleRejectionMessage, units, type SaleAttempt, type SaleOptions, type SaleProduct } from './store-api.js';
import { Icon } from './ui/Icon.js';

type Line = { product: SaleProduct; quantity: number };
const methods: Array<[PaymentMethod, string]> = [['CASH', 'نقدي'], ['CARD', 'بطاقة'], ['INSTAPAY', 'InstaPay'], ['WALLET', 'محفظة'], ['CREDIT', 'آجل']];

export function LivePOS({ userId, organizationId }: { userId: string; organizationId: string }) {
  const storageKey = `ahmed-store.pending-sale.${organizationId}.${userId}`;
  const [attempt, setAttempt] = useState(() => loadAttempt(storageKey));
  const [options, setOptions] = useState<SaleOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [cart, setCart] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [payments, setPayments] = useState<Array<{ method: PaymentMethod; amount: string }>>([{ method: 'CASH', amount: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    setOptions(null); setLoadError('');
    void saleOptions().then((value) => { if (active) setOptions(value); }).catch((reason: unknown) => {
      if (active) setLoadError(reason instanceof ApiError && reason.status === 403
        ? 'صلاحيات حسابك لا تسمح بقراءة بيانات نقطة البيع حاليًا. راجع مدير النظام.' : 'تعذر تحميل المنتجات والعملاء والفروع. تحقق من الاتصال وأعد المحاولة.');
    });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (cart.length || attempt) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [cart, attempt]);

  const subtotal = cart.reduce((sum, line) => sum + units(line.product.salePrice)! * BigInt(line.quantity), 0n);
  const discountUnits = units(discount);
  const discountValid = discountUnits !== null && discountUnits < subtotal;
  const total = discountValid ? subtotal - discountUnits : 0n;
  const allocations = payments.map((payment) => ({ ...payment, amount: payment.amount === '' && payments.length === 1 ? decimal(total) : payment.amount }));
  const paymentValues = allocations.map((payment) => units(payment.amount));
  const paid = paymentValues.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const valid = !!options && !!customerId && !!warehouseId && cart.length > 0 && discountValid && paymentValues.every((value) => value !== null && value > 0n) && paid === total;
  const visibleLines = attempt ? attempt.input.lines.map((line) => ({ name: options?.products.find((product) => product.id === line.productId)?.name ?? line.productId, id: line.productId, price: units(line.unitPrice)!, quantity: Number(line.quantity) })) : cart.map((line) => ({ name: line.product.name, id: line.product.id, price: units(line.product.salePrice)!, quantity: line.quantity }));
  const recoveredSubtotal = attempt?.input.lines.reduce((sum, line) => sum + (units(line.unitPrice)! * units(line.quantity)! + 5000n) / 10000n, 0n);
  const shownPayments = attempt ? attempt.input.payments : payments;
  const amountDue = attempt ? attempt.input.payments.reduce((sum, payment) => sum + units(payment.amount)!, 0n) : total;
  const matches = options?.products.filter((product) => `${product.name} ${product.sku} ${product.barcode ?? ''}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  function add(product: SaleProduct) {
    setCart((old) => old.some((line) => line.product.id === product.id)
      ? old.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(9999, line.quantity + 1) } : line)
      : [...old, { product, quantity: 1 }]);
    setQuery(''); setError(''); setSuccess('');
  }
  function scan() {
    const product = options!.products.find((item) => item.barcode === query || item.sku.toLowerCase() === query.toLowerCase());
    if (product) add(product); else setError('الباركود غير موجود. اختر المنتج من نتائج البحث أو جرّب كودًا آخر.');
  }
  function payload(): CreateSaleInput {
    let remaining = discountUnits!;
    return {
      customerId, warehouseId, occurredAt: new Date(), payments: allocations,
      lines: cart.map((line) => {
        const lineSubtotal = units(line.product.salePrice)! * BigInt(line.quantity);
        const lineDiscount = remaining > lineSubtotal ? lineSubtotal : remaining;
        remaining -= lineDiscount;
        return { productId: line.product.id, quantity: String(line.quantity), unitPrice: line.product.salePrice, discount: decimal(lineDiscount) };
      })
    };
  }
  async function confirm() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const next: SaleAttempt = attempt ?? { key: crypto.randomUUID(), input: payload() };
      // Persist before sending. A refresh or uncertain connection failure must reuse this exact command.
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setAttempt(next);
      const result = await postSale(next.input, next.key);
      sessionStorage.removeItem(storageKey);
      setAttempt(null); setCart([]); setDiscount('0'); setPayments([{ method: 'CASH', amount: '' }]);
      setSuccess(`تم تسجيل الفاتورة ${result.id} بنجاح. الإجمالي ${displayMoney(units(result.total)!)} ج.م.`);
      dialog.current!.close();
    } catch (reason) {
      if (!attempt && reason instanceof ApiError && reason.status === 409) {
        sessionStorage.removeItem(storageKey); setAttempt(null);
        setError(saleRejectionMessage(reason));
      } else setError('تعذر تأكيد نتيجة الحفظ. أعد محاولة نفس الفاتورة؛ لا تبدأ فاتورة أخرى قبل التحقق من نتيجتها.');
    } finally { submitting.current = false; setBusy(false); }
  }
  if (!options) return <section className="surface loading-panel" aria-live="polite">{loadError ? <><p role="alert">{loadError}</p><button className="button secondary" onClick={() => setReload((value) => value + 1)}>إعادة تحميل بيانات البيع</button></> : <p>جارٍ تحميل بيانات نقطة البيع…</p>}</section>;
  const selectedBranchId = attempt?.input.warehouseId ?? warehouseId;
  const selectedBranchName = options.warehouses.find((branch) => branch.id === selectedBranchId)?.name ?? (selectedBranchId ? 'فرع الفاتورة المحفوظة غير متاح في القائمة الحالية' : 'لم يتم اختيار فرع');
  return <>
    {attempt && <div className="info-callout recovery-banner" role="status">توجد محاولة تسجيل فاتورة لم تُحسم نتيجتها. البيانات مقفلة لحين إعادة المحاولة بنفس مفتاح العملية. <button className="text-button" onClick={() => dialog.current!.showModal()}>التحقق وإعادة المحاولة</button></div>}
    {success && <p role="status" className="success-banner">{success}</p>}
    <div className="pos-layout">
      <section className="invoice-workspace" aria-labelledby="live-invoice-title">
        <div className="panel-heading"><div className="panel-heading-title"><span className="section-icon"><Icon name="receipt"/></span><div><h2 id="live-invoice-title">فاتورة بيع جديدة</h2><p>الأسعار من الكتالوج والحفظ من خلال النظام</p></div></div><span className="draft-label">{attempt ? 'بانتظار التأكيد' : 'مسودة'}</span></div>
        <div className="invoice-body"><div className="search-area"><div className="product-search"><Icon name="search"/><input aria-label="ابحث عن منتج أو امسح الباركود" value={query} disabled={!!attempt || busy} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); scan(); } }} autoComplete="off" placeholder="ابحث باسم المنتج أو امسح الباركود…"/><Icon name="barcode"/></div>
          {query && <div className="search-results">{matches.length ? matches.slice(0, 10).map((product) => <button type="button" key={product.id} onClick={() => add(product)}><span><strong>{product.name}</strong><small><bdi>{product.sku}</bdi></small></span><b>{displayMoney(units(product.salePrice)!)}</b><Icon name="plus" size={17}/></button>) : <p>لا توجد منتجات مطابقة. جرّب كلمة أخرى.</p>}</div>}
        </div><div className="invoice-table-area live-lines"><div className="table-wrap" tabIndex={0} role="region" aria-label="أصناف الفاتورة"><table className="data-table cart-table"><thead><tr><th>المنتج</th><th>سعر الوحدة</th><th>الكمية</th><th>الإجمالي</th><th>الإجراء</th></tr></thead><tbody>{visibleLines.map((line, index) => <tr key={line.id}><td><strong>{line.name}</strong></td><td className="numeric">{displayMoney(line.price)}</td><td><input type="number" min="1" max="9999" step="1" aria-label={`كمية ${line.name}`} value={line.quantity} disabled={!!attempt || busy} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 9999) setCart((old) => old.map((item, i) => i === index ? { ...item, quantity: value } : item)); }}/></td><td className="numeric">{displayMoney((line.price * units(String(line.quantity))! + 5000n) / 10000n)}</td><td><button className="icon-button remove-item" disabled={!!attempt || busy} aria-label={`حذف ${line.name}`} onClick={() => setCart((old) => old.filter((_, i) => i !== index))}><Icon name="trash" size={17}/></button></td></tr>)}</tbody></table></div>{!visibleLines.length && <div className="empty-cart"><Icon name="purchase" size={36}/><h3>ابدأ بأول صنف</h3><p>ابحث عن منتج أو امسح الباركود لإضافته.</p></div>}</div><div className="invoice-bottom"><div className="quiet-hint"><Icon name="barcode" size={17}/>كل القيم بالجنيه المصري. يتم التحقق من المخزون عند تسجيل الفاتورة.</div></div></div>
      </section>
      <aside className="checkout-panel" aria-labelledby="live-checkout-title"><div className="checkout-heading"><h2 id="live-checkout-title">ملخص الفاتورة</h2><Icon name="receipt"/></div><div className="branch-context checkout-branch-context"><Icon name="inventory" size={18}/><span className="branch-context-label">فرع البيع</span><strong>{selectedBranchName}</strong></div><fieldset className="checkout-content live-checkout" disabled={!!attempt || busy}>
        <label className="field"><span>الفرع</span><select aria-label="فرع البيع" value={attempt?.input.warehouseId ?? warehouseId} onChange={(event) => setWarehouseId(event.target.value)}><option value="">اختر الفرع</option>{options.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
        <label className="field"><span>العميل</span><select aria-label="عميل البيع" value={attempt?.input.customerId ?? customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">اختر العميل</option>{options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <div className="summary-line"><span>المجموع الفرعي</span><bdi>{displayMoney(recoveredSubtotal ?? subtotal)} ج.م</bdi></div><label className="field"><span>خصم الفاتورة</span><input aria-label="خصم الفاتورة" inputMode="decimal" value={attempt ? decimal(attempt.input.lines.reduce((sum, line) => sum + units(line.discount)!, 0n)) : discount} onChange={(event) => setDiscount(event.target.value)} /></label>
        {cart.length > 0 && !discountValid && <p role="alert">أدخل خصمًا صحيحًا أقل من إجمالي الفاتورة، بحد أقصى 4 خانات عشرية.</p>}
        <div className="grand-total"><span>المبلغ المطلوب<strong><bdi>{displayMoney(amountDue)}</bdi><small>ج.م</small></strong></span><Icon name="wallet" size={27}/></div>
        <div className="payment-label">طرق السداد</div>{shownPayments.map((payment, index) => <div className="live-payment-row" key={index}><select aria-label={`طريقة الدفعة ${index + 1}`} value={payment.method} onChange={(event) => setPayments((old) => old.map((item, i) => i === index ? { ...item, method: event.target.value as PaymentMethod } : item))}>{methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label={`مبلغ الدفعة ${index + 1}`} inputMode="decimal" value={payment.amount} placeholder={payments.length === 1 ? decimal(total) : '0.0000'} onChange={(event) => setPayments((old) => old.map((item, i) => i === index ? { ...item, amount: event.target.value } : item))}/>{payments.length > 1 && <button type="button" className="icon-button" aria-label={`حذف الدفعة ${index + 1}`} onClick={() => setPayments((old) => old.filter((_, i) => i !== index))}><Icon name="close" size={15}/></button>}</div>)}
        <button className="text-button" onClick={() => setPayments((old) => [...allocations, { method: 'CARD', amount: '' }])}><Icon name="plus" size={15}/>تقسيم السداد / إضافة دفعة</button>
        {payments.length === 1 && <p className="muted">ترك المبلغ فارغًا يعني سداد كامل الإجمالي بالطريقة المختارة.</p>}
        {cart.length > 0 && paid !== total && <p role="alert">مجموع الدفعات يجب أن يساوي الإجمالي تمامًا.</p>}
      </fieldset>{error && <p role="alert" className="error-banner checkout-error">{error}</p>}<div className="live-pay-action"><button className="button primary checkout-button" disabled={(!valid && !attempt) || busy} onClick={() => { setError(''); dialog.current!.showModal(); }}><span>{attempt ? 'إعادة محاولة نفس الفاتورة' : 'مراجعة وإتمام البيع'}</span><Icon name="arrow"/></button></div></aside>
    </div>

    <dialog ref={dialog} className="preview-dialog" aria-labelledby="live-payment-title" onCancel={(event) => { if (busy) event.preventDefault(); }}><div className="modal-heading"><h2 id="live-payment-title">تأكيد تسجيل الفاتورة</h2><button className="icon-button" disabled={busy} aria-label="إغلاق الدفع" onClick={() => dialog.current!.close()}><Icon name="close"/></button></div><div className="payment-preview-amount"><span>المبلغ المطلوب</span><strong><bdi>{displayMoney(amountDue)}</bdi><small> ج.م</small></strong></div><div className="branch-context"><span className="branch-context-label">سيتم البيع من</span><strong>{selectedBranchName}</strong></div><p className="modal-description">التأكيد يسجّل فاتورة فعلية ويحدّث المخزون والأرصدة.</p>{error && <p role="alert">{error}</p>}<div className="modal-actions"><button className="button primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'جارٍ تأكيد الحفظ…' : 'تأكيد البيع والدفع'}</button><button className="button secondary" disabled={busy} onClick={() => dialog.current!.close()}>رجوع للفاتورة</button></div></dialog>
  </>;
}

