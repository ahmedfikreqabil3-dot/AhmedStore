import { usePreviewDialog } from './usePreviewDialog.js';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../src/ui/Icon.js';

export type LifecycleAction = 'archive' | 'restore' | 'access' | 'reset';
export type ManagedScreen = 'customers' | 'suppliers' | 'branches' | 'categories' | 'users' | 'treasuries';
export const lifecycleLabels: Record<LifecycleAction, string> = {
  archive: 'أرشفة / إيقاف', restore: 'إعادة تفعيل', access: 'مراجعة الدور والفروع', reset: 'طلب إعادة تعيين كلمة المرور'
};

// Local interaction prototype: no permissions, credentials or financial records are changed.
export function LifecycleJourney({ screen, entity, action, blocked, close, complete }: {
  screen: ManagedScreen; entity: string; action: LifecycleAction; blocked: boolean;
  close: () => void; complete: (status?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [review, setReview] = useState(false);
  const [reason, setReason] = useState('');
  const [role, setRole] = useState('كاشير');
  const [branches, setBranches] = useState(['الفرع الرئيسي']);
  const [replacement, setReplacement] = useState('');
  const [error, setError] = useState('');
  usePreviewDialog(dialog);
  useEffect(() => { if (review) heading.current?.focus(); }, [review]);
  const roleCapabilities:Record<string,string[]>={'كاشير':['البيع','الوردية الخاصة'],'مسؤول المخزن':['المخزون','المشتريات'],'المالية':['التقارير','المراجعة المالية','الوردية الخاصة'],'مدير المتجر':['البيع','المخزون','المشتريات','التقارير']};
  const needsReplacement = action === 'archive' && screen === 'categories';
  const prohibited = action === 'archive' && blocked && !needsReplacement;
  const cause = screen === 'users' ? 'هذا هو حساب المستخدم الحالي؛ لا يمكن إيقافه من نفس الجلسة.' : screen === 'branches' ? 'الفرع مرتبط برصيد مخزون أو وردية مفتوحة.' : screen === 'treasuries' ? 'الحساب له رصيد غير صفري.' : 'يوجد رصيد أو التزامات مفتوحة على هذا الحساب.';
  function next() {
    if (prohibited) return;
    if (!reason.trim()) { setError('اكتب سبب الإجراء حتى يظهر في سجل المراجعة.'); return; }
    if (needsReplacement && !replacement) { setError('اختار الفئة البديلة للمنتجات المرتبطة.'); return; }
    if (action === 'access' && branches.length === 0) { setError('اختار فرعًا واحدًا على الأقل.'); return; }
    setError(''); setReview(true);
  }
  return <dialog ref={dialog} className="planned-dialog" aria-labelledby="lifecycle-title" onCancel={event=>{event.preventDefault();close();}}>
    <header><h2 id="lifecycle-title" ref={heading} tabIndex={-1}>{lifecycleLabels[action]}</h2><button className="icon-button" aria-label="إغلاق رحلة الإدارة" onClick={close}><Icon name="close"/></button></header>
    <div className="planned-detail-identity"><span className="section-icon"><Icon name="user"/></span><div><span>معاينة رحلة إدارة السجل</span><h3>{entity}</h3></div></div>
    <div className="planned-review-note">تصميم تجريبي. لن تُرسل دعوة أو رسالة، ولن تتغير صلاحيات أو بيانات فعلية.</div>
    {prohibited ? <div className="lifecycle-blocked" role="alert"><h3>لا يمكن الأرشفة قبل تسوية الارتباطات</h3><p>{cause} راجع كشف الحساب أو المخزون أولًا، ثم أعد المحاولة. المستندات السابقة تظل محفوظة.</p><a className="button secondary" href={`#${screen==='branches' ? 'inventory' : screen==='treasuries' ? 'settlements' : 'settlements'}`} onClick={close}>مراجعة الحركات والالتزامات</a></div> : review ? <>
      <h3>مراجعة الإجراء</h3><dl className="planned-facts"><div><dt>الإجراء</dt><dd>{lifecycleLabels[action]}</dd></div><div><dt>السجل</dt><dd>{entity}</dd></div><div><dt>السبب</dt><dd>{reason}</dd></div>{action==='access' && <><div><dt>الدور المقترح</dt><dd>{role}</dd></div><div><dt>الفروع المحددة</dt><dd>{branches.join('، ')}</dd></div></>}{needsReplacement && <div><dt>إعادة ربط المنتجات بالفئة</dt><dd>{replacement}</dd></div>}</dl>
      <p>{action==='reset' ? 'في التنفيذ الفعلي، تُنشأ آلية استعادة آمنة بعد اعتماد سياسة الحسابات. هذه المعاينة لا تنشئ كلمة مرور ولا ترسل رابطًا.' : 'المراجعة النهائية للشروط والصلاحيات تتم على الخادم عند تنفيذ الميزة. الأرشفة لا تحذف التاريخ أو المستندات.'}</p>
      <footer><button className="button primary" onClick={()=>complete(action==='archive' ? 'مؤرشف' : action==='restore' ? 'نشط' : undefined)}>تأكيد المعاينة</button><button className="button secondary" onClick={()=>setReview(false)}>رجوع للتعديل</button></footer>
    </> : <form onSubmit={event=>{event.preventDefault();next();}}>
      <div className="lifecycle-editor">
        {action==='access' && <><label className="field"><span>الدور المقترح</span><select aria-label="الدور المقترح" value={role} onChange={event=>setRole(event.target.value)}>{['كاشير','مسؤول المخزن','المالية','مدير المتجر'].map(value=><option key={value}>{value}</option>)}</select></label><fieldset><legend>نطاق الفروع</legend>{['الفرع الرئيسي','فرع مدينة نصر'].map(branch=><label className="lifecycle-check" key={branch}><input type="checkbox" checked={branches.includes(branch)} onChange={event=>setBranches(values=>event.target.checked ? [...values,branch] : values.filter(value=>value!==branch))}/>{branch}</label>)}</fieldset><section aria-label="ملخص صلاحيات الدور"><h3>ملخص الدور المقترح</h3><ul>{roleCapabilities[role]!.map(capability=><li key={capability}>{capability}</li>)}</ul></section><p>الدور يحدد نوع العمل، والفروع تحدد نطاقه. عرض مصفوفة الصلاحيات النهائية مرتبط باعتماد سياسة الأدوار؛ لا توجد صلاحيات جديدة مفعلة هنا.</p></>}
        {needsReplacement && <label className="field"><span>الفئة البديلة للمنتجات المرتبطة</span><select aria-label="الفئة البديلة" value={replacement} onChange={event=>setReplacement(event.target.value)} required><option value="">اختار الفئة البديلة</option>{['قمصان','بناطيل','بدون فئة'].filter(value=>value!==entity).map(value=><option key={value}>{value}</option>)}</select></label>}
        {action==='archive' && <p>{screen==='users' ? 'إيقاف المستخدم يمنع الدخول مستقبلًا. تظل العمليات السابقة مرتبطة بصاحبها، ويجب حسم الوردية المفتوحة قبل الإيقاف.' : 'السجل المؤرشف يختفي من الاختيارات الجديدة، ويظل ظاهرًا في التاريخ. يمكن مراجعته من فلتر المؤرشف وإعادة تفعيله.'}</p>}
        {action==='restore' && <p>راجع البيانات والارتباطات قبل إعادة إتاحة السجل للاستخدام في مستندات جديدة.</p>}
        {action==='reset' && <p>اطلب استعادة الحساب بدون عرض أو إدخال كلمة مرور في هذه الرحلة.</p>}
        <label className="field"><span>سبب الإجراء</span><textarea aria-label="سبب الإجراء" value={reason} onChange={event=>setReason(event.target.value)} rows={3} aria-describedby={error ? 'lifecycle-error' : undefined} aria-invalid={!!error} required/></label>
        {error && <p id="lifecycle-error" className="lifecycle-error" role="alert">{error}</p>}
      </div><footer><button className="button primary" type="submit">متابعة للمراجعة</button><button className="button secondary" type="button" onClick={close}>إلغاء</button></footer>
    </form>}
    {prohibited && <footer><button className="button secondary" onClick={close}>رجوع للسجل</button></footer>}
  </dialog>;
}
