/* ============================================================
   أحمد ستور - نظام الإدارة المتكامل
   app.js  v3.0  (Multi-user + Multi-warehouse)
   ============================================================ */

// ==================== DATA STORE ====================
let store = {
  products: [],
  sales: [],
  customers: [],
  expenses: [],
  suppliers: [],
  purchaseOrders: [],
  purchaseInvoices: [],
  returns: [],
  quotations: [],
  users: [],
  warehouses: [],
  stockTransfers: [],
  stockAdjustments: [],
  heldInvoices: [],
  recurringInvoices: [],
  nextRecurringId: 1,
  settings: {
    storeName: 'أحمد ستور',
    storeAddress: 'القاهرة، مصر',
    storePhone: '01000000000',
    storeEmail: '',
    invoiceHeader: 'أحمد ستور - ملابس رجالية',
    invoiceFooter: 'شكراً لزيارتكم - نتمنى لكم يوماً سعيداً',
    currency: 'ج',
    vatNumber: '',
    legalName: ''
  },
  nextInvoiceNo: 1001,
  nextProductId: 1,
  nextCustomerId: 1,
  nextExpenseId: 1,
  nextSupplierId: 1,
  nextPOId: 1,
  nextReturnId: 1,
  nextQuotationId: 1001,
  nextDebtLogId: 1,
  nextUserId: 1,
  nextWarehouseId: 1,
  nextTransferId: 1,
  nextHeldId: 1,
  nextPurchaseInvId: 1001,
  nextAdjustId: 1,
  nextTreasuryId: 1,
  treasuries: [],
  treasuryTransactions: [],
  debtHistory: []
};

// Current logged-in user (runtime state)
let currentUser = null;
// Currently selected warehouse for POS sales
let selectedWarehouseId = 1;

// ==================== APP STATE ====================
let cart = [];
let paymentMethod = 'cash'; // kept for backward compat in display
let currentPOSCategory = 'all';
let editingProductId = null;
let editingCustomerId = null;
let restockProductId = null;
let currentInvoice = null;
let salesFilter = null;
let inventoryFilter = 'all';
let reportPeriod = 'week';
let reportWarehouseFilter = 'all'; // 'all' or warehouseId (number)
let notifications = [];
let lastSaleId = null;
let lastSaleTotal = 0;
let lastSaleChange = 0;
let editingPurchaseInvId = null;
let editingAdjustId = null;

// Chart instances
let salesChartInst = null;
let catChartInst = null;
let monthlyChartInst = null;

// Emoji map
const CAT_EMOJI = {
  'قمصان':'👔','بناطيل':'👖','جاكيتات':'🧥','تيشيرتات':'👕',
  'ملابس داخلية':'🩲','إكسسوارات':'🕶️','أحذية':'👟','default':'🛍️'
};
const CHART_COLORS = ['#7c6ef5','#ff4f64','#00c896','#f5a623','#54a0ff','#ff9ff3','#00d2d3','#ff6348'];

// ==================== THEME ====================
function initTheme() {
  const saved = localStorage.getItem('ahmedStore_theme') || 'dark';
  applyTheme(saved, false);
}

function applyTheme(theme, save = true) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  const btn = document.getElementById('appearanceBtn');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
  document.querySelectorAll('.appearance-option').forEach(b => b.classList.remove('active-theme'));
  const activeOpt = document.getElementById(`theme-${theme}`);
  if (activeOpt) activeOpt.classList.add('active-theme');
  if (save) localStorage.setItem('ahmedStore_theme', theme);
}

function setTheme(theme) { applyTheme(theme); }

function toggleTheme() {
  const current = localStorage.getItem('ahmedStore_theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// ==================== AUTH / LOGIN ====================
function initLogin() {
  initTheme();
  // Check stored session
  const savedUser = sessionStorage.getItem('ahmedStore_currentUser') || localStorage.getItem('ahmedStore_currentUser');
  const loggedIn  = localStorage.getItem('ahmedStore_loggedIn') === 'true'
                 || sessionStorage.getItem('ahmedStore_loggedIn') === 'true';
  if (loggedIn) {
    const lp = document.getElementById('loginPage');
    if (lp) lp.style.display = 'none';
    if (savedUser) { try { currentUser = JSON.parse(savedUser); } catch(e) { currentUser = null; } }
    startApp();
    return;
  }
  // Setup Enter key
  ['loginUsername', 'loginPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') attemptLogin();
    });
  });
}

function attemptLogin() {
  const username = (document.getElementById('loginUsername')?.value || '').trim().toLowerCase();
  const password = document.getElementById('loginPassword')?.value || '';
  const hint = document.getElementById('loginHint');
  const btn  = document.getElementById('loginBtn');

  if (!username || !password) {
    if (hint) { hint.style.color = 'var(--danger)'; hint.textContent = '⚠️ يرجى إدخال اسم المستخدم وكلمة المرور'; }
    shakeCard();
    return;
  }

  if (btn) { btn.classList.add('loading'); btn.innerHTML = '<span>⏳</span> جاري التحقق...'; }

  setTimeout(() => {
    // Load data first to get users
    loadData();
    seedSampleData();

    // Find user in store
    let user = store.users.find(u => u.username.toLowerCase() === username && u.password === password && u.active !== false);
    // Fallback: legacy admin/admin1 maps to the seeded admin user
    if (!user && username === 'admin' && password === 'admin1') {
      user = store.users.find(u => u.role === 'admin');
    }

    if (user) {
      if (hint) { hint.style.color = 'var(--success)'; hint.textContent = `✅ مرحباً ${user.name}! جاري التحميل...`; }
      currentUser = user;
      const remember = document.getElementById('loginRemember')?.checked;
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('ahmedStore_loggedIn', 'true');
      storage.setItem('ahmedStore_currentUser', JSON.stringify(user));
      setTimeout(() => {
        const lp = document.getElementById('loginPage');
        if (lp) {
          lp.style.transition = 'opacity 0.5s ease';
          lp.style.opacity = '0';
          setTimeout(() => { lp.style.display = 'none'; startApp(); }, 500);
        }
      }, 700);
    } else {
      if (btn) { btn.classList.remove('loading'); btn.innerHTML = '<span>🔐</span> دخول'; }
      if (hint) { hint.style.color = 'var(--danger)'; hint.textContent = '❌ اسم المستخدم أو كلمة المرور غير صحيحة'; }
      shakeCard();
    }
  }, 800);
}

function shakeCard() {
  const card = document.getElementById('loginCard');
  if (!card) return;
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

function toggleLoginPassword() {
  const input = document.getElementById('loginPassword');
  const btn   = document.getElementById('loginEyeBtn');
  if (!input) return;
  if (input.type === 'password') { input.type = 'text';     if (btn) btn.textContent = '🙈'; }
  else                           { input.type = 'password'; if (btn) btn.textContent = '👁️'; }
}

function logout() {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  localStorage.removeItem('ahmedStore_loggedIn');
  sessionStorage.removeItem('ahmedStore_loggedIn');
  localStorage.removeItem('ahmedStore_currentUser');
  sessionStorage.removeItem('ahmedStore_currentUser');
  currentUser = null;
  location.reload();
}

// ==================== PERMISSIONS ====================
const ROLE_PERMISSIONS = {
  admin:   ['dashboard','pos','products','inventory','sales','customers','quotations','expenses','suppliers','purchases','returns','reports','settings','users','warehouses','recurring','purchaseinvoices','stockadjust','treasuries'],
  cashier: ['pos','sales','customers','quotations','returns'],
  manager: ['products','inventory','suppliers','purchases','warehouses','purchaseinvoices','stockadjust']
};
const ALL_PAGES = ['dashboard','pos','products','inventory','sales','customers','quotations','expenses','suppliers','purchases','returns','reports','settings','users','warehouses','recurring','purchaseinvoices','stockadjust','treasuries'];
const PAGE_LABELS = {
  dashboard:'📊 لوحة التحكم', pos:'🛒 نقطة البيع', products:'👕 المنتجات',
  inventory:'📦 المخزون', sales:'💰 سجل المبيعات', customers:'👥 العملاء',
  quotations:'📄 عروض الأسعار', expenses:'💸 المصروفات', suppliers:'🏭 الموردون',
  purchases:'📋 طلبات الشراء', returns:'🔄 المرتجعات', reports:'📈 التقارير',
  settings:'⚙️ الإعدادات', users:'👤 المستخدمين', warehouses:'🏪 الفروع',
  recurring:'🔄 فواتير متكررة', purchaseinvoices:'🧾 فواتير المشتريات',
  stockadjust:'⚖️ التسويات', treasuries:'💰 الخزينة'
};

function getDefaultPermissions(role) {
  const pages = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['cashier'];
  return {
    pages: [...pages],
    canEditPrice: role === 'admin',
    canApplyDiscount: role === 'admin',
    canDeleteSales: role === 'admin',
    canManageUsers: role === 'admin'
  };
}

function getUserPermissions() {
  if (!currentUser) return getDefaultPermissions('admin');
  return currentUser.permissions || getDefaultPermissions(currentUser.role || 'admin');
}

function checkUserPermission(perm) {
  const perms = getUserPermissions();
  return perms[perm] === true;
}

function applyPermissions(role) {
  const perms = getUserPermissions();
  const allowed = perms.pages || ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS['admin'];
  // Show/hide nav items
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.getAttribute('data-page');
    el.style.display = allowed.includes(page) ? '' : 'none';
  });
  // Nav section labels: hide if all items in section are hidden
  document.querySelectorAll('.nav-section-label').forEach(label => {
    let next = label.nextElementSibling;
    let anyVisible = false;
    while (next && !next.classList.contains('nav-section-label')) {
      if (next.style.display !== 'none') anyVisible = true;
      next = next.nextElementSibling;
    }
    label.style.display = anyVisible ? '' : 'none';
  });
  // Navigate to first allowed page
  const firstPage = allowed[0] || 'pos';
  const firstEl = document.querySelector(`.nav-item[data-page="${firstPage}"]`);
  showPage(firstPage, firstEl);
}

function updateSidebarUser() {
  if (!currentUser) return;
  const roleLabels = { admin: 'مدير المحل 👑', cashier: 'كاشير 🛒', manager: 'أمين مخزن 📦' };
  const avatarEl = document.querySelector('.user-avatar');
  const nameEl   = document.querySelector('.user-name');
  const roleEl   = document.querySelector('.user-role');
  if (avatarEl) avatarEl.textContent = currentUser.name.charAt(0);
  if (nameEl)   nameEl.textContent   = currentUser.name;
  if (roleEl)   roleEl.textContent   = roleLabels[currentUser.role] || currentUser.role;
}

function startApp() {
  loadData();
  seedSampleData();
  showSplash();
  setTimeout(() => {
    hideSplash();
    initApp();
    applyTheme(localStorage.getItem('ahmedStore_theme') || 'dark', false);
    updateSidebarUser();
    // Apply role-based permissions after app loads
    const role = currentUser?.role || 'admin';
    applyPermissions(role);
  }, 1800);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  initLogin();
});

function showSplash() {
  document.getElementById('splash').style.display = 'flex';
}

function hideSplash() {
  const splash = document.getElementById('splash');
  splash.style.opacity = '0';
  splash.style.transition = 'opacity 0.5s ease';
  setTimeout(() => {
    splash.style.display = 'none';
    document.getElementById('appLayout').style.display = 'grid';
    document.getElementById('appLayout').style.animation = 'pageIn 0.4s ease';
  }, 500);
}

function initApp() {
  // Migrate old store data to include new arrays
  if (!store.heldInvoices)       store.heldInvoices = [];
  if (!store.purchaseInvoices)   store.purchaseInvoices = [];
  if (!store.stockAdjustments)   store.stockAdjustments = [];
  if (!store.nextHeldId)         store.nextHeldId = 1;
  if (!store.nextPurchaseInvId)  store.nextPurchaseInvId = 1001;
  if (!store.nextAdjustId)       store.nextAdjustId = 1;

  updateDateDisplay();
  setInterval(updateDateDisplay, 60000);
  buildNotifications();
  renderDashboard();
  renderPOS();
  renderProducts();
  renderInventory();
  renderSales();
  renderCustomers();
  renderExpenses();
  renderSuppliers();
  renderPurchases();
  renderReturns();
  loadSettings();
  updateSidebarTicker();
  updateNavAlerts();
  setupKeyboard();
  loadChartJS();
  updateHeldBadge();
  // Initialize and check recurring invoices
  initRecurringInvoices();
  setTimeout(() => { checkDueRecurringInvoices(); updateRecurringDueBadge(); }, 2500);

  // Close notifications on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#notifBtn') && !e.target.closest('#notifPanel')) {
      document.getElementById('notifPanel').classList.remove('show');
    }
    if (!e.target.closest('#shortcutsPanel') && !e.target.closest('.shortcuts-btn')) {
      document.getElementById('shortcutsPanel').classList.remove('show');
    }
  });

  // POS search clear button
  document.getElementById('posSearch')?.addEventListener('input', function() {
    document.getElementById('posClearBtn').style.display = this.value ? 'block' : 'none';
  });
}

// ==================== KEYBOARD SHORTCUTS ====================
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = e.target.tagName.toLowerCase();
    const inInput = ['input','textarea','select'].includes(tag);

    if (e.key === 'Escape') {
      closeAllModals();
      closeSaleSuccess();
    }
    if (e.key === 'F1') { e.preventDefault(); showPage('dashboard', document.querySelector('[data-page=dashboard]')); }
    if (e.key === 'F2') { e.preventDefault(); showPage('pos', document.querySelector('[data-page=pos]')); }
    if (e.key === 'F3') { e.preventDefault(); showPage('products', document.querySelector('[data-page=products]')); }
    if (e.key === 'F4') { e.preventDefault(); showPage('inventory', document.querySelector('[data-page=inventory]')); }
    if (e.key === 'F5') { e.preventDefault(); showPage('sales', document.querySelector('[data-page=sales]')); }
    if (e.key === 'F6') { e.preventDefault(); showPage('expenses', document.querySelector('[data-page=expenses]')); }
    if (e.key === 'F7') { e.preventDefault(); showPage('suppliers', document.querySelector('[data-page=suppliers]')); }
    if (e.key === 'F8') { e.preventDefault(); showPage('purchases', document.querySelector('[data-page=purchases]')); }
    if (e.key === 'F9') { e.preventDefault(); showPage('returns', document.querySelector('[data-page=returns]')); }
    if (e.key === 'F10') { e.preventDefault(); showPage('quotations', document.querySelector('[data-page=quotations]')); }
    if (e.key === 'F11') { e.preventDefault(); showPage('treasuries', document.querySelector('[data-page=treasuries]')); }
    if (e.key === '?' && !inInput) toggleShortcuts();
    if (e.key === 'Delete' && !inInput) clearCart();
    if (e.key === 'Enter' && e.ctrlKey) openPaymentModal();
    if (e.key === 'f' && e.ctrlKey) {
      e.preventDefault();
      const posSearch = document.getElementById('posSearch');
      if (posSearch) { posSearch.focus(); posSearch.select(); }
    }
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

function toggleShortcuts() {
  document.getElementById('shortcutsPanel').classList.toggle('show');
}

// ==================== STORAGE ====================
function saveData() {
  try { localStorage.setItem('ahmedStore_v2', JSON.stringify(store)); } catch(e) {}
}

function loadData() {
  try {
    const d = localStorage.getItem('ahmedStore_v2');
    if (d) store = { ...store, ...JSON.parse(d) };
  } catch(e) {}
}

// ==================== SEED DATA ====================
function seedSampleData() {
  if (!store.expenses) store.expenses = [];
  if (!store.suppliers) store.suppliers = [];
  if (!store.purchaseOrders) store.purchaseOrders = [];
  if (!store.returns) store.returns = [];
  if (!store.quotations) store.quotations = [];
  if (!store.users) store.users = [];
  if (!store.warehouses) store.warehouses = [];
  if (!store.stockTransfers) store.stockTransfers = [];
  if (!store.treasuries) store.treasuries = [];
  if (!store.treasuryTransactions) store.treasuryTransactions = [];
  if (!store.nextTreasuryId) store.nextTreasuryId = 1;
  // Migrate existing users to have permissions
  if (store.users) {
    store.users.forEach(u => {
      if (!u.permissions) u.permissions = getDefaultPermissions(u.role || 'cashier');
    });
  }
  if (!store.nextExpenseId) store.nextExpenseId = 1;
  if (!store.nextSupplierId) store.nextSupplierId = 1;
  if (!store.nextPOId) store.nextPOId = 1;
  if (!store.nextReturnId) store.nextReturnId = 1;
  if (!store.nextQuotationId) store.nextQuotationId = 1001;
  if (!store.debtHistory) store.debtHistory = [];
  if (!store.nextDebtLogId) store.nextDebtLogId = 1;
  if (!store.nextUserId) store.nextUserId = 1;
  if (!store.nextWarehouseId) store.nextWarehouseId = 1;
  if (!store.nextTransferId) store.nextTransferId = 1;

  // Seed default users
  if (store.users.length === 0) {
    const defaultUsers = [
      { username:'admin',    password:'123', name:'المدير العام',    role:'admin',   active:true },
      { username:'cashier1', password:'123', name:'كاشير المحل',     role:'cashier', active:true },
      { username:'manager1', password:'123', name:'أمين المستودع',   role:'manager', active:true },
    ];
    defaultUsers.forEach(u => { u.id = store.nextUserId++; u.permissions = getDefaultPermissions(u.role); store.users.push(u); });
  }

  // Seed default treasuries
  if (store.treasuries.length === 0) {
    store.treasuries.push({
      id: store.nextTreasuryId++,
      name: 'الخزنة الرئيسية',
      type: 'cash',
      accountNumber: '',
      bankName: '',
      balance: 50000,
      activeMethods: ['cash'],
      notes: 'خزنة النقدية الرئيسية',
      isDefault: true
    });
    store.treasuries.push({
      id: store.nextTreasuryId++,
      name: 'الحساب البنكي',
      type: 'bank',
      accountNumber: '123456789',
      bankName: 'البنك الأهلي',
      balance: 150000,
      activeMethods: ['card','wallet','instapay'],
      notes: 'الحساب البنكي للفروع',
      isDefault: false
    });
  }

  // Seed default warehouses
  if (store.warehouses.length === 0) {
    store.warehouses.push({ id: store.nextWarehouseId++, name: 'المحل الرئيسي',    code: 'W1', notes: 'المستودع الافتراضي' });
    store.warehouses.push({ id: store.nextWarehouseId++, name: 'مستودع العبور',    code: 'W2', notes: 'مخزن احتياطي' });
  }

  if (store.products.length === 0) {
    const items = [
      { name:'قميص كلاسيك أبيض',   category:'قمصان',      costPrice:180, sellPrice:350, size:'L',   color:'أبيض',      stock:15, minStock:5,  barcode:'P001' },
      { name:'قميص كاجوال أزرق',   category:'قمصان',      costPrice:200, sellPrice:420, size:'M',   color:'أزرق',      stock:3,  minStock:5,  barcode:'P002' },
      { name:'بنطال جينز أسود',    category:'بناطيل',     costPrice:300, sellPrice:650, size:'XL',  color:'أسود',      stock:8,  minStock:4,  barcode:'P003' },
      { name:'بنطال كاجوال بيج',   category:'بناطيل',     costPrice:250, sellPrice:500, size:'L',   color:'بيج',       stock:12, minStock:4,  barcode:'P004' },
      { name:'جاكيت شتوي رمادي',   category:'جاكيتات',    costPrice:600, sellPrice:1200,size:'XL',  color:'رمادي',     stock:5,  minStock:3,  barcode:'P005' },
      { name:'تيشيرت بولو أسود',   category:'تيشيرتات',   costPrice:120, sellPrice:280, size:'M',   color:'أسود',      stock:20, minStock:6,  barcode:'P006' },
      { name:'تيشيرت بولو أبيض',   category:'تيشيرتات',   costPrice:120, sellPrice:280, size:'L',   color:'أبيض',      stock:2,  minStock:6,  barcode:'P007' },
      { name:'حذاء رياضي أبيض',    category:'أحذية',      costPrice:400, sellPrice:850, size:'42',  color:'أبيض',      stock:6,  minStock:2,  barcode:'P008' },
      { name:'ساعة كلاسيكية ذهبية',category:'إكسسوارات',  costPrice:350, sellPrice:750, size:'متعدد',color:'ذهبي',     stock:4,  minStock:2,  barcode:'P009' },
      { name:'بنطال جينز أزرق',    category:'بناطيل',     costPrice:280, sellPrice:580, size:'M',   color:'أزرق',      stock:0,  minStock:4,  barcode:'P010' },
      { name:'قميص رسمي أزرق فاتح',category:'قمصان',      costPrice:220, sellPrice:480, size:'XL',  color:'أزرق فاتح', stock:7,  minStock:3,  barcode:'P011' },
      { name:'حزام جلد بني',       category:'إكسسوارات',  costPrice:80,  sellPrice:200, size:'متعدد',color:'بني',      stock:9,  minStock:3,  barcode:'P012' },
    ];
    items.forEach(p => {
      p.id = store.nextProductId++;
      p.description = '';
      // Assign all stock to first warehouse
      const whId = store.warehouses[0]?.id || 1;
      p.warehouseStocks = { [whId]: p.stock };
      store.products.push(p);
    });
  }

  // Migrate existing products that don't have warehouseStocks
  store.products.forEach(p => {
    if (!p.warehouseStocks) {
      const whId = store.warehouses[0]?.id || 1;
      p.warehouseStocks = { [whId]: p.stock };
    }
  });

  if (store.customers.length === 0) {
    const customers = [
      { name:'محمد علي',    phone:'01012345678', address:'القاهرة',     notes:'عميل مميز',           totalPurchases:0, visitCount:0 },
      { name:'أحمد حسن',   phone:'01098765432', address:'الجيزة',      notes:'',                    totalPurchases:0, visitCount:0 },
      { name:'عمر مصطفى',  phone:'01155443322', address:'الإسكندرية',  notes:'يفضل مقاس XL',        totalPurchases:0, visitCount:0 },
      { name:'خالد سعيد',  phone:'01567891234', address:'القاهرة',     notes:'دائماً يدفع كاش',     totalPurchases:0, visitCount:0 },
    ];
    customers.forEach(c => { c.id = store.nextCustomerId++; store.customers.push(c); });
  }

  if (store.suppliers.length === 0) {
    const suppliers = [
      { name:'مصنع النيل للملابس',   phone:'01100001111', address:'القاهرة - العباسية', email:'nile@factory.com',   notes:'مورد رئيسي للقمصان',  balance:0 },
      { name:'شركة البنوان للجينز',  phone:'01200002222', address:'الجيزة - إمبابة',    email:'banowan@supply.com', notes:'متخصص في البناطيل',   balance:0 },
      { name:'مستورد ماركات أوروبية',phone:'01300003333', address:'القاهرة - مدينة نصر',email:'euro@import.com',   notes:'ملابس حصرية مستوردة', balance:0 },
    ];
    suppliers.forEach(s => { s.id = store.nextSupplierId++; store.suppliers.push(s); });
  }

  if (store.expenses.length === 0) {
    const today = new Date();
    const expData = [
      { category:'إيجار', amount:3500, date:new Date(today.getFullYear(),today.getMonth(),1).toISOString().split('T')[0], notes:'إيجار شهر '+today.getMonth() },
      { category:'كهرباء', amount:480, date:new Date(today.getFullYear(),today.getMonth(),5).toISOString().split('T')[0], notes:'فاتورة كهرباء' },
      { category:'رواتب', amount:8000, date:new Date(today.getFullYear(),today.getMonth(),1).toISOString().split('T')[0], notes:'رواتب موظفي المحل' },
      { category:'صيانة', amount:250, date:new Date(today.getFullYear(),today.getMonth(),10).toISOString().split('T')[0], notes:'صيانة تكييف' },
    ];
    expData.forEach(e => { e.id = store.nextExpenseId++; store.expenses.push(e); });
  }

  if (store.sales.length === 0) {
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const cnt = Math.floor(Math.random() * 4) + (i < 7 ? 2 : 1);
      for (let j = 0; j < cnt; j++) {
        const p1 = store.products[Math.floor(Math.random() * store.products.length)];
        const p2 = Math.random() > 0.5 ? store.products[Math.floor(Math.random() * store.products.length)] : null;
        const items = [{ productId:p1.id, name:p1.name, price:p1.sellPrice, qty:1, subtotal:p1.sellPrice }];
        if (p2 && p2.id !== p1.id) items.push({ productId:p2.id, name:p2.name, price:p2.sellPrice, qty:1, subtotal:p2.sellPrice });
        const sub = items.reduce((a,it) => a + it.subtotal, 0);
        const disc = Math.random() > 0.7 ? Math.floor(sub * 0.05) : 0;
        store.sales.push({
          id: store.nextInvoiceNo++,
          date: d.toISOString().split('T')[0],
          time: `${Math.floor(Math.random()*10)+9}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`,
          customerId: null,
          customerName: ['عميل عام','محمد علي','أحمد حسن','عمر مصطفى'][Math.floor(Math.random()*4)],
          items,
          subtotal: sub,
          discount: disc,
          total: sub - disc,
          paymentMethod: ['cash','cash','cash','card','transfer'][Math.floor(Math.random()*5)]
        });
      }
    }
  }

  if (store.customers) {
    store.customers.forEach(c => {
      if (c.debt === undefined) c.debt = 0;
    });
    // Add a default demo debt
    if (store.customers.length > 1 && store.customers[1].debt === 0) {
      store.customers[1].debt = 450;
    }
  }

  // Seed default recurring invoices
  initRecurringInvoices();
  if (store.recurringInvoices.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    const c1 = store.customers[0]; // محمد علي
    const p1 = store.products[0];  // قميص كلاسيك أبيض
    const p2 = store.products[2];  // بنطال جينز أسود
    if (c1 && p1 && p2) {
      store.recurringInvoices.push({
        id: store.nextRecurringId++,
        name: 'اشتراك ملابس شهري - محمد علي',
        customerId: c1.id,
        customerName: c1.name,
        frequency: 'monthly',
        startDate: today,
        endDate: '',
        notes: 'توليد فاتورة اشتراك شهري للعميل',
        items: [
          { productId: p1.id, name: p1.name, price: p1.sellPrice, qty: 1, subtotal: p1.sellPrice },
          { productId: p2.id, name: p2.name, price: p2.sellPrice, qty: 1, subtotal: p2.sellPrice }
        ],
        total: p1.sellPrice + p2.sellPrice,
        active: true,
        nextDueDate: today,
        lastGeneratedDate: null,
        generatedCount: 0
      });
    }
  }

  saveData();
}

// ==================== DATE ====================
function updateDateDisplay() {
  const now = new Date();
  const opts = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  const date = now.toLocaleDateString('ar-EG', opts);
  const time = now.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
  const el = document.getElementById('dateDisplay');
  if (el) el.textContent = `${date}  ${time}`;
}

// ==================== NAVIGATION ====================
function showPage(name, el) {
  // Permission guard
  const perms = getUserPermissions();
  const allowedPages = perms.pages || ROLE_PERMISSIONS[currentUser?.role] || ROLE_PERMISSIONS['admin'];
  if (!allowedPages.includes(name)) {
    const fallback = allowedPages[0] || 'pos';
    const fallbackEl = document.querySelector(`.nav-item[data-page="${fallback}"]`);
    showToast('🚫 لا تملك صلاحية الوصول لهذه الصفحة', 'error');
    return showPage(fallback, fallbackEl);
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    dashboard:'لوحة التحكم', pos:'نقطة البيع', products:'إدارة المنتجات',
    inventory:'إدارة المخزون', sales:'سجل المبيعات', customers:'قاعدة العملاء',
    reports:'التقارير والإحصائيات', settings:'الإعدادات',
    expenses:'المصروفات والتكاليف', suppliers:'إدارة الموردين',
    purchases:'طلبات الشراء', returns:'المرتجعات', quotations:'عروض الأسعار',
    users:'إدارة المستخدمين', warehouses:'الفروع والمستودعات',
    recurring:'الفواتير المتكررة',
    purchaseinvoices:'فواتير المشتريات',
    stockadjust:'التسويات الجردية',
    treasuries:'إدارة الخزينة المتعددة'
  };
  const title = titles[name] || name;
  const t = document.getElementById('pageTitle');
  const b = document.getElementById('breadcrumb');
  if (t) t.textContent = title;
  if (b) b.textContent = `الرئيسية / ${title}`;

  if (name === 'dashboard')        { renderDashboard(); renderCharts(); }
  if (name === 'pos')              { renderPOS(); }
  if (name === 'products')         { renderProducts(); }
  if (name === 'inventory')        { renderInventory(); }
  if (name === 'sales')            { renderSales(); }
  if (name === 'customers')        { renderCustomers(); }
  if (name === 'reports')          { renderReports(); renderMonthlyChart(); }
  if (name === 'expenses')         { renderExpenses(); }
  if (name === 'suppliers')        { renderSuppliers(); }
  if (name === 'purchases')        { renderPurchases(); }
  if (name === 'returns')          { renderReturns(); }
  if (name === 'quotations')       { renderQuotations(); }
  if (name === 'users')            { renderUsers(); }
  if (name === 'warehouses')       { renderWarehouses(); renderStockTransfers(); }
  if (name === 'recurring')        { renderRecurringInvoices(); }
  if (name === 'purchaseinvoices') { renderPurchaseInvoices(); }
  if (name === 'stockadjust')      { renderStockAdjustments(); }
  if (name === 'treasuries')       { renderTreasuries(); }

  // Mobile: close sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.toggle('open');
  } else {
    const sidebar = document.getElementById('sidebar');
    const layout  = document.getElementById('appLayout');
    sidebar.classList.toggle('collapsed');
    layout.style.gridTemplateColumns = sidebar.classList.contains('collapsed')
      ? '64px 1fr'
      : 'var(--sidebar-w) 1fr';
  }
}

function toggleNotifications() {
  document.getElementById('notifPanel').classList.toggle('show');
}

function clearNotifications() {
  notifications = [];
  buildNotifications();
  document.getElementById('notifPanel').classList.remove('show');
}

// ==================== NOTIFICATIONS ====================
function buildNotifications() {
  notifications = [];

  // Per-warehouse stock alerts
  store.products.forEach(p => {
    if (p.warehouseStocks) {
      store.warehouses.forEach(wh => {
        const whQty = p.warehouseStocks[wh.id] || 0;
        if (whQty === 0) {
          notifications.push({ icon:'❌', title:'نفد من المخزون', msg:`${p.name} — ${wh.name}`, type:'danger' });
        } else if (whQty <= (p.minStock || 0)) {
          notifications.push({ icon:'⚠️', title:'مخزون منخفض', msg:`${p.name} — ${wh.name} (متبقي: ${whQty})`, type:'warning' });
        }
      });
    } else {
      // Fallback for products without warehouseStocks
      if (p.stock === 0) notifications.push({ icon:'❌', title:'نفد من المخزون', msg:`${p.name}`, type:'danger' });
      else if (p.stock <= p.minStock) notifications.push({ icon:'⚠️', title:'مخزون منخفض', msg:`${p.name} - باقي ${p.stock} قطع`, type:'warning' });
    }
  });

  if (store.customers) {
    store.customers.filter(c => (c.debt || 0) > 500).forEach(c => {
      notifications.push({ icon:'💳', title:'مديونية مرتفعة', msg:`العميل ${c.name} عليه مديونية بقيمة ${c.debt.toLocaleString('ar-EG')} ج`, type:'warning' });
    });
  }

  // Recurring invoices generated today alert
  if (store.recurringInvoices) {
    const todayStr = new Date().toISOString().split('T')[0];
    const genToday = store.recurringInvoices.filter(r => r.lastGeneratedDate === todayStr).length;
    if (genToday > 0) {
      notifications.push({ icon: '🔄', title: 'فواتير متكررة اليوم', msg: `تم توليد ${genToday} فاتورة متكررة تلقائياً اليوم`, type: 'info' });
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const todaySales = store.sales.filter(s => s.date === today);
  const todayExpenses = store.expenses ? store.expenses.filter(e => e.date === today) : [];
  const todayExpTotal = todayExpenses.reduce((a, e) => a + e.amount, 0);

  if (todaySales.length > 0) {
    const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
    notifications.unshift({ icon:'✅', title:'مبيعات اليوم', msg:`${todaySales.length} فاتورة - إجمالي ${todayTotal.toLocaleString('ar-EG')} ج`, type:'success' });
  }

  if (todaySales.length > 0 || todayExpTotal > 0) {
    const todaySalesTotal = todaySales.reduce((a, s) => a + s.total, 0);
    notifications.unshift({ icon:'📊', title:'ملخص مالي لليوم', msg: `مبيعات: ${todaySalesTotal.toLocaleString('ar-EG')} ج | مصروفات: ${todayExpTotal.toLocaleString('ar-EG')} ج`, type:'info' });
  }

  const list = document.getElementById('notifList');
  const badge = document.getElementById('notifCount');
  if (badge) {
    badge.textContent = notifications.length;
    badge.style.display = notifications.length > 0 ? 'flex' : 'none';
  }
  if (list) {
    list.innerHTML = notifications.length
      ? notifications.map(n => `
        <div class="notif-item">
          <span class="notif-icon">${n.icon}</span>
          <div class="notif-text"><strong>${n.title}</strong><p>${n.msg}</p></div>
        </div>`).join('')
      : '<div class="notif-empty">✅ لا توجد إشعارات جديدة</div>';
  }
}

function updateNavAlerts() {
  let alertCount = 0;
  store.products.forEach(p => {
    if (p.warehouseStocks) {
      store.warehouses.forEach(wh => {
        const q = p.warehouseStocks[wh.id] || 0;
        if (q <= (p.minStock || 0)) alertCount++;
      });
    } else if (p.stock <= p.minStock) alertCount++;
  });
  const alertEl = document.getElementById('navInventoryAlert');
  if (alertEl) alertEl.style.display = alertCount > 0 ? 'flex' : 'none';
}

// ==================== SIDEBAR TICKER ====================
function updateSidebarTicker() {
  const today = new Date().toISOString().split('T')[0];
  const todayTotal = store.sales.filter(s => s.date === today).reduce((a, s) => a + s.total, 0);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayTotal = store.sales.filter(s => s.date === yesterday.toISOString().split('T')[0]).reduce((a, s) => a + s.total, 0);

  const ticker = document.getElementById('sidebarTodaySales');
  const fill = document.getElementById('sidebarTickerFill');
  if (ticker) ticker.textContent = todayTotal.toLocaleString('ar-EG') + ' ج';
  if (fill) {
    const pct = yesterdayTotal > 0 ? Math.min(100, (todayTotal / yesterdayTotal) * 100) : (todayTotal > 0 ? 60 : 0);
    fill.style.width = pct + '%';
  }

  const name = document.getElementById('sidebarStoreName');
  if (name) name.textContent = store.settings.storeName || 'أحمد ستور';
}

// ==================== DASHBOARD ====================
function renderDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yday = yesterday.toISOString().split('T')[0];

  const todaySales = store.sales.filter(s => s.date === today);
  const ydaySales  = store.sales.filter(s => s.date === yday);
  const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
  const ydayTotal  = ydaySales.reduce((a, s) => a + s.total, 0);
  const totalRevenue = store.sales.reduce((a, s) => a + s.total, 0);
  const lowStock = store.products.filter(p => p.stock <= p.minStock);
  const totalStock = store.products.reduce((a, p) => a + p.stock, 0);

  animateNumber('totalRevenue', totalRevenue);
  animateNumber('todaySales', todayTotal, true);
  animateNumber('totalProducts', store.products.length);
  animateNumber('lowStockCount', lowStock.length);

  const todayCountEl = document.getElementById('todayCount');
  if (todayCountEl) todayCountEl.textContent = todaySales.length + ' فاتورة';

  const totalStockEl = document.getElementById('totalStock');
  if (totalStockEl) totalStockEl.textContent = 'في المخزون: ' + totalStock.toLocaleString('ar-EG');

  const trendEl = document.getElementById('todayTrend');
  if (trendEl && ydayTotal > 0) {
    const pct = ((todayTotal - ydayTotal) / ydayTotal * 100).toFixed(1);
    trendEl.className = 'stat-trend ' + (pct >= 0 ? 'up' : 'down');
    trendEl.textContent = (pct >= 0 ? '↑' : '↓') + ' ' + Math.abs(pct) + '%';
  }

  // Recent sales
  const tbody = document.getElementById('recentSalesBody');
  if (tbody) {
    const recent = [...store.sales].reverse().slice(0, 7);
    tbody.innerHTML = recent.map(s => {
      const itemStr = s.items.map(i=>`${i.name} ×${i.qty}`).join(', ');
      const trimmed  = itemStr.length > 35 ? itemStr.substring(0, 35) + '...' : itemStr;
      return `
      <tr>
        <td><span class="badge badge-primary">#${s.id}</span></td>
        <td style="font-size:12px">${s.customerName}</td>
        <td style="font-size:11px;color:var(--text-muted)">${trimmed}</td>
        <td style="font-weight:800;color:var(--primary-light)">${s.total.toFixed(0)} ج</td>
        <td><span class="badge ${getPayBadge(s.paymentMethod)}">${getPayLabel(s.paymentMethod, s.paymentSplit)}</span></td>
      </tr>`;
    }).join('');
  }

  // Low stock list
  const lowEl = document.getElementById('lowStockList');
  if (lowEl) {
    const items = lowStock.slice(0, 7);
    lowEl.innerHTML = items.length
      ? items.map(p => `
          <div class="low-stock-item ${p.stock===0?'out':''}">
            <span class="low-stock-name">${getEmoji(p.category)} ${p.name} (${p.size})</span>
            <span class="low-stock-count">${p.stock===0 ? '❌ نفد' : `⚠️ ${p.stock}`}</span>
          </div>`)
        .join('')
      : '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:13px">✅ المخزون في حالة جيدة</div>';
  }

  updateSidebarTicker();
  buildNotifications();

  // Sparkline: last 7 days revenue
  const sparkData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    sparkData.push(store.sales.filter(s=>s.date===ds).reduce((a,s)=>a+s.total,0));
  }
  renderSparkline('sparkRevenue', sparkData);
}

function animateNumber(id, target, currency = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = store.settings.currency || 'ج';
  const start = performance.now();
  const duration = 700;
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.floor(target * eased);
    el.textContent = currency ? val.toLocaleString('ar-EG') + ' ' + cur : val.toLocaleString('ar-EG');
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = currency ? target.toLocaleString('ar-EG') + ' ' + cur : target.toLocaleString('ar-EG');
  }
  requestAnimationFrame(tick);
}

function renderSparkline(id, data) {
  const el = document.getElementById(id);
  if (!el || !data.length) return;
  const max = Math.max(...data, 1);
  const w = 80, h = 30, bw = 7;
  const bars = data.map((v, i) => {
    const bh = Math.max(2, Math.round((v / max) * h));
    const x  = i * (bw + 3);
    const y  = h - bh;
    const op = (0.3 + (i / data.length) * 0.7).toFixed(2);
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="currentColor" opacity="${op}"/>`;
  }).join('');
  el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${bars}</svg>`;
}

// ==================== CHART.JS ====================
function loadChartJS() {
  if (typeof Chart !== 'undefined') { renderCharts(); return; }
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = () => { renderCharts(); renderMonthlyChart(); };
  document.head.appendChild(s);
}

function renderCharts() {
  renderSalesChart('week');
  renderCategoryChart();
}

function renderSalesChart(period) {
  const canvas = document.getElementById('salesChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (salesChartInst) salesChartInst.destroy();
  const { labels, data } = getChartData(period);
  salesChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data, label:'المبيعات',
        backgroundColor: ctx => {
          const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 220);
          g.addColorStop(0, 'rgba(124,110,245,0.7)');
          g.addColorStop(1, 'rgba(124,110,245,0.1)');
          return g;
        },
        borderColor:'rgba(124,110,245,0.9)', borderWidth:2,
        borderRadius:8, borderSkipped:false,
        hoverBackgroundColor:'rgba(124,110,245,0.9)'
      }]
    },
    options: {
      responsive:true, animation:{ duration:600 },
      plugins:{
        legend:{display:false},
        tooltip:{
          rtl:true, titleFont:{family:'Cairo'}, bodyFont:{family:'Cairo'},
          callbacks:{ label:c=>' '+c.raw.toLocaleString('ar-EG')+' ج' }
        }
      },
      scales:{
        x:{ ticks:{color:'#9898cc',font:{family:'Cairo',size:10}}, grid:{color:'rgba(255,255,255,0.04)'} },
        y:{ ticks:{color:'#9898cc',font:{family:'Cairo',size:10}}, grid:{color:'rgba(255,255,255,0.04)'}, beginAtZero:true }
      }
    }
  });
}

function getChartData(period) {
  const today = new Date();
  const labels=[], data=[];
  const DAYS = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

  if (period === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      labels.push(DAYS[d.getDay()]);
      data.push(store.sales.filter(s=>s.date===ds).reduce((a,s)=>a+s.total,0));
    }
  } else if (period === 'month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      labels.push(`${d.getDate()}/${d.getMonth()+1}`);
      data.push(store.sales.filter(s=>s.date===ds).reduce((a,s)=>a+s.total,0));
    }
  } else if (period === 'year') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today); d.setMonth(d.getMonth()-i);
      const m = d.getMonth(), y = d.getFullYear();
      labels.push(MONTHS[m]);
      data.push(store.sales.filter(s=>{ const sd=new Date(s.date); return sd.getMonth()===m && sd.getFullYear()===y; }).reduce((a,s)=>a+s.total,0));
    }
  }
  return { labels, data };
}

function updateChart(period, btn) {
  document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderSalesChart(period);
}

function renderCategoryChart() {
  const canvas = document.getElementById('categoryChart');
  const legendEl = document.getElementById('categoryLegend');
  if (!canvas || typeof Chart === 'undefined') return;
  if (catChartInst) catChartInst.destroy();

  const totals = {};
  store.sales.forEach(s => s.items.forEach(item => {
    const p = store.products.find(p=>p.id===item.productId);
    const cat = p ? p.category : 'أخرى';
    totals[cat] = (totals[cat]||0) + item.subtotal;
  }));
  const labels = Object.keys(totals), data = Object.values(totals);
  if (!data.length) { if(legendEl)legendEl.innerHTML='<div style="color:var(--text-muted);font-size:11px;text-align:center">لا توجد بيانات</div>'; return; }

  catChartInst = new Chart(canvas, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:CHART_COLORS.slice(0,labels.length), borderColor:'transparent', hoverOffset:10 }] },
    options:{
      responsive:true, cutout:'65%', animation:{duration:600},
      plugins:{
        legend:{display:false},
        tooltip:{ rtl:true, titleFont:{family:'Cairo'}, bodyFont:{family:'Cairo'}, callbacks:{label:c=>` ${c.label}: ${c.raw.toLocaleString('ar-EG')} ج`} }
      }
    }
  });
  if(legendEl) legendEl.innerHTML = labels.map((l,i)=>`<div class="legend-item"><span class="legend-dot" style="background:${CHART_COLORS[i]}"></span><span>${l}: ${data[i].toLocaleString('ar-EG')} ج</span></div>`).join('');
}

function renderMonthlyChart() {
  const canvas = document.getElementById('monthlyChart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (monthlyChartInst) monthlyChartInst.destroy();
  const period = reportPeriod === 'all' ? 'year' : reportPeriod;
  const { labels, data: salesData } = getChartData(period);

  // Build expenses data per period bucket
  const today = new Date();
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const expData = labels.map((lbl, i) => {
    let expenses = store.expenses || [];
    if (reportWarehouseFilter !== 'all') expenses = expenses.filter(e => !e.warehouseId || e.warehouseId === reportWarehouseFilter);
    if (period === 'week') {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().split('T')[0];
      return expenses.filter(e => e.date === ds).reduce((a,e) => a+e.amount, 0);
    } else if (period === 'month') {
      const d = new Date(today); d.setDate(d.getDate() - (29 - i));
      const ds = d.toISOString().split('T')[0];
      return expenses.filter(e => e.date === ds).reduce((a,e) => a+e.amount, 0);
    } else {
      const d = new Date(today); d.setMonth(d.getMonth() - (11 - i));
      const m = d.getMonth(), y = d.getFullYear();
      return expenses.filter(e => { const ed = new Date(e.date); return ed.getMonth()===m && ed.getFullYear()===y; }).reduce((a,e) => a+e.amount, 0);
    }
  });
  const profitData = salesData.map((s, i) => s - expData[i]);

  monthlyChartInst = new Chart(canvas, {
    type:'line',
    data:{
      labels,
      datasets:[
        {
          label:'المبيعات', data: salesData,
          borderColor:'#7c6ef5', backgroundColor:'rgba(124,110,245,0.08)',
          borderWidth:2, tension:0.4, fill:true,
          pointBackgroundColor:'#7c6ef5', pointRadius:3, pointHoverRadius:5
        },
        {
          label:'المصروفات', data: expData,
          borderColor:'#ff4f64', backgroundColor:'rgba(255,79,100,0.05)',
          borderWidth:2, tension:0.4, fill:false,
          pointBackgroundColor:'#ff4f64', pointRadius:3, pointHoverRadius:5,
          borderDash:[5,3]
        },
        {
          label:'صافي الربح', data: profitData,
          borderColor:'#00c896', backgroundColor:'rgba(0,200,150,0.08)',
          borderWidth:2, tension:0.4, fill:false,
          pointBackgroundColor:'#00c896', pointRadius:3, pointHoverRadius:5
        }
      ]
    },
    options:{
      responsive:true, animation:{duration:600},
      plugins:{
        legend:{ display:true, position:'top', rtl:true, labels:{color:'#9898cc',font:{family:'Cairo',size:10},boxWidth:12,padding:12} },
        tooltip:{ rtl:true, titleFont:{family:'Cairo'}, bodyFont:{family:'Cairo'}, callbacks:{ label: c => ` ${c.dataset.label}: ${c.raw.toLocaleString('ar-EG')} ج` } }
      },
      scales:{
        x:{ ticks:{color:'#9898cc',font:{family:'Cairo',size:9}}, grid:{color:'rgba(255,255,255,0.04)'} },
        y:{ ticks:{color:'#9898cc',font:{family:'Cairo',size:9}}, grid:{color:'rgba(255,255,255,0.04)'}, beginAtZero:true }
      }
    }
  });
}

// ==================== POS ====================
let currentReturnSale = null;

function renderPOS() {
  renderPOSCategories();
  filterPOSProducts();
  updateCustomerDropdown();
  renderCart();
  updateCartTotals();
  renderPOSWarehouseSelector();
  // Restore customer badge if a customer is selected (e.g. after restoring held invoice)
  const sel = document.getElementById('cartCustomer');
  if (sel && sel.value) {
    const c = store.customers.find(c => c.id == sel.value);
    if (c) {
      const badge = document.getElementById('selectedCustomerBadge');
      const nameEl = document.getElementById('selectedCustomerName');
      if (badge) { badge.style.display = 'flex'; }
      if (nameEl) nameEl.textContent = c.name;
    }
  }
  // Apply POS permission-based UI
  applyPOSPermissions();
}

function applyPOSPermissions() {
  const canDiscount = checkUserPermission('canApplyDiscount');
  const discInput = document.getElementById('discountAmount');
  const discType = document.getElementById('discountType');
  if (discInput) discInput.disabled = !canDiscount;
  if (discType) discType.disabled = !canDiscount;
  const discountRow = document.querySelector('.discount-row');
  if (discountRow) {
    discountRow.style.opacity = canDiscount ? '1' : '0.4';
    discountRow.title = canDiscount ? '' : '🚫 لا تملك صلاحية تطبيق الخصم';
  }
}

function renderPOSCategories() {
  const el = document.getElementById('posCategories');
  if (!el) return;
  const cats = ['all', ...new Set(store.products.map(p=>p.category))];
  el.innerHTML = cats.map(c=>`
    <button class="pos-cat-btn ${c===currentPOSCategory?'active':''}" onclick="setPOSCategory('${c}',this)">
      ${c==='all'?'🛍️ الكل':`${getEmoji(c)} ${c}`}
    </button>`).join('');
}

function setPOSCategory(cat, btn) {
  currentPOSCategory = cat;
  document.querySelectorAll('.pos-cat-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  filterPOSProducts();
}

function clearPOSSearch() {
  const el = document.getElementById('posSearch');
  if (el) { el.value=''; el.focus(); }
  document.getElementById('posClearBtn').style.display='none';
  filterPOSProducts();
}

function filterPOSProducts() {
  const searchEl = document.getElementById('posSearch');
  const search = (searchEl?.value || '').toLowerCase().trim();
  const clearBtn = document.getElementById('posClearBtn');
  const searchResults = document.getElementById('posSearchResults');
  const searchHint = document.getElementById('posSearchHint');

  // Show/hide clear button
  if (clearBtn) {
    clearBtn.style.display = search ? 'block' : 'none';
  }

  if (!search) {
    if (searchResults) {
      searchResults.style.display = 'none';
      searchResults.innerHTML = '';
    }
    if (searchHint) {
      searchHint.style.display = 'flex';
    }
    return;
  }

  // Filter products
  const products = store.products.filter(p => {
    const matchCat = currentPOSCategory === 'all' || p.category === currentPOSCategory;
    const matchSearch = p.name.toLowerCase().includes(search) || 
                        (p.barcode || '').toLowerCase().includes(search) || 
                        (p.color || '').toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  if (searchHint) {
    searchHint.style.display = 'none';
  }

  if (searchResults) {
    searchResults.style.display = 'flex';
    if (!products.length) {
      searchResults.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;width:100%;font-size:13px">🔍 لا توجد نتائج مطابقة</div>';
      return;
    }

    searchResults.innerHTML = products.map(p => {
      const inCart = cart.find(i => i.productId === p.id);
      const stock = p.stock || 0;
      const isOutOfStock = stock <= 0;
      
      // Get stock for the currently selected warehouse if applicable
      const whId = document.getElementById('posWarehouseSelect')?.value;
      const whStock = whId && p.warehouseStocks ? (p.warehouseStocks[whId] || 0) : stock;
      const whOutOfStock = whId ? whStock <= 0 : isOutOfStock;

      return `
        <div class="pos-search-item-row ${whOutOfStock ? 'out-of-stock' : ''}" onclick="${!whOutOfStock ? `addToCart(${p.id})` : ''}">
          <div style="display:flex;align-items:center;gap:12px;flex:1;text-align:right">
            <span style="font-size:24px">${getEmoji(p.category)}</span>
            <div>
              <div style="font-weight:700;font-size:13px">${p.name}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">
                المقاس: ${p.size} ${p.color ? ' · اللون: ' + p.color : ''} 
                ${p.barcode ? ' · باركود: ' + p.barcode : ''}
              </div>
            </div>
          </div>
          <div style="text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
            <div style="font-weight:800;color:var(--primary-light);font-size:14px">${p.sellPrice.toLocaleString('ar-EG')} ج</div>
            <div style="font-size:11px;font-weight:600;color:${whOutOfStock ? 'var(--danger)' : 'var(--text-muted)'}">
              ${whOutOfStock ? '❌ نفد المخزون' : `📦 متاح: ${whStock}`}
            </div>
          </div>
          ${inCart ? `<span style="background:var(--success);color:white;font-size:10px;padding:3px 7px;border-radius:10px;font-weight:700;margin-right:8px">×${inCart.qty}</span>` : ''}
        </div>
      `;
    }).join('');
  }
}

function addToCart(productId) {
  const product = store.products.find(p => p.id === productId);
  if (!product) return;

  const whSelect = document.getElementById('posWarehouseSelect');
  const whId = whSelect?.value;
  const maxStock = whId && product.warehouseStocks ? (product.warehouseStocks[whId] || 0) : (product.stock || 0);

  if (maxStock <= 0) {
    showToast('لا يوجد مخزون كافٍ في هذا الفرع', 'error');
    return;
  }

  const existing = cart.find(i => i.productId === productId);
  if (existing) {
    if (existing.qty >= maxStock) {
      showToast('وصلت للحد الأقصى المتاح في هذا الفرع', 'error');
      return;
    }
    existing.qty++;
    existing.subtotal = existing.qty * existing.price;
  } else {
    cart.push({ productId, name: product.name, price: product.sellPrice, qty: 1, subtotal: product.sellPrice });
  }
  renderCart();
  updateCartTotals();
  filterPOSProducts(); // Refresh to show badge
  showToast(`${product.name} ✅`, 'success');
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.productId !== productId);
  renderCart();
  updateCartTotals();
  filterPOSProducts();
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.productId === productId);
  if (!item) return;
  const product = store.products.find(p => p.id === productId);
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(productId);
    return;
  }

  const whSelect = document.getElementById('posWarehouseSelect');
  const whId = whSelect?.value;
  const maxStock = whId && product && product.warehouseStocks ? (product.warehouseStocks[whId] || 0) : (product ? product.stock : 9999);

  if (product && item.qty > maxStock) {
    item.qty = maxStock;
    showToast('وصلت للحد الأقصى المتاح في هذا الفرع', 'error');
  }
  item.subtotal = item.qty * item.price;
  renderCart();
  updateCartTotals();
  filterPOSProducts();
}

function renderCart() {
  const el = document.getElementById('cartItems');
  const badge = document.getElementById('cartCountBadge');
  const posCount = document.getElementById('posCartCount');
  const posTotal = document.getElementById('posHeaderTotal');
  const sub = cart.reduce((a,i)=>a+i.subtotal,0);

  if (badge) badge.textContent = cart.reduce((a,i)=>a+i.qty,0);
  if (posCount) posCount.textContent = cart.length;
  if (posTotal) posTotal.textContent = sub.toFixed(0) + ' ج';

  if (!el) return;
  if (!cart.length) {
    el.innerHTML = `<div class="cart-empty" id="cartEmpty"><div class="empty-icon">🛒</div><p>السلة فارغة</p><p style="font-size:11px;margin-top:4px">اختر منتجاً أو ابحث بالباركود</p></div>`;
    return;
  }
  el.innerHTML = cart.map(item=>`
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${item.price} × ${item.qty} = ${item.subtotal.toFixed(2)} ج</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="changeQty(${item.productId},-1)">−</button>
        <span class="qty-display">${item.qty}</span>
        <button class="qty-btn" onclick="changeQty(${item.productId},1)">+</button>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.productId})">✕</button>
    </div>`).join('');
}

function clearCart() {
  cart = [];
  const di = document.getElementById('discountAmount');
  if (di) di.value = 0;
  // Clear all payment split inputs
  ['cash','card','wallet','instapay','credit'].forEach(m => {
    const el = document.getElementById(`pay-${m}-amount`);
    if (el) el.value = '';
  });
  clearSelectedCustomer();
  renderCart();
  updateCartTotals();
  filterPOSProducts();
  updateHeldBadge();
}

function updateCartTotals() {
  const subtotal = cart.reduce((a,i)=>a+i.subtotal, 0);
  const discVal = parseFloat(document.getElementById('discountAmount')?.value||0)||0;
  const discType = document.getElementById('discountType')?.value||'fixed';
  const discount = discType==='percent' ? (subtotal * discVal / 100) : discVal;
  const total = Math.max(0, subtotal - discount);

  const subEl = document.getElementById('subtotal');
  const totEl = document.getElementById('grandTotal');
  if (subEl) subEl.textContent = subtotal.toFixed(2) + ' ج';
  if (totEl) totEl.textContent = total.toFixed(2) + ' ج';

  // Quick cash buttons
  const cur = store.settings.currency || 'ج';
  const quickContainer = document.getElementById('quickCashBtns');
  if (quickContainer) {
    const amounts = [50, 100, 200, 500].filter(a => a >= total * 0.5);
    const exactRounded = Math.ceil(total / 50) * 50;
    const all = [...new Set([...amounts, exactRounded])].sort((a,b)=>a-b).slice(0,4);
    quickContainer.innerHTML = all.map(a=>`<button class="quick-cash-btn" onclick="setCashPaid(${a})">${a} ${cur}</button>`).join('');
  }

  onPaySplitChange();
}

function setCashPaid(amount) {
  const el = document.getElementById('pay-cash-amount');
  if (el) { el.value = amount; onPaySplitChange(); }
}

// Legacy stub kept for backward compatibility
function setPayMethod(method, btn) { }
function calcChange() { onPaySplitChange(); }

// ==================== SPLIT PAYMENT LOGIC ====================

function getPaySplit() {
  const methods = ['cash','card','wallet','instapay','credit'];
  const split = {};
  methods.forEach(m => {
    const v = parseFloat(document.getElementById(`pay-${m}-amount`)?.value || 0) || 0;
    if (v > 0) split[m] = v;
  });
  return split;
}

function onPaySplitChange() {
  const grandTotalText = document.getElementById('grandTotal')?.textContent || '0';
  const total = parseFloat(grandTotalText.replace(/[^0-9.]/g,'')) || 0;
  const split = getPaySplit();
  const paid = Object.values(split).reduce((a,b)=>a+b, 0);
  const remain = total - paid;

  const paidEl   = document.getElementById('paySplitPaid');
  const remainEl = document.getElementById('paySplitRemain');
  const totalEl  = document.getElementById('paySplitTotal');

  if (paidEl)   { paidEl.textContent   = paid.toFixed(2) + ' ج'; paidEl.style.color = paid >= total && total > 0 ? 'var(--success)' : 'var(--text-primary)'; }
  if (remainEl) { remainEl.textContent = remain.toFixed(2) + ' ج'; remainEl.style.color = remain > 0 ? 'var(--danger)' : remain < 0 ? 'var(--warning)' : 'var(--success)'; }
  if (totalEl)  { totalEl.textContent  = total.toFixed(2) + ' ج'; }
}

function fillCashRemainder() {
  const grandTotalText = document.getElementById('grandTotal')?.textContent || '0';
  const total = parseFloat(grandTotalText.replace(/[^0-9.]/g,'')) || 0;
  const split = getPaySplit();
  const cashEl = document.getElementById('pay-cash-amount');
  const cashCurrent = parseFloat(cashEl?.value || 0) || 0;
  const otherPaid = Object.entries(split).filter(([m])=>m!=='cash').reduce((a,[,v])=>a+v, 0);
  const need = Math.max(0, total - otherPaid);
  if (cashEl) { cashEl.value = need > 0 ? need.toFixed(2) : ''; onPaySplitChange(); }
}

function completeSale() {
  if (!cart.length) { showToast('السلة فارغة!', 'error'); return; }

  // ✅ إلزامية اختيار العميل في جميع الحالات
  const customerId = document.getElementById('cartCustomer')?.value;
  const customer = customerId ? store.customers.find(c=>c.id==customerId) : null;
  if (!customer) {
    showToast('⚠️ يجب اختيار عميل قبل إتمام البيع!', 'error');
    const sel = document.getElementById('cartCustomer');
    if (sel) { sel.style.border = '2px solid var(--danger)'; setTimeout(()=>sel.style.border='',2500); }
    return;
  }

  const subtotal = cart.reduce((a,i)=>a+i.subtotal,0);
  const discVal = parseFloat(document.getElementById('discountAmount')?.value||0)||0;
  const discType = document.getElementById('discountType')?.value||'fixed';
  const discount = discType==='percent' ? (subtotal * discVal / 100) : discVal;
  const total = Math.max(0, subtotal - discount);

  // ✅ حساب توزيع الدفع المتعدد
  const split = getPaySplit();
  const totalPaid = Object.values(split).reduce((a,b)=>a+b, 0);
  const creditAmount = split['credit'] || 0;
  const cashAmount   = split['cash'] || 0;

  // حالة خاصة: إذا كان الإجمالي صفر ولا يوجد توزيع أضف نقدي
  if (total === 0 && Object.keys(split).length === 0) {
    split['cash'] = 0;
  }
  // التحقق من المبالغ
  if (totalPaid < total - 0.01) {
    showToast(`⚠️ المبلغ المدفوع (${totalPaid.toFixed(2)} ج) أقل من الإجمالي (${total.toFixed(2)} ج)!`, 'error');
    return;
  }
  // إذا كان هناك دفع آجل، يجب أن يكون هناك عميل (وهذا مضمون من الشرط أعلاه)
  if (creditAmount > 0) {
    customer.debt = (customer.debt || 0) + creditAmount;
  }
  lastSaleChange = Math.max(0, totalPaid - total);

  // تحديث المخزون
  const whId = selectedWarehouseId;
  cart.forEach(item => {
    const p = store.products.find(p=>p.id===item.productId);
    if (p) {
      p.stock = Math.max(0, p.stock - item.qty);
      if (p.warehouseStocks && p.warehouseStocks[whId] !== undefined) {
        p.warehouseStocks[whId] = Math.max(0, (p.warehouseStocks[whId] || 0) - item.qty);
      }
      if (p.warehouseStocks) {
        p.stock = Object.values(p.warehouseStocks).reduce((a,b)=>a+(b||0),0);
      }
    }
  });

  // تحديد طريقة الدفع الرئيسية للعرض
  const keys = Object.keys(split);
  const mainPayMethod = keys.length === 1 ? keys[0] : 'mixed';
  paymentMethod = mainPayMethod;

  const now = new Date();
  const sale = {
    id: store.nextInvoiceNo++,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' }),
    customerId: customer.id,
    customerName: customer.name,
    items: [...cart],
    subtotal, discount, total,
    paymentMethod: mainPayMethod,
    paymentSplit: split,
    warehouseId: whId,
    warehouseName: store.warehouses.find(w=>w.id===whId)?.name || '',
    cashierId: currentUser?.id || null,
    cashierName: currentUser?.name || 'النظام'
  };
  store.sales.push(sale);

  customer.totalPurchases = (customer.totalPurchases||0) + total;
  customer.visitCount = (customer.visitCount||0) + 1;

  // تسجيل المديونية إن وجدت
  if (creditAmount > 0) {
    if (!store.debtHistory) store.debtHistory = [];
    if (!store.nextDebtLogId) store.nextDebtLogId = 1;
    store.debtHistory.push({
      id: store.nextDebtLogId++,
      customerId: customer.id,
      customerName: customer.name,
      type: 'charge',
      amount: creditAmount,
      saleId: sale.id,
      date: sale.date,
      notes: `بيع آجل (جزء من فاتورة #${sale.id})`,
      balance: customer.debt
    });
  }

  // تسجيل حركة الخزينة
  if (!store.treasuryTransactions) store.treasuryTransactions = [];
  if (!store.treasuries) store.treasuries = [];
  Object.entries(split).forEach(([method, amount]) => {
    if (method === 'credit' || amount <= 0) return;
    const treasuryType = method === 'cash' ? 'cash' : 'bank';
    let treasury = (store.treasuries || []).find(t => t.type === treasuryType && (t.activeMethods || []).includes(method));
    if (!treasury) treasury = (store.treasuries || []).find(t => t.isDefault) || (store.treasuries || [])[0];
    if (!treasury) return;
    treasury.balance = (treasury.balance || 0) + amount;
    store.treasuryTransactions.push({
      id: store.treasuryTransactions.length + 1,
      treasuryId: treasury.id,
      date: sale.date,
      time: sale.time,
      type: 'sale',
      amount,
      paymentMethod: method,
      reference: `فاتورة #${sale.id}`,
      description: `بيع - ${customer.name}`,
      createdBy: currentUser?.name || 'النظام'
    });
  });

  lastSaleId = sale.id;
  lastSaleTotal = total;

  saveData();
  clearCart();
  renderPOS();
  updateNavAlerts();
  buildNotifications();
  updateSidebarTicker();

  showSaleSuccess(sale.id, total, lastSaleChange);
}

function showSaleSuccess(invoiceId, total, change) {
  document.getElementById('successInvoiceNo').textContent = `فاتورة رقم #${invoiceId}`;
  document.getElementById('successAmount').textContent = total.toLocaleString('ar-EG') + ' ج';
  document.getElementById('successChange').textContent = change.toFixed(2) + ' ج';
  const changeRow = document.getElementById('successChangeRow');
  if (changeRow) changeRow.style.display = change > 0 ? 'flex' : 'none';

  const printBtn = document.getElementById('successPrintBtn');
  if (printBtn) printBtn.onclick = () => { printInvoiceById(invoiceId); closeSaleSuccess(); };

  const pdfBtn = document.getElementById('successPdfBtn');
  if (pdfBtn) pdfBtn.onclick = () => exportInvoiceToPDF(invoiceId);

  document.getElementById('saleSuccessOverlay').classList.add('show');
}

function closeSaleSuccess() {
  document.getElementById('saleSuccessOverlay').classList.remove('show');
}

// ==================== CUSTOMER SEARCH IN POS ====================
function searchCustomersInPOS() {
  const q = (document.getElementById('customerSearchInput')?.value||'').toLowerCase().trim();
  const dropdown = document.getElementById('customerSearchDropdown');
  if (!dropdown) return;
  if (!q) { dropdown.style.display = 'none'; return; }

  const matches = store.customers.filter(c =>
    c.name.toLowerCase().includes(q) || (c.phone||'').includes(q)
  ).slice(0, 8);

  dropdown.style.display = 'block';
  if (!matches.length) {
    dropdown.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text-muted);font-size:13px">لا يوجد عميل بهذا الاسم</div>';
    return;
  }

  dropdown.innerHTML = matches.map(c => `
    <div class="customer-search-option" onclick="selectCustomerInPOS(${c.id})">
      <div style="font-weight:600">${c.name}</div>
      <div style="font-size:11px;color:var(--text-muted)">${c.phone||''} ${c.debt>0?`· 💳 دين: ${c.debt.toFixed(2)} ج`:''}${c.totalPurchases?` · مشتريات: ${c.totalPurchases.toFixed(0)} ج`:''}</div>
    </div>`).join('');
}

function selectCustomerInPOS(customerId) {
  const customer = store.customers.find(c => c.id === customerId);
  if (!customer) return;
  // Set hidden select
  updateCustomerDropdown();
  const sel = document.getElementById('cartCustomer');
  if (sel) sel.value = customerId;
  // Show badge
  const badge = document.getElementById('selectedCustomerBadge');
  const nameEl = document.getElementById('selectedCustomerName');
  const input = document.getElementById('customerSearchInput');
  const dropdown = document.getElementById('customerSearchDropdown');
  if (badge) badge.style.display = 'flex';
  if (nameEl) nameEl.textContent = customer.name;
  if (input) input.value = '';
  if (dropdown) dropdown.style.display = 'none';
}

function clearSelectedCustomer() {
  const sel = document.getElementById('cartCustomer');
  if (sel) sel.value = '';
  const badge = document.getElementById('selectedCustomerBadge');
  const input = document.getElementById('customerSearchInput');
  if (badge) badge.style.display = 'none';
  if (input) input.value = '';
}

// ==================== PAYMENT CONFIRM MODAL ====================
function openPaymentModal() {
  if (!cart.length) { showToast('السلة فارغة!', 'error'); return; }
  const customerId = document.getElementById('cartCustomer')?.value;
  const customer = customerId ? store.customers.find(c => c.id == customerId) : null;
  if (!customer) {
    showToast('⚠️ يجب اختيار عميل قبل إتمام البيع!', 'error');
    const inp = document.getElementById('customerSearchInput');
    if (inp) { inp.style.border = '2px solid var(--danger)'; setTimeout(() => inp.style.border = '', 2500); inp.focus(); }
    return;
  }
  const subtotal = cart.reduce((a,i) => a+i.subtotal, 0);
  const discVal = parseFloat(document.getElementById('discountAmount')?.value||0)||0;
  const discType = document.getElementById('discountType')?.value||'fixed';
  const discount = discType === 'percent' ? (subtotal * discVal / 100) : discVal;
  const total = Math.max(0, subtotal - discount);

  const pmCustomer = document.getElementById('pmCustomerName');
  const pmItems   = document.getElementById('pmItemsCount');
  const pmTotal   = document.getElementById('pmTotal');
  if (pmCustomer) pmCustomer.textContent = customer.name;
  if (pmItems) pmItems.textContent = `${cart.length} صنف (${cart.reduce((a,i)=>a+i.qty,0)} قطعة)`;
  if (pmTotal) pmTotal.textContent = total.toFixed(2) + ' ج';

  // Reset payment inputs
  ['cash','card','wallet','instapay','credit'].forEach(m => {
    const el = document.getElementById(`pay-${m}-amount`);
    if (el) el.value = '';
  });
  // Update quick cash buttons and split summary
  updateCartTotals();

  document.getElementById('paymentConfirmModal')?.classList.add('show');
  setTimeout(() => document.getElementById('pay-cash-amount')?.focus(), 150);
}

function closePaymentModal() {
  document.getElementById('paymentConfirmModal')?.classList.remove('show');
}

function completeSaleAndPrint() {
  completeSale();
  // printInvoiceById is called inside showSaleSuccess or after
  if (lastSaleId) {
    setTimeout(() => printInvoiceById(lastSaleId), 400);
  }
}

function updateCustomerDropdown() {
  const select = document.getElementById('cartCustomer');
  if (!select) return;
  select.innerHTML = '<option value="">👤 اختر العميل... *</option>' +
    store.customers.map(c=>`<option value="${c.id}">${c.name}${c.phone?' - '+c.phone:''}</option>`).join('');
}

// ==================== PRODUCTS ====================
function renderProducts() {
  const search = (document.getElementById('productsSearch')?.value||'').toLowerCase();
  const cat = document.getElementById('productsCategoryFilter')?.value||'';
  const sort = document.getElementById('productsSortFilter')?.value||'name';

  let products = store.products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search) || p.category.toLowerCase().includes(search) || p.color.toLowerCase().includes(search);
    const matchCat = !cat || p.category===cat;
    return matchSearch && matchCat;
  });

  if (sort==='price_asc')  products.sort((a,b)=>a.sellPrice-b.sellPrice);
  if (sort==='price_desc') products.sort((a,b)=>b.sellPrice-a.sellPrice);
  if (sort==='stock_asc')  products.sort((a,b)=>a.stock-b.stock);
  if (sort==='name')       products.sort((a,b)=>a.name.localeCompare(b.name,'ar'));

  const countBar = document.getElementById('productsCountBar');
  if (countBar) countBar.textContent = `إجمالي: ${products.length} منتج`;

  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:60px;font-size:13px">🔍 لا توجد منتجات تطابق البحث</div>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const profit = p.sellPrice - p.costPrice;
    const pct = p.costPrice > 0 ? ((profit/p.costPrice)*100).toFixed(0) : 0;
    const stockPct = Math.min(100, (p.stock / Math.max(p.minStock*2,1))*100);
    const stockColor = p.stock===0 ? 'var(--danger)' : p.stock<=p.minStock ? 'var(--warning)' : 'var(--success)';
    const stockBadge = p.stock===0 ? 'badge-danger' : p.stock<=p.minStock ? 'badge-warning' : 'badge-success';
    const stockLabel = p.stock===0 ? '❌ نفد' : p.stock<=p.minStock ? '⚠️ منخفض' : '✅ متاح';
    return `
    <div class="product-card">
      <span class="product-emoji">${getEmoji(p.category)}</span>
      <div class="product-name">${p.name}</div>
      <div class="product-category">${p.category} · ${p.size}${p.color?' · '+p.color:''}</div>
      <div class="product-price-row">
        <span class="product-sell-price">${p.sellPrice.toLocaleString('ar-EG')} ج</span>
        <span class="product-cost-price">تكلفة: ${p.costPrice.toLocaleString('ar-EG')} ج</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:10px;color:var(--success);font-weight:600">ربح: +${pct}% (${profit.toLocaleString('ar-EG')} ج)</span>
        <span class="badge ${stockBadge}">${stockLabel}: ${p.stock}</span>
      </div>
      <div class="product-stock-bar"><div class="product-stock-fill" style="width:${stockPct}%;background:${stockColor}"></div></div>
      <div class="product-meta"><span>📦 ${p.stock} قطعة</span><span>🏷️ ${p.barcode||'#'+p.id}</span></div>
      <div class="product-actions">
        <button class="btn-edit" onclick="openProductModal(${p.id})">✏️ تعديل</button>
        <button class="btn-delete" onclick="deleteProduct(${p.id})">🗑️ حذف</button>
      </div>
    </div>`;
  }).join('');
}

function filterProducts() { renderProducts(); }

function calcProfitPreview() {
  const cost = parseFloat(document.getElementById('pCostPrice')?.value||0)||0;
  const sell = parseFloat(document.getElementById('pSellPrice')?.value||0)||0;
  const preview = document.getElementById('profitPreview');
  if (!preview) return;
  if (cost>0 && sell>0) {
    const profit = sell-cost;
    const pct = ((profit/cost)*100).toFixed(0);
    preview.style.display='flex';
    document.getElementById('profitPreviewValue').textContent = profit.toFixed(2) + ' ج';
    const pctEl = document.getElementById('profitPreviewPct');
    pctEl.textContent = pct + '%';
    pctEl.style.color = profit>=0 ? 'var(--success)' : 'var(--danger)';
  } else {
    preview.style.display='none';
  }
}

function generateBarcode() {
  // Category prefix map: each category has a unique 2-digit prefix
  const catPrefixes = {
    'قمصان':       '11',
    'تيشيرتات':    '22',
    'بناطيل':      '55',
    'جاكيتات':     '33',
    'ملابس داخلية':'44',
    'إكسسوارات':   '66',
    'أحذية':       '77',
  };
  const selectedCat = document.getElementById('pCategory')?.value || '';
  const prefix = catPrefixes[selectedCat] || '00';
  // Generate unique suffix using timestamp + random
  const suffix = Date.now().toString().slice(-6) + Math.floor(Math.random()*10);
  document.getElementById('pBarcode').value = prefix + suffix;
}


function openProductModal(productId=null) {
  editingProductId = productId;
  const title = document.getElementById('productModalTitle');
  const modal = document.getElementById('productModal');
  if (productId) {
    const p = store.products.find(p=>p.id===productId);
    if (!p) return;
    title.textContent = '✏️ تعديل المنتج';
    document.getElementById('pName').value = p.name;
    document.getElementById('pCategory').value = p.category;
    document.getElementById('pCostPrice').value = p.costPrice;
    document.getElementById('pSellPrice').value = p.sellPrice;
    document.getElementById('pSize').value = p.size;
    document.getElementById('pColor').value = p.color||'';
    document.getElementById('pStock').value = p.stock;
    document.getElementById('pMinStock').value = p.minStock;
    document.getElementById('pBarcode').value = p.barcode||'';
    document.getElementById('pDescription').value = p.description||'';
    calcProfitPreview();
  } else {
    title.textContent = '➕ إضافة منتج جديد';
    ['pName','pCostPrice','pSellPrice','pColor','pBarcode','pDescription'].forEach(fieldId=>{
      const el=document.getElementById(fieldId); if(el) el.value='';
    });
    document.getElementById('pCategory').value='قمصان';
    document.getElementById('pSize').value='M';
    document.getElementById('pStock').value='';
    document.getElementById('pMinStock').value='5';
    const pp = document.getElementById('profitPreview');
    if (pp) pp.style.display='none';
  }
  modal.classList.add('show');
  setTimeout(()=>document.getElementById('pName')?.focus(), 100);
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('show');
  editingProductId=null;
}

function saveProduct() {
  const name = document.getElementById('pName').value.trim();
  const category = document.getElementById('pCategory').value;
  const costPrice = parseFloat(document.getElementById('pCostPrice').value);
  const sellPrice = parseFloat(document.getElementById('pSellPrice').value);
  const size = document.getElementById('pSize').value;
  const color = document.getElementById('pColor').value.trim();
  const stock = parseInt(document.getElementById('pStock').value)||0;
  const minStock = parseInt(document.getElementById('pMinStock').value)||5;
  const barcode = document.getElementById('pBarcode').value.trim();
  const description = document.getElementById('pDescription').value.trim();

  if (!name||!category||isNaN(costPrice)||isNaN(sellPrice)) { showToast('⚠️ يرجى ملء الحقول الإلزامية (*)', 'error'); return; }
  if (sellPrice < costPrice) if (!confirm('سعر البيع أقل من سعر الشراء! هل تريد المتابعة؟')) return;

  const data = { name, category, costPrice, sellPrice, size, color, stock, minStock, description,
    barcode: barcode || `P${String(store.nextProductId).padStart(4,'0')}` };

  if (editingProductId) {
    const idx = store.products.findIndex(p=>p.id===editingProductId);
    if (idx!==-1) store.products[idx] = { ...store.products[idx], ...data };
    showToast('✅ تم تحديث المنتج بنجاح', 'success');
  } else {
    data.id = store.nextProductId++;
    store.products.push(data);
    showToast('✅ تم إضافة المنتج بنجاح', 'success');
  }
  saveData(); closeProductModal(); renderProducts(); renderInventory(); updateNavAlerts(); buildNotifications();
}

function deleteProduct(id) {
  const p = store.products.find(p=>p.id===id);
  if (!confirm(`هل تريد حذف "${p?.name}"؟`)) return;
  store.products = store.products.filter(p=>p.id!==id);
  saveData(); renderProducts(); renderInventory(); updateNavAlerts(); buildNotifications();
  showToast('🗑️ تم حذف المنتج', 'info');
}

// ==================== INVENTORY ====================
function renderInventory() {
  const total = store.products.reduce((a,p)=>a+p.stock,0);
  const low = store.products.filter(p=>p.stock>0&&p.stock<=p.minStock).length;
  const out = store.products.filter(p=>p.stock===0).length;
  const value = store.products.reduce((a,p)=>a+(p.costPrice*p.stock),0);

  const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  set('invTotal', total.toLocaleString('ar-EG'));
  set('invLow', low);
  set('invOut', out);
  set('invValue', value.toLocaleString('ar-EG') + ' ج');

  renderInventoryTable();
}

function renderInventoryTable() {
  const search = (document.getElementById('inventorySearch')?.value||'').toLowerCase();
  let products = store.products;
  if (inventoryFilter==='low') products = products.filter(p=>p.stock>0&&p.stock<=p.minStock);
  else if (inventoryFilter==='out') products = products.filter(p=>p.stock===0);
  else if (inventoryFilter==='ok') products = products.filter(p=>p.stock>p.minStock);
  if (search) products = products.filter(p=>p.name.toLowerCase().includes(search)||p.category.toLowerCase().includes(search));

  const tbody = document.getElementById('inventoryBody');
  if (!tbody) return;
  tbody.innerHTML = products.map(p => {
    const status = p.stock===0 ? ['badge-danger','❌ نفد'] : p.stock<=p.minStock ? ['badge-warning','⚠️ منخفض'] : ['badge-success','✅ متاح'];
    const inv = (p.costPrice * p.stock).toLocaleString('ar-EG');
    return `<tr>
      <td><strong>${getEmoji(p.category)} ${p.name}</strong></td>
      <td><span class="badge badge-primary">${p.category}</span></td>
      <td>${p.size}</td>
      <td>${p.color||'—'}</td>
      <td style="font-size:16px;font-weight:800;${p.stock===0?'color:var(--danger)':p.stock<=p.minStock?'color:var(--warning)':'color:var(--success)'}">${p.stock}</td>
      <td>${p.minStock}</td>
      <td style="font-weight:600">${inv} ج</td>
      <td><span class="badge ${status[0]}">${status[1]}</span></td>
      <td>
        <button class="btn-icon" onclick="openRestockModal(${p.id})" title="إعادة تعبئة">📥</button>
        <button class="btn-icon" onclick="openProductModal(${p.id})" title="تعديل">✏️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد منتجات</td></tr>';
}

function filterInventory(type, btn) {
  inventoryFilter = type;
  document.querySelectorAll('#page-inventory .filter-tab').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderInventoryTable();
}
function filterInventorySearch() { renderInventoryTable(); }

function openRestockModal(id) {
  restockProductId = id;
  const p = store.products.find(p=>p.id===id);
  if (!p) return;
  document.getElementById('restockProductName').textContent = `📦 ${p.name} — المخزون الحالي: ${p.stock} قطعة`;
  document.getElementById('restockQty').value='';
  document.getElementById('restockModal').classList.add('show');
  setTimeout(()=>document.getElementById('restockQty')?.focus(),100);
}
function closeRestockModal() { document.getElementById('restockModal').classList.remove('show'); restockProductId=null; }
function setRestockQty(n) { document.getElementById('restockQty').value=n; }
function confirmRestock() {
  const qty = parseInt(document.getElementById('restockQty').value)||0;
  if (qty<=0) { showToast('أدخل كمية صحيحة', 'error'); return; }
  const p = store.products.find(p=>p.id===restockProductId);
  if (p) { p.stock+=qty; saveData(); renderInventory(); closeRestockModal(); updateNavAlerts(); buildNotifications(); showToast(`✅ تمت إضافة ${qty} قطعة لـ ${p.name}`, 'success'); }
}

// ==================== SALES ====================
function renderSales() {
  const today = new Date().toISOString().split('T')[0];
  const fromEl = document.getElementById('salesDateFrom');
  const toEl = document.getElementById('salesDateTo');
  if (fromEl && !fromEl.value) {
    const d = new Date(); d.setDate(d.getDate()-30);
    fromEl.value = d.toISOString().split('T')[0];
    if (toEl) toEl.value = today;
  }

  let sales = [...store.sales].reverse();
  if (salesFilter) sales = sales.filter(s=>s.date>=salesFilter.from && s.date<=salesFilter.to && (!salesFilter.pay||s.paymentMethod===salesFilter.pay));

  const total  = sales.reduce((a,s)=>a+s.total,0);
  const avg    = sales.length ? total/sales.length : 0;
  const cash   = sales.filter(s=>s.paymentMethod==='cash').reduce((a,s)=>a+s.total,0);
  const card   = sales.filter(s=>s.paymentMethod!=='cash').reduce((a,s)=>a+s.total,0);

  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set('salesTotalCount', sales.length.toLocaleString('ar-EG'));
  set('salesTotalAmount', total.toLocaleString('ar-EG') + ' ج');
  set('salesAvgAmount', avg.toFixed(2) + ' ج');
  set('salesCashTotal', cash.toLocaleString('ar-EG') + ' ج');
  set('salesCardTotal', card.toLocaleString('ar-EG') + ' ج');

  const tbody = document.getElementById('salesBody');
  if (!tbody) return;
  tbody.innerHTML = sales.map(s=>`
    <tr>
      <td><span class="badge badge-primary">#${s.id}</span></td>
      <td style="font-size:12px">${s.date}</td>
      <td style="font-size:12px">${s.time}</td>
      <td style="font-size:12px">${s.customerName}</td>
      <td style="font-size:11px;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${s.items.map(i=>`${i.name} ×${i.qty}`).join(', ')}
      </td>
      <td>${s.discount>0?'<span class="badge badge-warning">'+s.discount.toFixed(0)+' ج</span>':'—'}</td>
      <td style="font-weight:800;color:var(--primary-light)">${s.total.toFixed(2)} ج</td>
      <td><span class="badge ${getPayBadge(s.paymentMethod)}">${getPayLabel(s.paymentMethod, s.paymentSplit)}</span></td>
      <td>
        <button class="btn-icon" onclick="viewInvoice(${s.id})" title="عرض">👁️</button>
        <button class="btn-icon" onclick="printInvoiceById(${s.id})" title="طباعة">🖨️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد مبيعات</td></tr>';
}

function filterSalesByDate() {
  const from = document.getElementById('salesDateFrom')?.value;
  const to   = document.getElementById('salesDateTo')?.value;
  const pay  = document.getElementById('salesPayFilter')?.value;
  if (!from||!to) { showToast('حدد التاريخ أولاً', 'error'); return; }
  salesFilter = { from, to, pay };
  renderSales();
}

function resetSalesFilter() {
  salesFilter=null;
  const today=new Date().toISOString().split('T')[0];
  const d=new Date(); d.setDate(d.getDate()-30);
  const fromEl=document.getElementById('salesDateFrom');
  const toEl=document.getElementById('salesDateTo');
  const payEl=document.getElementById('salesPayFilter');
  if(fromEl) fromEl.value=d.toISOString().split('T')[0];
  if(toEl) toEl.value=today;
  if(payEl) payEl.value='';
  renderSales();
}

function viewInvoice(saleId) {
  const sale = store.sales.find(s=>s.id===saleId);
  if (!sale) return;
  currentInvoice=sale;
  const settings=store.settings;
  const body=document.getElementById('invoiceBody');
  if (!body) return;
  body.innerHTML=`
    <div class="invoice-view">
      <div class="inv-header">
        <h2>${settings.invoiceHeader}</h2>
        <p>${settings.storeAddress} | ${settings.storePhone}</p>
      </div>
      <div class="inv-info">
        <div class="inv-info-item"><strong>الفاتورة: </strong><span>#${sale.id}</span></div>
        <div class="inv-info-item"><strong>التاريخ: </strong><span>${sale.date}</span></div>
        <div class="inv-info-item"><strong>الوقت: </strong><span>${sale.time}</span></div>
        <div class="inv-info-item"><strong>العميل: </strong><span>${sale.customerName}</span></div>
        <div class="inv-info-item"><strong>الدفع: </strong><span>${getPayLabel(sale.paymentMethod, sale.paymentSplit)}</span></div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
        <tbody>${sale.items.map(i=>`<tr><td>${i.name}</td><td>${i.price.toFixed(2)} ج</td><td>${i.qty}</td><td>${i.subtotal.toFixed(2)} ج</td></tr>`).join('')}</tbody>
      </table>
      <div class="inv-total-section">
        <div class="inv-total-row"><span>المجموع الفرعي:</span><span>${sale.subtotal.toFixed(2)} ج</span></div>
        ${sale.discount>0?`<div class="inv-total-row"><span>الخصم:</span><span>- ${sale.discount.toFixed(2)} ج</span></div>`:''}
        <div class="inv-total-row inv-grand-total"><span>الإجمالي:</span><span>${sale.total.toFixed(2)} ج</span></div>
      </div>
      <div class="inv-footer">${settings.invoiceFooter}</div>
    </div>`;
  document.getElementById('invoiceModal').classList.add('show');
}

function closeInvoiceModal() { document.getElementById('invoiceModal').classList.remove('show'); currentInvoice=null; }
function printInvoice() { if(currentInvoice) printInvoiceById(currentInvoice.id); }

function printInvoiceById(saleId) {
  const sale = store.sales.find(s=>s.id===saleId);
  if (!sale) return;
  const s = store.settings;
  // Build QR data string
  const payInfo = getPayLabel(sale.paymentMethod, sale.paymentSplit);
  const qrData = encodeURIComponent(`فاتورة:${sale.id}|تاريخ:${sale.date}|إجمالي:${sale.total.toFixed(2)}|عميل:${sale.customerName}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${qrData}&color=000000`;
  // Build split payment rows for print
  let payRows = '';
  if (sale.paymentSplit && Object.keys(sale.paymentSplit).length > 1) {
    const payNames = { cash:'نقدي', card:'بطاقة', wallet:'محفظة', instapay:'انستا باي', credit:'آجل' };
    payRows = Object.entries(sale.paymentSplit).map(([m,v])=>`<div class="tr"><span>${payNames[m]||m}:</span><span>${v.toFixed(2)} ج</span></div>`).join('');
  }
  const win = window.open('','_blank','width=420,height=720');
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة #${sale.id}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:20px;direction:rtl;color:#000}
    .h{text-align:center;border-bottom:2px dashed #333;padding-bottom:12px;margin-bottom:16px}
    .h h2{font-size:18px;margin-bottom:4px}.h p{font-size:11px;color:#555}
    .info{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:14px;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}
    th,td{padding:7px 6px;text-align:right;border-bottom:1px solid #ddd;font-size:12px}
    th{font-weight:bold;background:#f0f0f0}
    .tot{border-top:2px dashed #333;padding-top:10px}
    .tr{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
    .grand{font-size:16px;font-weight:bold;border-top:1px solid #333;padding-top:7px;margin-top:5px}
    .foot{text-align:center;margin-top:16px;font-style:italic;color:#777;border-top:1px dashed #ccc;padding-top:10px;font-size:11px}
    .qr-section{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px dashed #ccc}
    .qr-label{font-size:9px;color:#777;text-align:center;margin-top:4px}
    .qr-info{font-size:10px;color:#555;line-height:1.6}
    .pay-split-block{background:#f7f7f7;border:1px solid #ddd;border-radius:6px;padding:8px;margin-top:6px;font-size:11px}
  </style></head><body>
  <div class="h"><h2>${s.invoiceHeader}</h2><p>${s.storeAddress} | ${s.storePhone}</p></div>
  <div class="info">
    <div><strong>فاتورة:</strong> #${sale.id}</div><div><strong>التاريخ:</strong> ${sale.date}</div>
    <div><strong>الوقت:</strong> ${sale.time}</div><div><strong>العميل:</strong> ${sale.customerName}</div>
    <div style="grid-column:1/-1"><strong>الدفع:</strong> ${payInfo}</div>
  </div>
  <table><thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
  <tbody>${sale.items.map(i=>`<tr><td>${i.name}</td><td>${i.price.toFixed(2)}</td><td>${i.qty}</td><td>${i.subtotal.toFixed(2)} ج</td></tr>`).join('')}</tbody></table>
  <div class="tot">
    <div class="tr"><span>المجموع الفرعي:</span><span>${sale.subtotal.toFixed(2)} ج</span></div>
    ${sale.discount>0?`<div class="tr"><span>الخصم:</span><span>- ${sale.discount.toFixed(2)} ج</span></div>`:''}
    <div class="tr grand"><span>الإجمالي:</span><span>${sale.total.toFixed(2)} ج</span></div>
    ${payRows ? `<div class="pay-split-block"><strong>توزيع الدفع:</strong>${payRows}</div>` : ''}
  </div>
  <div class="qr-section">
    <div>
      <img src="${qrUrl}" width="90" height="90" alt="QR Code" />
      <div class="qr-label">امسح للتحقق</div>
    </div>
    <div class="qr-info">
      <div>✅ فاتورة رقم: #${sale.id}</div>
      <div>📅 ${sale.date} - ${sale.time}</div>
      <div>💰 الإجمالي: ${sale.total.toFixed(2)} ج</div>
    </div>
  </div>
  <div class="foot">${s.invoiceFooter}</div>
  </body></html>`);
  win.document.close(); win.focus();
  setTimeout(()=>win.print(), 500);
}

function exportSales() {
  const sales = [...store.sales].reverse();
  const csv = ['\uFEFFرقم الفاتورة,التاريخ,الوقت,العميل,المنتجات,الخصم,الإجمالي,طريقة الدفع',
    ...sales.map(s=>`${s.id},${s.date},${s.time},"${s.customerName}","${s.items.map(i=>i.name+'×'+i.qty).join(' | ')}",${s.discount},${s.total},"${getPayLabel(s.paymentMethod, s.paymentSplit)}"`)
  ].join('\n');
  downloadFile(csv, `مبيعات_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
  showToast('✅ تم تصدير المبيعات', 'success');
}

// ==================== CUSTOMERS ====================
function renderCustomers() {
  const search = (document.getElementById('customersSearch')?.value||'').toLowerCase();
  const debtorOnly = document.getElementById('debtorOnlyFilter')?.checked;
  let filtered = store.customers.filter(c=>!search||c.name.toLowerCase().includes(search)||(c.phone||'').includes(search));
  if (debtorOnly) filtered = filtered.filter(c=>(c.debt||0)>0);
  const grid = document.getElementById('customersGrid');
  if (!grid) return;
  if (!filtered.length) { grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:60px;font-size:13px">👥 لا يوجد عملاء</div>'; return; }
  grid.innerHTML = filtered.map(c=>`
    <div class="customer-card">
      <div class="customer-avatar-large">${c.name.charAt(0)}</div>
      <div class="customer-name">${c.name}</div>
      <div class="customer-phone">📱 ${c.phone||'لا يوجد رقم'}</div>
      ${c.address?`<div style="font-size:10px;color:var(--text-muted);margin-bottom:10px">📍 ${c.address}</div>`:''}
      ${c.notes?`<div style="font-size:10px;color:var(--text-secondary);background:var(--bg-input);padding:5px 8px;border-radius:6px;margin-bottom:10px">📝 ${c.notes}</div>`:''}
      <div style="font-size:11px; font-weight:bold; color:${(c.debt||0)>0?'var(--danger)':'var(--success)'}; margin-bottom:8px;">
        💳 مديونية: ${(c.debt||0).toLocaleString('ar-EG')} ج
      </div>
      ${(c.debt||0)>0?`<button class="btn-success" onclick="openPayDebtModal(${c.id})" style="padding:5px 10px; font-size:11px; font-weight:bold; width:100%; margin-bottom:4px; border-radius:6px; border:none; cursor:pointer;" type="button">💵 سداد الدين</button>`:''}
      <button class="btn-secondary" onclick="openDebtStatementModal(${c.id})" style="padding:5px 10px; font-size:11px; width:100%; margin-bottom:8px; border-radius:6px; cursor:pointer;font-family:inherit;" type="button">📋 كشف الحساب</button>
      <div class="customer-stats">
        <div class="customer-stat"><div class="customer-stat-value">${c.visitCount||0}</div><div class="customer-stat-label">زيارة</div></div>
        <div class="customer-stat"><div class="customer-stat-value">${(c.totalPurchases||0).toLocaleString('ar-EG')}</div><div class="customer-stat-label">إجمالي ج</div></div>
      </div>
      <div class="customer-actions">
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:6px">
          <button class="btn-whatsapp-sm" onclick="sendCustomerWhatsApp(${c.id})" title="إرسال رسالة واتساب">📲 واتساب</button>
          ${(c.debt||0)>0 ? `<button class="btn-whatsapp-sm" onclick="sendDebtReminderWhatsApp(${c.id})" title="تذكير المديونية" style="background:rgba(255,79,100,0.15);border-color:var(--danger);color:var(--danger)">💳 تذكير</button>` : ''}
        </div>
        <button class="btn-edit" onclick="openCustomerModal(${c.id})">✏️ تعديل</button>
        <button class="btn-delete" onclick="deleteCustomer(${c.id})">🗑️ حذف</button>
      </div>
    </div>`).join('');
}

function filterCustomers() { renderCustomers(); }

function openCustomerModal(id=null) {
  editingCustomerId=id;
  const title=document.getElementById('customerModalTitle');
  if (id) {
    const c=store.customers.find(c=>c.id===id); if(!c) return;
    title.textContent='✏️ تعديل بيانات العميل';
    document.getElementById('cName').value=c.name;
    document.getElementById('cPhone').value=c.phone||'';
    document.getElementById('cAddress').value=c.address||'';
    document.getElementById('cNotes').value=c.notes||'';
  } else {
    title.textContent='➕ إضافة عميل جديد';
    ['cName','cPhone','cAddress','cNotes'].forEach(fieldId=>{ const el=document.getElementById(fieldId); if(el) el.value=''; });
  }
  document.getElementById('customerModal').classList.add('show');
  setTimeout(()=>document.getElementById('cName')?.focus(),100);
}

function closeCustomerModal() { document.getElementById('customerModal').classList.remove('show'); editingCustomerId=null; }

function saveCustomer() {
  const name=document.getElementById('cName').value.trim();
  const phone=document.getElementById('cPhone').value.trim();
  const address=document.getElementById('cAddress').value.trim();
  const notes=document.getElementById('cNotes').value.trim();
  if (!name) { showToast('أدخل اسم العميل', 'error'); return; }
  if (editingCustomerId) {
    const idx=store.customers.findIndex(c=>c.id===editingCustomerId);
    if(idx!==-1) store.customers[idx]={...store.customers[idx],name,phone,address,notes};
    showToast('✅ تم تحديث بيانات العميل','success');
  } else {
    store.customers.push({ id:store.nextCustomerId++, name, phone, address, notes, totalPurchases:0, visitCount:0 });
    showToast('✅ تم إضافة العميل','success');
  }
  saveData(); closeCustomerModal(); renderCustomers(); updateCustomerDropdown();
}

function deleteCustomer(id) {
  const c=store.customers.find(c=>c.id===id);
  if (!confirm(`هل تريد حذف العميل "${c?.name}"؟`)) return;
  store.customers=store.customers.filter(c=>c.id!==id);
  saveData(); renderCustomers(); updateCustomerDropdown();
  showToast('🗑️ تم حذف العميل','info');
}

// ==================== REPORTS ====================
let reportPeriodFilter = 'week';
let reportCustomFrom = null;
let reportCustomTo   = null;
// reportWarehouseFilter already declared globally at top of file

function setReportPeriod(period, btn) {
  reportPeriod = period;
  reportPeriodFilter = period;
  document.querySelectorAll('.report-period-btns .filter-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const customRange = document.getElementById('reportCustomDateRange');
  if (customRange) customRange.style.display = period === 'custom' ? 'flex' : 'none';

  if (period === 'custom') {
    const today = new Date().toISOString().split('T')[0];
    const fromEl = document.getElementById('reportDateFrom');
    const toEl   = document.getElementById('reportDateTo');
    if (fromEl && !fromEl.value) {
      const m = new Date(); m.setDate(m.getDate() - 30);
      fromEl.value = m.toISOString().split('T')[0];
    }
    if (toEl && !toEl.value) toEl.value = today;
    reportCustomFrom = document.getElementById('reportDateFrom')?.value || null;
    reportCustomTo   = document.getElementById('reportDateTo')?.value || null;
  } else {
    reportCustomFrom = null;
    reportCustomTo   = null;
  }

  updateActiveFilterBadge();
  renderReports();
  renderMonthlyChart();
}

function applyCustomDateRange() {
  reportCustomFrom = document.getElementById('reportDateFrom')?.value || null;
  reportCustomTo   = document.getElementById('reportDateTo')?.value || null;
  updateActiveFilterBadge();
  renderReports();
  renderMonthlyChart();
}

function updateActiveFilterBadge() {
  const badge = document.getElementById('activeFilterBadge');
  if (!badge) return;
  const labels = { week:'أسبوع', month:'شهر', year:'سنة', all:'الكل', custom:'مخصص' };
  let text = '📅 ' + (labels[reportPeriodFilter] || reportPeriodFilter);
  if (reportPeriodFilter === 'custom' && reportCustomFrom && reportCustomTo) {
    text = `📅 ${reportCustomFrom} ← ${reportCustomTo}`;
  }
  const whLabel = reportWarehouseFilter === 'all' ? '' :
    (' · 🏪 ' + (store.warehouses?.find(w => w.id === reportWarehouseFilter)?.name || ''));
  badge.textContent = text + whLabel;
  badge.style.display = 'inline-flex';
}

function setReportWarehouse(whId, sel) {
  reportWarehouseFilter = whId === 'all' ? 'all' : parseInt(whId);
  updateActiveFilterBadge();
  renderReports();
  renderMonthlyChart();
}

function getFilteredSales() {
  let sales = store.sales;
  // Custom date range
  if (reportPeriodFilter === 'custom' && reportCustomFrom && reportCustomTo) {
    const from = new Date(reportCustomFrom);
    const to   = new Date(reportCustomTo); to.setHours(23,59,59);
    sales = sales.filter(s => { const d = new Date(s.date); return d >= from && d <= to; });
  } else if (reportPeriodFilter !== 'all') {
    const today = new Date();
    sales = sales.filter(s => {
      const d = new Date(s.date);
      if (reportPeriodFilter === 'week')  { const w = new Date(today); w.setDate(w.getDate()-7);  return d >= w; }
      if (reportPeriodFilter === 'month') { const m = new Date(today); m.setDate(m.getDate()-30); return d >= m; }
      if (reportPeriodFilter === 'year')  { const y = new Date(today); y.setFullYear(y.getFullYear()-1); return d >= y; }
      return true;
    });
  }
  // Warehouse filter
  if (reportWarehouseFilter !== 'all') {
    sales = sales.filter(s => s.warehouseId === reportWarehouseFilter);
  }
  return sales;
}

function getFilteredExpenses() {
  let expenses = store.expenses || [];
  // Custom date range
  if (reportPeriodFilter === 'custom' && reportCustomFrom && reportCustomTo) {
    const from = new Date(reportCustomFrom);
    const to   = new Date(reportCustomTo); to.setHours(23,59,59);
    expenses = expenses.filter(e => { const d = new Date(e.date); return d >= from && d <= to; });
  } else if (reportPeriodFilter !== 'all') {
    const today = new Date();
    expenses = expenses.filter(e => {
      const d = new Date(e.date);
      if (reportPeriodFilter === 'week')  { const w = new Date(today); w.setDate(w.getDate()-7);  return d >= w; }
      if (reportPeriodFilter === 'month') { const m = new Date(today); m.setDate(m.getDate()-30); return d >= m; }
      if (reportPeriodFilter === 'year')  { const y = new Date(today); y.setFullYear(y.getFullYear()-1); return d >= y; }
      return true;
    });
  }
  // Warehouse filter: include branch expenses + shared (no warehouseId)
  if (reportWarehouseFilter !== 'all') {
    expenses = expenses.filter(e => !e.warehouseId || e.warehouseId === reportWarehouseFilter);
  }
  return expenses;
}

function renderReports() {
  // Populate warehouse filter dropdown if present
  const whSel = document.getElementById('reportWarehouseSelect');
  if (whSel && whSel.options.length <= 1) {
    store.warehouses.forEach(wh => {
      const opt = document.createElement('option');
      opt.value = wh.id; opt.textContent = wh.name;
      whSel.appendChild(opt);
    });
  }

  const sales = getFilteredSales();
  const whLabel = reportWarehouseFilter === 'all' ? 'جميع الفروع' :
    (store.warehouses.find(w => w.id === reportWarehouseFilter)?.name || '');

  // Top Products
  const pSales={};
  sales.forEach(s=>s.items.forEach(item=>{
    if(!pSales[item.productId]) pSales[item.productId]={name:item.name,qty:0,revenue:0};
    pSales[item.productId].qty+=item.qty; pSales[item.productId].revenue+=item.subtotal;
  }));
  const topProds=Object.values(pSales).sort((a,b)=>b.revenue-a.revenue).slice(0,5);
  const topProdsEl=document.getElementById('topProductsList');
  if(topProdsEl) topProdsEl.innerHTML=topProds.length
    ? topProds.map((p,i)=>`<div class="top-item"><div class="top-item-rank" style="${i===0?'background:rgba(255,215,0,0.2);color:gold':''}">  ${i+1}</div><div class="top-item-info"><div class="top-item-name">${p.name}</div><div class="top-item-sub">${p.qty} قطعة مباعة</div></div><div class="top-item-value">${p.revenue.toLocaleString('ar-EG')} ج</div></div>`).join('')
    : '<div style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</div>';

  // Profit Summary
  const rev=sales.reduce((a,s)=>a+s.total,0);
  const discounts=sales.reduce((a,s)=>a+s.discount,0);
  const grossRev=rev+discounts;
  const netSales=rev;
  const cogs=sales.reduce((a,s)=>a+s.items.reduce((b,item)=>{ const p=store.products.find(p=>p.id===item.productId); return b+(p?p.costPrice*item.qty:0); },0),0);
  const grossProfit=netSales-cogs;
  const filteredExp = getFilteredExpenses();
  const totalExp = filteredExp.reduce((a,e)=>a+e.amount,0);
  const netProfit = grossProfit - totalExp;
  const invVal=store.products.reduce((a,p)=>a+(p.costPrice*p.stock),0);

  const profitEl=document.getElementById('profitSummary');
  if(profitEl) {
    const branchBadge = reportWarehouseFilter !== 'all'
      ? `<div style="text-align:center;margin-bottom:10px;"><span style="background:rgba(124,110,245,0.15);color:var(--primary-light);padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;">🏪 ${whLabel}</span></div>`
      : '';
    profitEl.innerHTML=`
      ${branchBadge}
      <div class="pnl-table" style="width:100%; display:flex; flex-direction:column; gap:8px;">
        <div class="profit-row"><span class="profit-label">إجمالي المبيعات</span><span class="profit-value green">${grossRev.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row"><span class="profit-label">الخصومات الممنوحة (-)</span><span class="profit-value red">${discounts.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row" style="border-bottom:1px solid var(--border);padding-bottom:6px;"><span class="profit-label" style="font-weight:700;">صافي إيرادات المبيعات</span><span class="profit-value green" style="font-weight:700;">${netSales.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row"><span class="profit-label">تكلفة البضاعة المباعة (COGS) (-)</span><span class="profit-value red">${cogs.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row" style="border-bottom:1px solid var(--border);padding-bottom:6px;"><span class="profit-label" style="font-weight:700;">إجمالي ربح النشاط</span><span class="profit-value ${grossProfit>=0?'green':'red'}" style="font-weight:700;">${grossProfit.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row"><span class="profit-label">المصروفات${reportWarehouseFilter!=='all'?' (الفرع + مشتركة)':''} (-)</span><span class="profit-value red">${totalExp.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row" style="background:rgba(124,110,245,0.08);padding:8px;border-radius:6px;border:1px solid rgba(124,110,245,0.2);"><span class="profit-label" style="font-weight:800;font-size:13px;">صافي الأرباح والخسائر النهائي</span><span class="profit-value ${netProfit>=0?'green':'red'}" style="font-weight:800;font-size:14px;">${netProfit.toLocaleString('ar-EG')} ج</span></div>
        <div class="profit-row"><span class="profit-label">هامش صافي الربح</span><span class="profit-value ${netProfit>=0?'green':'red'}">${netSales>0?((netProfit/netSales)*100).toFixed(1):0}%</span></div>
        <div class="profit-row" style="margin-top:6px;"><span class="profit-label">قيمة المخزون الحالي بسعر التكلفة</span><span class="profit-value" style="color:var(--text-primary);font-weight:700;">${invVal.toLocaleString('ar-EG')} ج</span></div>
      </div>
    `;
  }

  // Top Customers
  const topCust=[...store.customers].sort((a,b)=>(b.totalPurchases||0)-(a.totalPurchases||0)).slice(0,5);
  const topCustEl=document.getElementById('topCustomersList');
  if(topCustEl) topCustEl.innerHTML=topCust.filter(c=>c.totalPurchases>0).length
    ? topCust.filter(c=>c.totalPurchases>0).map((c,i)=>`<div class="top-item"><div class="top-item-rank" style="${i===0?'background:rgba(255,215,0,0.2);color:gold':''}">${i+1}</div><div class="top-item-info"><div class="top-item-name">${c.name}</div><div class="top-item-sub">${c.visitCount||0} زيارة</div></div><div class="top-item-value">${(c.totalPurchases||0).toLocaleString('ar-EG')} ج</div></div>`).join('')
    : '<div style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</div>';

  // Category Breakdown
  const catTotals={};
  sales.forEach(s=>s.items.forEach(item=>{
    const p=store.products.find(p=>p.id===item.productId);
    const cat=p?p.category:'أخرى';
    catTotals[cat]=(catTotals[cat]||0)+item.subtotal;
  }));
  const catMax=Math.max(...Object.values(catTotals),1);
  const catBreakEl=document.getElementById('categoryBreakdown');
  if(catBreakEl) catBreakEl.innerHTML=Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat,val],i)=>`
    <div class="category-breakdown-item">
      <span class="cat-break-name">${getEmoji(cat)} ${cat}</span>
      <div class="cat-break-bar-wrap"><div class="cat-break-bar" style="width:${(val/catMax*100).toFixed(0)}%;background:${CHART_COLORS[i%CHART_COLORS.length]}"></div></div>
      <span class="cat-break-value">${val.toLocaleString('ar-EG')} ج</span>
    </div>`).join('') || '<div style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</div>';
}

function printReport() {
  window.print();
}

// ==================== SETTINGS ====================
function loadSettings() {
  const s=store.settings;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v||''; };
  set('storeNameInput', s.storeName);
  set('storeAddressInput', s.storeAddress);
  set('storePhoneInput', s.storePhone);
  set('storeEmailInput', s.storeEmail);
  set('invoiceHeader', s.invoiceHeader);
  set('invoiceFooter', s.invoiceFooter);
  set('storeVatNumber', s.vatNumber);
  set('storeLegalName', s.legalName);
  const cur=document.getElementById('storeCurrency');
  if(cur) cur.value=s.currency||'ج';
  renderSystemStats();
}

function saveSettings() {
  store.settings.storeName     = document.getElementById('storeNameInput')?.value||'';
  store.settings.storeAddress  = document.getElementById('storeAddressInput')?.value||'';
  store.settings.storePhone    = document.getElementById('storePhoneInput')?.value||'';
  store.settings.storeEmail    = document.getElementById('storeEmailInput')?.value||'';
  store.settings.invoiceHeader = document.getElementById('invoiceHeader')?.value||'';
  store.settings.invoiceFooter = document.getElementById('invoiceFooter')?.value||'';
  store.settings.currency      = document.getElementById('storeCurrency')?.value||'ج';
  store.settings.vatNumber     = document.getElementById('storeVatNumber')?.value||'';
  store.settings.legalName     = document.getElementById('storeLegalName')?.value||'';
  saveData();
  updateSidebarTicker();
  showToast('✅ تم حفظ الإعدادات', 'success');
}

// ==================== ZATCA QR (TLV Base64) ====================
function generateZatcaQR(sale) {
  const s = store.settings;
  const sellerName  = s.legalName  || s.storeName || 'أحمد ستور';
  const vatNum      = s.vatNumber  || '300000000000003';
  const timestamp   = (sale.date || new Date().toISOString().split('T')[0]) + 'T' + (sale.time ? sale.time.replace(' ','T') : '00:00:00') + 'Z';
  const totalInclVat = (sale.total || 0).toFixed(2);
  // VAT amount = total * 15% / 115% (assuming price includes VAT at 15%)
  const vatAmount   = ((sale.total || 0) * 15 / 115).toFixed(2);

  function tlv(tag, value) {
    const encoded = new TextEncoder().encode(value);
    const tagBuf  = new Uint8Array([tag]);
    const lenBuf  = new Uint8Array([encoded.length]);
    const result  = new Uint8Array(tagBuf.length + lenBuf.length + encoded.length);
    result.set(tagBuf, 0);
    result.set(lenBuf, tagBuf.length);
    result.set(encoded, tagBuf.length + lenBuf.length);
    return result;
  }

  const t1 = tlv(1, sellerName);
  const t2 = tlv(2, vatNum);
  const t3 = tlv(3, timestamp);
  const t4 = tlv(4, totalInclVat);
  const t5 = tlv(5, vatAmount);

  const combined = new Uint8Array(t1.length + t2.length + t3.length + t4.length + t5.length);
  let offset = 0;
  [t1, t2, t3, t4, t5].forEach(t => { combined.set(t, offset); offset += t.length; });

  let binary = '';
  combined.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
}

function previewInvoice() {
  if (store.sales.length > 0) viewInvoice(store.sales[store.sales.length-1].id);
  else showToast('لا توجد فواتير للمعاينة', 'info');
}

function renderSystemStats() {
  const el=document.getElementById('systemStats');
  if(!el) return;
  const dbSize = Math.round(JSON.stringify(store).length / 1024);
  el.innerHTML=`
    <div class="system-stat-row"><span class="system-stat-label">عدد المنتجات</span><span class="system-stat-value">${store.products.length}</span></div>
    <div class="system-stat-row"><span class="system-stat-label">عدد الفواتير</span><span class="system-stat-value">${store.sales.length}</span></div>
    <div class="system-stat-row"><span class="system-stat-label">عدد العملاء</span><span class="system-stat-value">${store.customers.length}</span></div>
    <div class="system-stat-row"><span class="system-stat-label">حجم البيانات</span><span class="system-stat-value">~${dbSize} KB</span></div>
    <div class="system-stat-row"><span class="system-stat-label">إصدار النظام</span><span class="system-stat-value">v2.0</span></div>`;
}

function exportData() {
  const json=JSON.stringify(store, null, 2);
  downloadFile(json, `ahmed_store_backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  showToast('✅ تم تصدير البيانات', 'success');
}

function importData(e) {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try {
      const data=JSON.parse(ev.target.result);
      if (confirm('سيتم استبدال جميع البيانات الحالية. هل تريد المتابعة؟')) {
        store={...store,...data}; saveData(); location.reload();
      }
    } catch { showToast('❌ ملف غير صالح', 'error'); }
  };
  reader.readAsText(file);
}

function confirmReset() {
  if (!confirm('⚠️ سيتم حذف جميع البيانات نهائياً. هل أنت متأكد تماماً؟')) return;
  if (!confirm('تأكيد أخير: حذف كل البيانات؟')) return;
  localStorage.removeItem('ahmedStore_v2');
  location.reload();
}

// ==================== HELPERS ====================
function getEmoji(cat) { return CAT_EMOJI[cat]||CAT_EMOJI.default; }

function getPayBadge(m) {
  const badges = {
    cash:      'badge-success',
    card:      'badge-info',
    wallet:    'badge-info',
    instapay:  'badge-warning',
    credit:    'badge-danger',
    transfer:  'badge-warning',
    mixed:     'badge-primary'
  };
  return badges[m] || 'badge-info';
}
function getPayLabel(m, split) {
  const labels = { cash:'💵 نقدي', card:'💳 بطاقة', wallet:'📱 محفظة', instapay:'⚡ انستا باي', credit:'📝 آجل', transfer:'📱 تحويل', mixed:'🔀 متعدد' };
  if (m === 'mixed' && split && typeof split === 'object') {
    return Object.entries(split).map(([k,v])=>`${labels[k]||k}: ${v.toFixed(2)} ج`).join(' + ');
  }
  return labels[m] || m;
}

function downloadFile(content, filename, type) {
  const blob=new Blob([content],{type});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  URL.revokeObjectURL(a.href);
}

// ==================== EXPENSES ====================
const EXPENSE_CATS = ['إيجار','كهرباء','مياه','رواتب','صيانة','شحن','تسويق','مشتريات متنوعة','أخرى'];

function renderExpenses() {
  const tbody = document.getElementById('expensesBody');
  const totalEl = document.getElementById('expensesTotalAmount');
  const countEl = document.getElementById('expensesTotalCount');
  if (!tbody) return;

  const monthFilter = document.getElementById('expensesMonthFilter')?.value || '';
  const catFilter   = document.getElementById('expensesCatFilter')?.value || '';
  const whFilter    = document.getElementById('expensesWhFilter')?.value || '';

  let list = [...(store.expenses || [])].reverse();
  if (monthFilter) list = list.filter(e => e.date && e.date.startsWith(monthFilter));
  if (catFilter)   list = list.filter(e => e.category === catFilter);
  if (whFilter)    list = list.filter(e => String(e.warehouseId||'shared') === whFilter);

  const total = list.reduce((a,e) => a+e.amount, 0);
  if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج';
  if (countEl) countEl.textContent = list.length;

  // Category breakdown
  const catBreak = {};
  list.forEach(e => { catBreak[e.category] = (catBreak[e.category]||0) + e.amount; });
  const breakEl = document.getElementById('expensesCatBreak');
  if (breakEl) {
    const maxVal = Math.max(...Object.values(catBreak), 1);
    breakEl.innerHTML = Object.entries(catBreak).sort((a,b)=>b[1]-a[1]).map(([cat,val]) => `
      <div class="exp-break-item">
        <span class="exp-break-cat">${cat}</span>
        <div class="exp-break-bar-wrap"><div class="exp-break-bar" style="width:${(val/maxVal*100).toFixed(0)}%"></div></div>
        <span class="exp-break-val">${val.toLocaleString('ar-EG')} ج</span>
      </div>`).join('') || '<div style="color:var(--text-muted);text-align:center;padding:20px">لا توجد بيانات</div>';
  }

  tbody.innerHTML = list.map(e => {
    const whName = e.warehouseId
      ? (store.warehouses.find(w=>w.id===e.warehouseId)?.name || 'فرع')
      : '🔗 مشترك';
    return `
    <tr>
      <td><span class="badge badge-primary">#${e.id}</span></td>
      <td style="font-size:12px">${e.date}</td>
      <td><span class="badge badge-warning">${e.category}</span></td>
      <td style="font-weight:800;color:var(--danger)">${e.amount.toLocaleString('ar-EG')} ج</td>
      <td style="font-size:11px;color:var(--text-secondary)">${e.notes||'—'}</td>
      <td><span class="badge badge-info" style="font-size:10px;">${whName}</span></td>
      <td>
        <button class="btn-icon" onclick="deleteExpense(${e.id})" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد مصروفات</td></tr>';
}

function openExpenseModal() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = today;
  document.getElementById('expAmount').value = '';
  document.getElementById('expNotes').value = '';
  document.getElementById('expCat').value = EXPENSE_CATS[0];
  // Populate warehouse select in expense modal
  const whSel = document.getElementById('expWarehouse');
  if (whSel) {
    whSel.innerHTML = '<option value="">🔗 مشترك (لا يختص بفرع)</option>' +
      store.warehouses.map(wh => `<option value="${wh.id}">${wh.name}</option>`).join('');
  }
  document.getElementById('expenseModal').classList.add('show');
  setTimeout(() => document.getElementById('expAmount')?.focus(), 100);
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.remove('show');
}

function saveExpense() {
  const date       = document.getElementById('expDate')?.value;
  const category   = document.getElementById('expCat')?.value;
  const amount     = parseFloat(document.getElementById('expAmount')?.value);
  const notes      = document.getElementById('expNotes')?.value.trim();
  const whIdRaw    = document.getElementById('expWarehouse')?.value;
  const warehouseId = whIdRaw ? parseInt(whIdRaw) : null;
  if (!date || !category || isNaN(amount) || amount <= 0) { showToast('يرجى ملء جميع الحقول', 'error'); return; }
  store.expenses.push({ id: store.nextExpenseId++, date, category, amount, notes, warehouseId });
  saveData();
  closeExpenseModal();
  renderExpenses();
  showToast('✅ تم تسجيل المصروف', 'success');
}

function deleteExpense(id) {
  if (!confirm('حذف هذا المصروف؟')) return;
  store.expenses = store.expenses.filter(e => e.id !== id);
  saveData(); renderExpenses();
  showToast('🗑️ تم حذف المصروف', 'info');
}

// ==================== SUPPLIERS ====================
let editingSupplierId = null;

function renderSuppliers() {
  const grid = document.getElementById('suppliersGrid');
  const countEl = document.getElementById('suppliersTotalCount');
  if (!grid) return;
  const search = (document.getElementById('suppliersSearch')?.value||'').toLowerCase();
  let list = (store.suppliers||[]).filter(s => !search || s.name.toLowerCase().includes(search) || (s.phone||'').includes(search));
  if (countEl) countEl.textContent = list.length;
  if (!list.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:60px">🏭 لا يوجد موردون</div>'; return; }
  grid.innerHTML = list.map(s => `
    <div class="supplier-card">
      <div class="supplier-avatar">${s.name.charAt(0)}</div>
      <div class="supplier-name">${s.name}</div>
      <div class="supplier-phone">📱 ${s.phone||'—'}</div>
      ${s.address?`<div class="supplier-address">📍 ${s.address}</div>`:''}
      ${s.email?`<div class="supplier-email">✉️ ${s.email}</div>`:''}
      ${s.notes?`<div class="supplier-notes">📝 ${s.notes}</div>`:''}
      <div class="supplier-actions">
        <button class="btn-edit" onclick="openSupplierModal(${s.id})">✏️ تعديل</button>
        <button class="btn-delete" onclick="deleteSupplier(${s.id})">🗑️ حذف</button>
      </div>
    </div>`).join('');
}

function openSupplierModal(id=null) {
  editingSupplierId = id;
  const title = document.getElementById('supplierModalTitle');
  if (id) {
    const s = store.suppliers.find(s=>s.id===id); if (!s) return;
    title.textContent = '✏️ تعديل المورد';
    document.getElementById('supName').value = s.name;
    document.getElementById('supPhone').value = s.phone||'';
    document.getElementById('supAddress').value = s.address||'';
    document.getElementById('supEmail').value = s.email||'';
    document.getElementById('supNotes').value = s.notes||'';
  } else {
    title.textContent = '➕ إضافة مورد جديد';
    ['supName','supPhone','supAddress','supEmail','supNotes'].forEach(fid => { const el=document.getElementById(fid); if(el) el.value=''; });
  }
  document.getElementById('supplierModal').classList.add('show');
  setTimeout(() => document.getElementById('supName')?.focus(), 100);
}

function closeSupplierModal() {
  document.getElementById('supplierModal').classList.remove('show');
  editingSupplierId = null;
}

function saveSupplier() {
  const name = document.getElementById('supName')?.value.trim();
  const phone = document.getElementById('supPhone')?.value.trim();
  const address = document.getElementById('supAddress')?.value.trim();
  const email = document.getElementById('supEmail')?.value.trim();
  const notes = document.getElementById('supNotes')?.value.trim();
  if (!name) { showToast('أدخل اسم المورد', 'error'); return; }
  if (editingSupplierId) {
    const idx = store.suppliers.findIndex(s=>s.id===editingSupplierId);
    if (idx!==-1) store.suppliers[idx] = {...store.suppliers[idx], name, phone, address, email, notes};
    showToast('✅ تم تحديث المورد', 'success');
  } else {
    store.suppliers.push({ id: store.nextSupplierId++, name, phone, address, email, notes, balance:0 });
    showToast('✅ تم إضافة المورد', 'success');
  }
  saveData(); closeSupplierModal(); renderSuppliers();
}

function deleteSupplier(id) {
  const s = store.suppliers.find(s=>s.id===id);
  if (!confirm(`حذف المورد "${s?.name}"؟`)) return;
  store.suppliers = store.suppliers.filter(s=>s.id!==id);
  saveData(); renderSuppliers();
  showToast('🗑️ تم حذف المورد', 'info');
}

function filterSuppliers() { renderSuppliers(); }

// ==================== PURCHASE ORDERS ====================
let editingPOId = null;

function renderPurchases() {
  const tbody = document.getElementById('purchasesBody');
  const totalEl = document.getElementById('purchasesTotalAmount');
  const countEl = document.getElementById('purchasesTotalCount');
  if (!tbody) return;
  const statusFilter = document.getElementById('poStatusFilter')?.value || '';
  let list = [...(store.purchaseOrders||[])].reverse();
  if (statusFilter) list = list.filter(p => p.status === statusFilter);
  const total = list.reduce((a,p)=>a+p.totalAmount,0);
  if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج';
  if (countEl) countEl.textContent = list.length;
  tbody.innerHTML = list.map(po => {
    const sup = store.suppliers.find(s=>s.id===po.supplierId);
    const statusBadge = po.status==='received' ? 'badge-success' : po.status==='partial' ? 'badge-warning' : 'badge-info';
    const statusLabel = po.status==='received' ? '✅ مستلم' : po.status==='partial' ? '⏳ جزئي' : '🕐 معلق';
    return `
    <tr>
      <td><span class="badge badge-primary">#${po.id}</span></td>
      <td style="font-size:12px">${po.date}</td>
      <td style="font-weight:600">${sup?.name||'غير محدد'}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${po.items.map(i=>i.name+'×'+i.qty).join(', ')}</td>
      <td style="font-weight:800;color:var(--primary-light)">${po.totalAmount.toLocaleString('ar-EG')} ج</td>
      <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
      <td>
        ${po.status!=='received'?`<button class="btn-icon" onclick="receivePO(${po.id})" title="تأكيد الاستلام">📥</button>`:'✅'}
        <button class="btn-icon" onclick="deletePO(${po.id})" title="حذف">🗑️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد طلبات شراء</td></tr>';
}

function openPOModal() {
  document.getElementById('poSupplier').innerHTML = '<option value="">اختر المورد</option>' +
    (store.suppliers||[]).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('poDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('poItemsContainer').innerHTML = '';
  document.getElementById('poNotes').value = '';
  addPOItem();
  updatePOTotal();
  document.getElementById('poModal').classList.add('show');
}

function closePOModal() { document.getElementById('poModal').classList.remove('show'); }

function addPOItem() {
  const container = document.getElementById('poItemsContainer');
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'po-item-row';
  div.innerHTML = `
    <input type="text" placeholder="اسم المنتج" class="form-control po-item-name" oninput="updatePOTotal()" />
    <input type="number" placeholder="الكمية" class="form-control po-item-qty" min="1" value="1" oninput="updatePOTotal()" style="width:80px" />
    <input type="number" placeholder="سعر الوحدة" class="form-control po-item-price" min="0" oninput="updatePOTotal()" style="width:110px" />
    <button class="btn-delete" onclick="this.parentElement.remove();updatePOTotal()" style="padding:6px 10px">✕</button>`;
  container.appendChild(div);
}

function updatePOTotal() {
  const rows = document.querySelectorAll('#poItemsContainer .po-item-row');
  let total = 0;
  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.po-item-qty')?.value)||0;
    const price = parseFloat(row.querySelector('.po-item-price')?.value)||0;
    total += qty * price;
  });
  const el = document.getElementById('poTotalDisplay');
  if (el) el.textContent = total.toLocaleString('ar-EG') + ' ج';
}

function savePurchaseOrder() {
  const supplierId = parseInt(document.getElementById('poSupplier')?.value);
  const date = document.getElementById('poDate')?.value;
  const notes = document.getElementById('poNotes')?.value.trim();
  if (!supplierId || !date) { showToast('اختر المورد والتاريخ', 'error'); return; }
  const rows = document.querySelectorAll('#poItemsContainer .po-item-row');
  const items = [];
  rows.forEach(row => {
    const name = row.querySelector('.po-item-name')?.value.trim();
    const qty = parseInt(row.querySelector('.po-item-qty')?.value)||0;
    const price = parseFloat(row.querySelector('.po-item-price')?.value)||0;
    if (name && qty > 0) items.push({ name, qty, price, subtotal: qty*price });
  });
  if (!items.length) { showToast('أضف منتجاً على الأقل', 'error'); return; }
  const totalAmount = items.reduce((a,i)=>a+i.subtotal,0);
  store.purchaseOrders.push({ id: store.nextPOId++, supplierId, date, items, totalAmount, notes, status:'pending' });
  saveData(); closePOModal(); renderPurchases();
  showToast('✅ تم إنشاء طلب الشراء', 'success');
}

function receivePO(id) {
  const po = store.purchaseOrders.find(p=>p.id===id);
  if (!po || po.status==='received') return;
  if (!confirm('تأكيد استلام طلب الشراء وتحديث المخزون؟')) return;
  po.items.forEach(item => {
    const product = store.products.find(p=>p.name.includes(item.name.split(' ')[0]));
    if (product) product.stock += item.qty;
  });
  po.status = 'received';
  po.receivedDate = new Date().toISOString().split('T')[0];
  saveData(); renderPurchases(); renderInventory(); updateNavAlerts(); buildNotifications();
  showToast('✅ تم استلام الطلب وتحديث المخزون', 'success');
}

function deletePO(id) {
  if (!confirm('حذف طلب الشراء؟')) return;
  store.purchaseOrders = store.purchaseOrders.filter(p=>p.id!==id);
  saveData(); renderPurchases();
  showToast('🗑️ تم حذف الطلب', 'info');
}

// ==================== RETURNS ====================
function renderReturns() {
  const tbody = document.getElementById('returnsBody');
  const totalEl = document.getElementById('returnsTotalAmount');
  const countEl = document.getElementById('returnsTotalCount');
  if (!tbody) return;
  const list = [...(store.returns||[])].reverse();
  const total = list.reduce((a,r) => a + (r.amount||0), 0);
  if (totalEl) totalEl.textContent = total.toLocaleString('ar-EG') + ' ج';
  if (countEl) countEl.textContent = list.length;
  const typeLabels = { refund:'💵 استرداد', exchange:'🔄 استبدال', store_credit:'🎫 رصيد' };
  const payLabels = { cash:'💵 نقدي', card:'💳 بطاقة', wallet:'📱 محفظة', instapay:'⚡ انستا باي' };
  tbody.innerHTML = list.map(r => `
    <tr>
      <td><span class="badge badge-primary">#${r.id}</span></td>
      <td style="font-size:12px">${r.date}</td>
      <td style="font-size:12px">${r.originalInvoice ? '#'+r.originalInvoice : '—'}</td>
      <td style="font-weight:600">${r.customerName||'—'}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${r.items.map(i=>i.name+'×'+i.qty).join(', ')}</td>
      <td style="font-weight:800;color:var(--danger)">${(r.amount||0).toLocaleString('ar-EG')} ج</td>
      <td><span class="badge ${r.type==='refund'?'badge-danger':r.type==='exchange'?'badge-warning':'badge-info'}">${typeLabels[r.type]||r.type}</span></td>
      <td style="font-size:12px">${payLabels[r.payMethod]||r.payMethod||'—'}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${r.reason||'—'}</td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد مرتجعات</td></tr>';
}

function lookupReturnInvoice() {
  const invId = parseInt(document.getElementById('retInvoiceSearch')?.value);
  if (!invId) { showToast('أدخل رقم الفاتورة', 'error'); return; }
  const sale = store.sales.find(s => s.id === invId);
  if (!sale) { showToast('❌ لم يتم إيجاد الفاتورة #'+invId, 'error'); return; }

  currentReturnSale = sale;
  const payInfo = getPayLabel(sale.paymentMethod, sale.paymentSplit);

  const headerDiv = document.getElementById('returnInvoiceHeader');
  if (headerDiv) {
    headerDiv.innerHTML = `
      <div class="return-inv-info">
        <div style="font-size:15px;font-weight:800;color:var(--primary-light)">فاتورة #${sale.id} — ${sale.date}</div>
        <div style="margin-top:4px;font-size:13px">👤 ${sale.customerName} &nbsp;·&nbsp; 💰 إجمالي: <strong>${sale.total.toFixed(2)} ج</strong></div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px">💳 طريقة الدفع الأصلية: ${payInfo}</div>
        ${sale.discount>0 ? `<div style="font-size:12px;color:var(--warning)">خصم: ${sale.discount.toFixed(2)} ج</div>` : ''}
      </div>`;
  }

  const listDiv = document.getElementById('returnItemsList');
  if (listDiv) {
    listDiv.innerHTML = sale.items.map((item, idx) => `
      <label class="return-item-row" for="ret_chk_${idx}">
        <input type="checkbox" class="ret-item-check" id="ret_chk_${idx}" data-idx="${idx}"
               data-price="${item.price}" data-name="${item.name}" data-product-id="${item.productId||''}"
               onchange="updateReturnSummary()"/>
        <div class="return-item-info">
          <div style="font-weight:600">${item.name}</div>
          <div style="font-size:12px;color:var(--text-muted)">السعر: ${item.price} ج &times; الكمية: ${item.qty} = <strong>${item.subtotal.toFixed(2)} ج</strong></div>
        </div>
        <div style="text-align:left;white-space:nowrap">
          <div style="font-weight:800;color:var(--primary-light);margin-bottom:4px">${item.subtotal.toFixed(2)} ج</div>
          <div style="font-size:11px;display:flex;align-items:center;gap:4px">كمية الإرجاع:
            <input type="number" class="ret-item-qty" data-idx="${idx}" value="${item.qty}" min="1" max="${item.qty}"
                   style="width:50px;border-radius:4px;padding:2px 4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:11px"
                   onchange="updateReturnSummary()" onclick="event.stopPropagation()"/>
          </div>
        </div>
      </label>`).join('');
  }

  document.getElementById('returnNoInvoice').style.display = 'none';
  document.getElementById('returnInvoiceDetails').style.display = 'block';
  document.getElementById('selectAllReturnItems').checked = false;

  // Set original payment method as default for refund
  const payMethod = document.getElementById('retPayMethod');
  if (payMethod && sale.paymentMethod && sale.paymentMethod !== 'mixed') {
    payMethod.value = sale.paymentMethod;
  }
  const origPayEl = document.getElementById('returnOriginalPay');
  if (origPayEl) origPayEl.textContent = `طريقة الدفع الأصلية: ${payInfo}`;

  document.getElementById('retDate').value = new Date().toISOString().split('T')[0];
  updateReturnSummary();
  showToast(`✅ تم إيجاد الفاتورة #${sale.id} — ${sale.customerName}`, 'success');
}

function toggleSelectAllReturnItems(checked) {
  document.querySelectorAll('.ret-item-check').forEach(cb => { cb.checked = checked; });
  updateReturnSummary();
}

function updateReturnSummary() {
  const checkedItems = [];
  document.querySelectorAll('.ret-item-check:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const item = currentReturnSale?.items[idx];
    if (!item) return;
    const qtyInput = document.querySelector(`.ret-item-qty[data-idx="${idx}"]`);
    const qty = Math.min(parseInt(qtyInput?.value||1), item.qty);
    const price = parseFloat(cb.dataset.price);
    checkedItems.push({ name: cb.dataset.name, productId: parseInt(cb.dataset.productId)||null, qty, price, subtotal: qty * price });
  });
  const total = checkedItems.reduce((a,i) => a + i.subtotal, 0);
  const summaryDiv = document.getElementById('returnSummaryItems');
  if (summaryDiv) {
    summaryDiv.innerHTML = checkedItems.length
      ? checkedItems.map(i => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px"><span>${i.name} × ${i.qty}</span><span style="font-weight:700">${i.subtotal.toFixed(2)} ج</span></div>`).join('')
      : '<div style="text-align:center;padding:20px;opacity:0.7;color:var(--text-muted)">اختر أصناف من الفاتورة</div>';
  }
  const totalEl = document.getElementById('returnTotalAmount');
  if (totalEl) totalEl.textContent = total.toFixed(2) + ' ج';
  const btn = document.getElementById('confirmReturnBtn');
  if (btn) btn.disabled = checkedItems.length === 0;
}

function confirmReturn() {
  if (!currentReturnSale) { showToast('لم يتم اختيار فاتورة', 'error'); return; }
  const checkedItems = [];
  document.querySelectorAll('.ret-item-check:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const item = currentReturnSale.items[idx];
    if (!item) return;
    const qtyInput = document.querySelector(`.ret-item-qty[data-idx="${idx}"]`);
    const qty = Math.min(parseInt(qtyInput?.value||1), item.qty);
    const price = parseFloat(cb.dataset.price);
    checkedItems.push({ name: cb.dataset.name, productId: parseInt(cb.dataset.productId)||null, qty, price, subtotal: qty * price });
  });
  if (!checkedItems.length) { showToast('اختر أصنافاً للإرجاع', 'error'); return; }

  const date = document.getElementById('retDate')?.value;
  const type = document.getElementById('retType')?.value||'refund';
  const payMethod = document.getElementById('retPayMethod')?.value||'cash';
  const reason = document.getElementById('retReason')?.value.trim();
  const total = checkedItems.reduce((a,i) => a + i.subtotal, 0);

  if (!confirm(`تأكيد مرتجع بقيمة ${total.toFixed(2)} ج لـ ${checkedItems.length} صنف؟`)) return;

  // Return to inventory
  checkedItems.forEach(item => {
    if (!item.productId) return;
    const product = store.products.find(p => p.id === item.productId);
    if (product) {
      product.stock = (product.stock||0) + item.qty;
      if (product.warehouseStocks && selectedWarehouseId) {
        product.warehouseStocks[selectedWarehouseId] = (product.warehouseStocks[selectedWarehouseId]||0) + item.qty;
        product.stock = Object.values(product.warehouseStocks).reduce((a,b)=>a+(b||0),0);
      }
    }
  });

  if (!store.returns) store.returns = [];
  if (!store.nextReturnId) store.nextReturnId = 1;
  store.returns.push({
    id: store.nextReturnId++,
    date: date || new Date().toISOString().split('T')[0],
    originalInvoice: currentReturnSale.id,
    customerId: currentReturnSale.customerId,
    customerName: currentReturnSale.customerName,
    items: checkedItems, amount: total, type, payMethod, reason
  });

  saveData();
  renderReturns();
  renderInventory();
  updateNavAlerts();
  buildNotifications();

  // Reset form
  currentReturnSale = null;
  const searchEl = document.getElementById('retInvoiceSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('returnNoInvoice').style.display = 'block';
  document.getElementById('returnInvoiceDetails').style.display = 'none';
  const summaryEl = document.getElementById('returnSummaryItems');
  if (summaryEl) summaryEl.innerHTML = '<div style="text-align:center;padding:20px;opacity:0.7;color:var(--text-muted)">اختر أصناف من الفاتورة</div>';
  const totalEl = document.getElementById('returnTotalAmount');
  if (totalEl) totalEl.textContent = '0.00 ج';
  const btn = document.getElementById('confirmReturnBtn');
  if (btn) btn.disabled = true;
  const reasonEl = document.getElementById('retReason');
  if (reasonEl) reasonEl.value = '';

  showToast('✅ تم تسجيل المرتجع وتحديث المخزون بنجاح', 'success');
}



// ==================== TOAST ====================
function showToast(message, type='info') {
  const container=document.getElementById('toastContainer');
  if (!container) return;
  const toast=document.createElement('div');
  toast.className=`toast ${type}`;
  const icons={ success:'✅', error:'❌', info:'💡', warning:'⚠️' };
  toast.innerHTML=`<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(toast);
  setTimeout(()=>{
    if(toast.parentElement) {
      toast.style.opacity='0'; toast.style.transform='translateX(-20px)';
      toast.style.transition='all 0.3s ease';
      setTimeout(()=>toast.remove(), 300);
    }
  }, 3500);
}

// ==================== PWA / SERVICE WORKER ====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ Service Worker registered:', reg.scope))
      .catch(err => console.warn('⚠️ Service Worker registration failed:', err));
  });
}

// ==================== ONLINE / OFFLINE INDICATOR ====================
function updateOnlineStatus() {
  let badge = document.getElementById('offlineBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'offlineBadge';
    badge.className = 'offline-badge';
    badge.innerHTML = '📡 وضع أوفلاين - البيانات محفوظة محلياً';
    document.body.appendChild(badge);
  }
  badge.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ==================== DEBT PAYOFF FUNCTIONS ====================
let payingCustomerId = null;

function openPayDebtModal(customerId) {
  const customer = store.customers.find(c => c.id === customerId);
  if (!customer) return;
  payingCustomerId = customerId;
  const debt = customer.debt || 0;
  
  const infoEl = document.getElementById('payDebtInfo');
  if (infoEl) {
    infoEl.innerHTML = `
      <strong>العميل:</strong> ${customer.name}<br>
      <strong>الهاتف:</strong> ${customer.phone || 'غير مسجل'}<br>
      <strong>المديونية الحالية:</strong> <span style="color:var(--danger); font-weight:bold;">${debt.toLocaleString('ar-EG')} ج</span>
    `;
  }
  const amtEl = document.getElementById('payDebtAmount');
  if (amtEl) {
    amtEl.value = debt;
    amtEl.max = debt;
  }
  document.getElementById('payDebtModal').classList.add('show');
}

function closePayDebtModal() {
  document.getElementById('payDebtModal').classList.remove('show');
  payingCustomerId = null;
}

function confirmPayDebt() {
  const amtEl = document.getElementById('payDebtAmount');
  if (!amtEl) return;
  const amount = parseFloat(amtEl.value) || 0;
  if (amount <= 0) {
    showToast('الرجاء إدخال مبلغ صحيح', 'error');
    return;
  }
  const customer = store.customers.find(c => c.id === payingCustomerId);
  if (!customer) return;
  
  const debt = customer.debt || 0;
  if (amount > debt) {
    showToast('المبلغ المدخل أكبر من مديونية العميل الحالية!', 'error');
    return;
  }
  
  customer.debt = Math.max(0, debt - amount);

  // Log payment to debt history
  if (!store.debtHistory) store.debtHistory = [];
  if (!store.nextDebtLogId) store.nextDebtLogId = 1;
  store.debtHistory.push({
    id: store.nextDebtLogId++,
    customerId: customer.id,
    customerName: customer.name,
    type: 'payment',
    amount: amount,
    saleId: null,
    date: new Date().toISOString().split('T')[0],
    notes: 'سداد مديونية',
    balance: customer.debt
  });

  showToast(`✅ تم سداد ${amount.toLocaleString('ar-EG')} ج بنجاح. المديونية المتبقية: ${customer.debt.toLocaleString('ar-EG')} ج`, 'success');
  
  saveData();
  closePayDebtModal();
  renderCustomers();
  buildNotifications();
}

// ==================== QUOTATION FUNCTIONS ====================
function saveQuotation() {
  if (!cart.length) { showToast('السلة فارغة!', 'error'); return; }

  const subtotal = cart.reduce((a,i)=>a+i.subtotal,0);
  const discVal = parseFloat(document.getElementById('discountAmount')?.value||0)||0;
  const discType = document.getElementById('discountType')?.value||'fixed';
  const discount = discType==='percent' ? (subtotal * discVal / 100) : discVal;
  const total = Math.max(0, subtotal - discount);

  const customerId = document.getElementById('cartCustomer')?.value;
  const customer = customerId ? store.customers.find(c=>c.id==customerId) : null;

  if (!store.quotations) store.quotations = [];
  if (!store.nextQuotationId) store.nextQuotationId = 1001;

  const now = new Date();
  const quote = {
    id: store.nextQuotationId++,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' }),
    customerId: customer?.id || null,
    customerName: customer?.name || 'عميل عام',
    items: [...cart],
    subtotal, discount, total
  };
  
  store.quotations.push(quote);
  saveData();
  clearCart();
  renderPOS();
  showToast(`✅ تم حفظ عرض سعر رقم #${quote.id} بنجاح`, 'success');
}

function renderQuotations() {
  const search = (document.getElementById('quotationsSearch')?.value || '').toLowerCase();
  const tbody = document.getElementById('quotationsTableBody');
  if (!tbody) return;
  if (!store.quotations) store.quotations = [];

  const filtered = store.quotations.filter(q => {
    return !search || 
           q.id.toString().includes(search) || 
           q.customerName.toLowerCase().includes(search);
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:30px;">📄 لا توجد عروض أسعار</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(q => {
    const itemStr = q.items.map(it => `${it.name} ×${it.qty}`).join(', ');
    return `
      <tr>
        <td><span class="badge badge-primary">#${q.id}</span></td>
        <td>${q.date} ${q.time}</td>
        <td>${q.customerName}</td>
        <td style="font-size:11px; max-width: 250px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${itemStr}">${itemStr}</td>
        <td>${q.subtotal.toLocaleString('ar-EG')} ج</td>
        <td>${q.discount.toLocaleString('ar-EG')} ج</td>
        <td style="font-weight:bold; color:var(--primary-light)">${q.total.toLocaleString('ar-EG')} ج</td>
        <td style="text-align:center;">
          <div style="display:flex; gap:6px; justify-content:center;">
            <button class="btn-icon" onclick="viewQuotation(${q.id})" title="عرض التفاصيل" style="color:var(--primary-light);border-color:var(--primary)">👁️</button>
            <button class="btn-edit" onclick="convertQuotationToSale(${q.id})" style="background:#4b7bec; border:none; color:white; padding:4px 8px; border-radius:4px;" title="تحويل لبيع"><span style="margin-left:2px">🛒</span>بيع</button>
            <button class="btn-icon" onclick="printQuotation(${q.id})" title="طباعة"><span style="margin-left:2px">🖨️</span></button>
            <button class="btn-delete" onclick="deleteQuotation(${q.id})" style="padding:4px 8px;" title="حذف">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function deleteQuotation(id) {
  if (!confirm(`هل تريد حذف عرض السعر رقم #${id}؟`)) return;
  store.quotations = store.quotations.filter(q => q.id !== id);
  saveData();
  renderQuotations();
  showToast('🗑️ تم حذف عرض السعر', 'info');
}

function convertQuotationToSale(id) {
  const quote = store.quotations.find(q => q.id === id);
  if (!quote) return;
  
  cart = [];
  quote.items.forEach(it => {
    cart.push({ ...it });
  });

  showPage('pos', document.querySelector('[data-page=pos]'));
  
  const custSelect = document.getElementById('cartCustomer');
  if (custSelect) {
    custSelect.value = quote.customerId || '';
  }
  
  const discAmtEl = document.getElementById('discountAmount');
  if (discAmtEl) {
    discAmtEl.value = quote.discount;
  }
  const discTypeEl = document.getElementById('discountType');
  if (discTypeEl) {
    discTypeEl.value = 'fixed';
  }

  renderPOS();
  updateCartTotals();
  
  showToast(`🛒 تم تحميل عرض سعر رقم #${id} إلى السلة!`, 'success');
}

function printQuotation(id) {
  const quote = store.quotations.find(q => q.id === id);
  if (!quote) return;

  const currency = store.settings.currency || 'ج';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`عرض سعر #${quote.id} - ${quote.total} ${currency}`)}`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>عرض سعر #${quote.id}</title>
      <style>
        body { font-family: 'Cairo', sans-serif; padding: 30px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #7c6ef5; padding-bottom: 15px; }
        .header h1 { margin: 0; font-size: 24px; color: #7c6ef5; }
        .details-row { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
        .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table th, .table td { border: 1px solid #ddd; padding: 10px; text-align: right; }
        .table th { background-color: #f2f2f2; }
        .totals { margin-top: 20px; text-align: left; font-size: 15px; font-weight: bold; }
        .totals div { margin-bottom: 5px; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #777; border-top: 1px dashed #ccc; padding-top: 15px; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${store.settings.invoiceHeader || 'أحمد ستور'}</h1>
        <p>${store.settings.storeAddress || 'القاهرة، مصر'} | هاتف: ${store.settings.storePhone || ''}</p>
        <h2>عرض سعر رقم #${quote.id}</h2>
      </div>
      <div class="details-row">
        <div>
          <strong>التاريخ:</strong> ${quote.date} ${quote.time}<br>
          <strong>العميل:</strong> ${quote.customerName}
        </div>
        <div>
          <img src="${qrUrl}" alt="QR Code" width="80" height="80">
        </div>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>المنتج</th>
            <th>السعر</th>
            <th>الكمية</th>
            <th>المجموع</th>
          </tr>
        </thead>
        <tbody>
          ${quote.items.map(it => `
            <tr>
              <td>${it.name}</td>
              <td>${it.price.toLocaleString('ar-EG')} ${currency}</td>
              <td>${it.qty}</td>
              <td>${it.subtotal.toLocaleString('ar-EG')} ${currency}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div>المجموع الفرعي: ${quote.subtotal.toLocaleString('ar-EG')} ${currency}</div>
        ${quote.discount > 0 ? `<div>الخصم الممنوح: ${quote.discount.toLocaleString('ar-EG')} ${currency}</div>` : ''}
        <div style="font-size: 18px; color: #7c6ef5; margin-top: 10px;">الإجمالي النهائي: ${quote.total.toLocaleString('ar-EG')} ${currency}</div>
      </div>
      <div class="footer">
        <p>عرض السعر صالح لمدة 15 يوماً من تاريخ الإصدار</p>
        <p>${store.settings.invoiceFooter || 'شكراً لتعاملكم معنا'}</p>
      </div>
      <script>
        window.onload = function() { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// ==================== BARCODE SCANNER FUNCTIONS ====================
let scannerStream = null;
let barcodeDetector = null;
let activeScannerAnimation = null;

function openBarcodeScanner() {
  document.getElementById('barcodeScannerModal').classList.add('show');
  const statusEl = document.getElementById('scannerStatus');
  if (statusEl) statusEl.textContent = 'جاري تشغيل الكاميرا...';
  
  startCameraScanner();
}

function closeBarcodeScanner() {
  stopCameraScanner();
  document.getElementById('barcodeScannerModal').classList.remove('show');
}

function startCameraScanner() {
  const video = document.getElementById('scannerVideo');
  if (!video) return;

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      scannerStream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', true);
      video.play();
      
      const statusEl = document.getElementById('scannerStatus');
      if (statusEl) statusEl.textContent = '🎥 وجه الكاميرا نحو الكود للتعرف عليه';
      
      if ('BarcodeDetector' in window) {
        const formats = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39'];
        BarcodeDetector.getSupportedFormats().then(supportedFormats => {
          const matchingFormats = formats.filter(f => supportedFormats.includes(f));
          barcodeDetector = new BarcodeDetector({ formats: matchingFormats.length > 0 ? matchingFormats : supportedFormats });
          scanLoop();
        });
      } else {
        const statusEl = document.getElementById('scannerStatus');
        if (statusEl) statusEl.innerHTML = '⚠️ الكشف التلقائي غير مدعوم في هذا المتصفح.<br>الرجاء استخدام متصفح Chrome/Edge أو الكتابة اليدوية.';
      }
    })
    .catch(err => {
      console.error(err);
      const statusEl = document.getElementById('scannerStatus');
      if (statusEl) statusEl.innerHTML = '❌ فشل الوصول للكاميرا. الرجاء تفعيل أذونات الكاميرا أو إدخال الكود يدوياً.';
    });
}

function stopCameraScanner() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  const video = document.getElementById('scannerVideo');
  if (video) video.srcObject = null;
  
  if (activeScannerAnimation) {
    cancelAnimationFrame(activeScannerAnimation);
    activeScannerAnimation = null;
  }
  barcodeDetector = null;
}

function scanLoop() {
  if (!scannerStream || !barcodeDetector) return;
  const video = document.getElementById('scannerVideo');
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    activeScannerAnimation = requestAnimationFrame(scanLoop);
    return;
  }

  barcodeDetector.detect(video)
    .then(barcodes => {
      if (barcodes.length > 0) {
        const barcodeValue = barcodes[0].rawValue;
        console.log('Barcode detected:', barcodeValue);
        processBarcode(barcodeValue);
      } else {
        activeScannerAnimation = requestAnimationFrame(scanLoop);
      }
    })
    .catch(err => {
      console.error(err);
      activeScannerAnimation = requestAnimationFrame(scanLoop);
    });
}

function playBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.error('Audio beep failed', e);
  }
}

function processBarcode(code) {
  playBeep();
  const product = store.products.find(p => (p.barcode || '').toLowerCase() === code.toLowerCase() || p.id.toString() === code);
  
  if (product) {
    if (product.stock <= 0) {
      showToast(`❌ المنتج \${product.name} نفد من المخزون`, 'error');
    } else {
      addToCart(product.id);
      showToast(`✅ تمت إضافة \${product.name} للسلة`, 'success');
    }
    closeBarcodeScanner();
  } else {
    showToast(`🔍 كود المنتج غير معروف: \${code}`, 'warning');
    setTimeout(() => {
      if (scannerStream) {
        scanLoop();
      }
    }, 1500);
  }
}

function handleManualScan() {
  const input = document.getElementById('manualBarcode');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    showToast('الرجاء إدخال الباركود يدوياً', 'error');
    return;
  }
  processBarcode(val);
  input.value = '';
}

// ==================== EXPENSE FILTER HELPER ====================
function getFilteredExpenses() {
  const period = reportPeriod;
  const today = new Date();
  today.setHours(23,59,59,999);
  let limitDate = new Date(today);

  if (period === 'week')  limitDate.setDate(today.getDate() - 7);
  if (period === 'month') limitDate.setMonth(today.getMonth() - 1);
  if (period === 'year')  limitDate.setFullYear(today.getFullYear() - 1);

  return store.expenses.filter(e => {
    if (period === 'all') return true;
    const ed = new Date(e.date);
    return ed >= limitDate && ed <= today;
  });
}

// ==================== DEBT STATEMENT ====================
let currentStatementCustomerId = null;

function openDebtStatementModal(customerId) {
  currentStatementCustomerId = customerId;
  const customer = store.customers.find(c => c.id === customerId);
  if (!customer) return;
  const nameEl = document.getElementById('statementCustomerName');
  if (nameEl) nameEl.textContent = `📋 كشف حساب: ${customer.name}`;
  renderDebtStatement(customerId);
  document.getElementById('debtStatementModal').classList.add('show');
}

function closeDebtStatementModal() {
  document.getElementById('debtStatementModal').classList.remove('show');
  currentStatementCustomerId = null;
}

function renderDebtStatement(customerId) {
  const customer = store.customers.find(c => c.id === customerId);
  if (!customer) return;
  const tbody = document.getElementById('statementBody');
  const totalDebtEl = document.getElementById('statementTotalDebt');
  const totalChargesEl = document.getElementById('statementTotalCharges');
  const totalPaymentsEl = document.getElementById('statementTotalPayments');
  if (!tbody) return;

  const history = (store.debtHistory || [])
    .filter(h => h.customerId === customerId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const totalCharges  = history.filter(h=>h.type==='charge').reduce((a,h)=>a+h.amount,0);
  const totalPayments = history.filter(h=>h.type==='payment').reduce((a,h)=>a+h.amount,0);
  const currentDebt   = customer.debt || 0;

  if (totalDebtEl) {
    totalDebtEl.textContent = currentDebt.toLocaleString('ar-EG') + ' ج';
    totalDebtEl.style.color = currentDebt > 0 ? 'var(--danger)' : 'var(--success)';
  }
  if (totalChargesEl)  totalChargesEl.textContent  = totalCharges.toLocaleString('ar-EG') + ' ج';
  if (totalPaymentsEl) totalPaymentsEl.textContent = totalPayments.toLocaleString('ar-EG') + ' ج';

  if (!history.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px">لا توجد حركات مالية مسجلة. ابدأ ببيع آجل أو تسجيل سداد.</td></tr>';
    return;
  }

  tbody.innerHTML = history.map(h => `
    <tr>
      <td style="font-size:12px">${h.date}</td>
      <td>
        <span class="badge ${h.type==='charge' ? 'badge-danger' : 'badge-success'}">
          ${h.type==='charge' ? '📝 بيع آجل' : '💵 سداد'}
        </span>
      </td>
      <td style="font-size:11px;color:var(--text-secondary)">${h.notes || '—'}</td>
      <td style="font-weight:800;color:${h.type==='charge'?'var(--danger)':'var(--success)'}">
        ${h.type==='charge' ? '+' : '-'}${h.amount.toLocaleString('ar-EG')} ج
      </td>
      <td style="font-weight:700;color:${h.balance>0?'var(--danger)':'var(--success)'}">
        ${h.balance.toLocaleString('ar-EG')} ج
      </td>
    </tr>`).join('');
}

function printDebtStatement() {
  const customer = store.customers.find(c => c.id === currentStatementCustomerId);
  if (!customer) return;
  const history = (store.debtHistory || [])
    .filter(h => h.customerId === customer.id)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const win = window.open('', '_blank', 'width=620,height=750');
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
  <title>كشف حساب - ${customer.name}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;direction:rtl;color:#000;font-size:13px;max-width:580px;margin:auto}
    h2{text-align:center;margin-bottom:6px;font-size:18px}
    .sub{text-align:center;font-size:11px;color:#666;margin-bottom:20px}
    .info{display:flex;justify-content:space-between;margin-bottom:16px;font-size:12px;background:#f8f8f8;padding:10px;border-radius:6px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}
    th,td{padding:8px 10px;border:1px solid #ddd;text-align:right;font-size:12px}
    th{background:#f0f0f0;font-weight:bold}
    .charge{color:red;font-weight:700} .payment{color:green;font-weight:700}
    .summary{display:flex;gap:20px;justify-content:flex-end;margin-bottom:16px}
    .summary-box{padding:8px 16px;border-radius:6px;font-size:12px;font-weight:bold;text-align:center}
    .s-charges{background:#ffeaea;color:red} .s-payments{background:#eafff0;color:green} .s-balance{background:#eef;color:#333}
    .foot{text-align:center;margin-top:20px;font-size:10px;color:#888;border-top:1px dashed #ccc;padding-top:10px}
  </style></head><body>
  <h2>📋 كشف حساب العميل</h2>
  <div class="sub">${store.settings.invoiceHeader} | ${store.settings.storePhone}</div>
  <div class="info">
    <div><strong>الاسم:</strong> ${customer.name}</div>
    <div><strong>الهاتف:</strong> ${customer.phone||'—'}</div>
    <div><strong>تاريخ الطباعة:</strong> ${new Date().toLocaleDateString('ar-EG')}</div>
  </div>
  <div class="summary">
    <div class="summary-box s-charges">إجمالي المشتريات<br>${history.filter(h=>h.type==='charge').reduce((a,h)=>a+h.amount,0).toLocaleString('ar-EG')} ج</div>
    <div class="summary-box s-payments">إجمالي المدفوعات<br>${history.filter(h=>h.type==='payment').reduce((a,h)=>a+h.amount,0).toLocaleString('ar-EG')} ج</div>
    <div class="summary-box s-balance">المديونية الحالية<br>${(customer.debt||0).toLocaleString('ar-EG')} ج</div>
  </div>
  <table>
    <thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المبلغ</th><th>الرصيد</th></tr></thead>
    <tbody>
      ${history.map(h=>`
        <tr>
          <td>${h.date}</td>
          <td>${h.type==='charge'?'بيع آجل':'سداد'}</td>
          <td>${h.notes||'—'}</td>
          <td class="${h.type}">${h.type==='charge'?'+':'-'}${h.amount.toLocaleString('ar-EG')} ج</td>
          <td style="font-weight:700;color:${h.balance>0?'red':'green'}">${h.balance.toLocaleString('ar-EG')} ج</td>
        </tr>`).join('')}
    </tbody>
  </table>
  <div class="foot">أحمد ستور - نظام إدارة المبيعات المتكامل</div>
  </body></html>`);
  win.document.close(); win.focus();
  setTimeout(() => win.print(), 500);
}

// ==================== QUOTATION VIEW ====================
function viewQuotation(quoteId) {
  const quote = store.quotations.find(q => q.id === quoteId);
  if (!quote) return;
  const modal = document.getElementById('viewQuotationModal');
  const body  = document.getElementById('viewQuotationBody');
  if (!modal || !body) return;

  const cur = store.settings.currency || 'ج';
  body.innerHTML = `
    <div class="invoice-view">
      <div class="inv-header">
        <h2>${store.settings.invoiceHeader}</h2>
        <p>${store.settings.storeAddress} | ${store.settings.storePhone}</p>
        <div style="margin-top:8px;font-size:13px;font-weight:700;color:var(--primary-light)">عرض سعر رقم #${quote.id}</div>
      </div>
      <div class="inv-info">
        <div class="inv-info-item"><strong>التاريخ: </strong><span>${quote.date}</span></div>
        <div class="inv-info-item"><strong>الوقت: </strong><span>${quote.time}</span></div>
        <div class="inv-info-item"><strong>العميل: </strong><span>${quote.customerName}</span></div>
        <div class="inv-info-item"><strong>صالح لـ: </strong><span>15 يوم من الإصدار</span></div>
      </div>
      <table>
        <thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
        <tbody>${quote.items.map(i=>`<tr><td>${i.name}</td><td>${i.price.toFixed(2)} ${cur}</td><td>${i.qty}</td><td>${i.subtotal.toFixed(2)} ${cur}</td></tr>`).join('')}</tbody>
      </table>
      <div class="inv-total-section">
        <div class="inv-total-row"><span>المجموع الفرعي:</span><span>${quote.subtotal.toFixed(2)} ${cur}</span></div>
        ${quote.discount>0?`<div class="inv-total-row"><span>الخصم:</span><span>- ${quote.discount.toFixed(2)} ${cur}</span></div>`:''}
        <div class="inv-total-row inv-grand-total"><span>الإجمالي النهائي:</span><span>${quote.total.toFixed(2)} ${cur}</span></div>
      </div>
      <div class="inv-footer">${store.settings.invoiceFooter}</div>
    </div>`;

  const convertBtn = document.getElementById('convertQuoteFromViewBtn');
  if (convertBtn) convertBtn.onclick = () => { closeViewQuotationModal(); convertQuotationToSale(quoteId); };
  const printBtn = document.getElementById('printQuoteFromViewBtn');
  if (printBtn) printBtn.onclick = () => printQuotation(quoteId);

  modal.classList.add('show');
}

function closeViewQuotationModal() {
  document.getElementById('viewQuotationModal').classList.remove('show');
}

// ==================== PDF EXPORT ====================
function exportInvoiceToPDF(saleId) {
  printInvoiceById(saleId);
  showToast('💡 اختر "حفظ كـ PDF" من نافذة الطباعة لتحميل الفاتورة كـ PDF', 'info');
}

function exportQuotationToPDF(quoteId) {
  printQuotation(quoteId);
  showToast('💡 اختر "حفظ كـ PDF" من نافذة الطباعة لتحميل العرض كـ PDF', 'info');
}

function exportReportToPDF() {
  showToast('💡 سيتم فتح نافذة الطباعة، اختر "حفظ كـ PDF" لتحميل التقرير', 'info');
  setTimeout(() => window.print(), 600);
}

// ==================== WAREHOUSE SELECTOR IN POS ====================
function renderPOSWarehouseSelector() {
  const container = document.getElementById('posWarehouseSelector');
  if (!container) return;
  if (!store.warehouses || store.warehouses.length === 0) { container.innerHTML = ''; return; }
  // Make sure selectedWarehouseId is valid
  if (!store.warehouses.find(w => w.id === selectedWarehouseId)) {
    selectedWarehouseId = store.warehouses[0].id;
  }
  container.innerHTML = `
    <div class="pos-warehouse-row">
      <span class="pos-warehouse-label">🏪 البيع من:</span>
      <select class="form-control pos-warehouse-select" id="posWarehouseSelect" onchange="setPOSWarehouse(this.value)" style="flex:1;font-size:13px;font-weight:700;border-color:var(--primary);background:var(--bg-input)">
        ${store.warehouses.map(w => `<option value="${w.id}" ${w.id === selectedWarehouseId ? 'selected' : ''}>${w.name} (${w.code})</option>`).join('')}
      </select>
    </div>`;
}

function setPOSWarehouse(id) {
  selectedWarehouseId = parseInt(id);
  filterPOSProducts(); // refresh stock display
}

// ==================== USERS MANAGEMENT ====================
let editingUserId = null;

function renderUsers() {
  const body = document.getElementById('usersTableBody');
  if (!body) return;
  const roleLabels = { admin: '👑 مدير', cashier: '🛒 كاشير', manager: '📦 أمين مخزن' };
  const users = store.users || [];
  // Update KPI
  const countEl = document.getElementById('usersTotalCount');
  if (countEl) countEl.textContent = users.length;
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">لا يوجد مستخدمون. أضف مستخدماً جديداً.</td></tr>';
    return;
  }
  body.innerHTML = users.map(u => `
    <tr>
      <td><div class="user-avatar-sm" style="background:${u.role==='admin'?'var(--primary)':u.role==='cashier'?'var(--success)':'var(--warning)'}">${u.name.charAt(0)}</div></td>
      <td style="font-weight:700">${u.name}</td>
      <td style="color:var(--text-secondary);font-size:12px">@${u.username}</td>
      <td><span class="badge ${u.role==='admin'?'badge-primary':u.role==='cashier'?'badge-success':'badge-warning'}">${roleLabels[u.role]||u.role}</span></td>
      <td><span class="badge ${u.active!==false?'badge-success':'badge-danger'}">${u.active!==false?'✅ نشط':'❌ موقوف'}</span></td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center">
          <button class="btn-icon-edit" onclick="openUserModal(${u.id})" title="تعديل">✏️</button>
          ${u.id !== (currentUser?.id) ? `<button class="btn-icon-delete" onclick="deleteUser(${u.id})" title="حذف">🗑️</button>` : '<span style="color:var(--text-muted);font-size:11px">أنت</span>'}
        </div>
      </td>
    </tr>`).join('');
}

function buildPermPageCheckboxes(selectedPages) {
  const container = document.getElementById('permPagesContainer');
  if (!container) return;
  container.innerHTML = ALL_PAGES.map(p =>
    `<label class="checkbox-wrap" style="font-size:11px;padding:2px 6px;border:1px solid var(--border);border-radius:6px">
      <input type="checkbox" class="perm-page-cb" value="${p}" ${(selectedPages||[]).includes(p)?'checked':''} /> ${PAGE_LABELS[p]||p}
    </label>`
  ).join('');
}

function onUserRoleChange() {
  const role = document.getElementById('uRole')?.value;
  if (!role) return;
  const defPerms = getDefaultPermissions(role);
  buildPermPageCheckboxes(defPerms.pages);
  document.getElementById('permEditPrice').checked = defPerms.canEditPrice;
  document.getElementById('permApplyDiscount').checked = defPerms.canApplyDiscount;
  document.getElementById('permDeleteSales').checked = defPerms.canDeleteSales;
  document.getElementById('permManageUsers').checked = defPerms.canManageUsers;
}

function resetUserPermissions() {
  onUserRoleChange();
  showToast('✅ تم استعادة صلاحيات الدور الافتراضية', 'success');
}

function openUserModal(userId) {
  editingUserId = userId || null;
  const modal = document.getElementById('userModal');
  if (!modal) return;
  const titleEl = document.getElementById('userModalTitle');
  if (titleEl) titleEl.textContent = userId ? '✏️ تعديل مستخدم' : '➕ إضافة مستخدم جديد';

  if (userId) {
    const u = store.users.find(u => u.id === userId);
    if (!u) return;
    document.getElementById('uName').value     = u.name;
    document.getElementById('uUsername').value = u.username;
    document.getElementById('uPassword').value = '';
    document.getElementById('uRole').value     = u.role;
    document.getElementById('uActive').checked = u.active !== false;
    // Load permissions
    const p = u.permissions || getDefaultPermissions(u.role);
    buildPermPageCheckboxes(p.pages);
    document.getElementById('permEditPrice').checked = p.canEditPrice;
    document.getElementById('permApplyDiscount').checked = p.canApplyDiscount;
    document.getElementById('permDeleteSales').checked = p.canDeleteSales;
    document.getElementById('permManageUsers').checked = p.canManageUsers;
  } else {
    document.getElementById('uName').value     = '';
    document.getElementById('uUsername').value = '';
    document.getElementById('uPassword').value = '';
    document.getElementById('uRole').value     = 'cashier';
    document.getElementById('uActive').checked = true;
    onUserRoleChange();
  }
  modal.classList.add('show');
}

function closeUserModal() {
  document.getElementById('userModal')?.classList.remove('show');
  editingUserId = null;
}

function saveUser() {
  const name     = document.getElementById('uName')?.value.trim();
  const username = document.getElementById('uUsername')?.value.trim().toLowerCase();
  const password = document.getElementById('uPassword')?.value;
  const role     = document.getElementById('uRole')?.value;
  const active   = document.getElementById('uActive')?.checked;

  if (!name || !username) { showToast('يرجى إدخال الاسم واسم المستخدم', 'error'); return; }
  if (!editingUserId && !password) { showToast('يرجى إدخال كلمة المرور للمستخدم الجديد', 'error'); return; }

  // Check duplicate username
  const dupCheck = store.users.find(u => u.username === username && u.id !== editingUserId);
  if (dupCheck) { showToast('اسم المستخدم مستخدم بالفعل، اختر اسماً آخر', 'error'); return; }

  // Collect permissions
  const pageCbs = document.querySelectorAll('#permPagesContainer .perm-page-cb');
  const pages = [];
  pageCbs.forEach(cb => { if (cb.checked) pages.push(cb.value); });
  const permissions = {
    pages,
    canEditPrice: document.getElementById('permEditPrice').checked,
    canApplyDiscount: document.getElementById('permApplyDiscount').checked,
    canDeleteSales: document.getElementById('permDeleteSales').checked,
    canManageUsers: document.getElementById('permManageUsers').checked
  };

  if (editingUserId) {
    const u = store.users.find(u => u.id === editingUserId);
    if (u) {
      u.name = name; u.username = username; u.role = role; u.active = active;
      u.permissions = permissions;
      if (password) u.password = password;
      // Re-apply permissions if editing current user
      if (editingUserId === currentUser?.id) applyPermissions(role);
    }
    showToast('✅ تم تحديث بيانات المستخدم', 'success');
  } else {
    store.users.push({ id: store.nextUserId++, name, username, password, role, active, permissions });
    showToast('✅ تم إضافة المستخدم بنجاح', 'success');
  }
  saveData();
  closeUserModal();
  renderUsers();
}

function deleteUser(userId) {
  if (userId === currentUser?.id) { showToast('لا يمكن حذف المستخدم الحالي', 'error'); return; }
  if (!confirm('هل تريد حذف هذا المستخدم؟')) return;
  store.users = store.users.filter(u => u.id !== userId);
  saveData();
  renderUsers();
  showToast('تم حذف المستخدم', 'success');
}

// ==================== WAREHOUSES MANAGEMENT ====================
let editingWarehouseId = null;

function renderWarehouses() {
  const body = document.getElementById('warehousesTableBody');
  if (!body) return;
  const warehouses = store.warehouses || [];
  // Update KPI
  const countEl = document.getElementById('warehousesTotalCount');
  if (countEl) countEl.textContent = warehouses.length;
  if (!warehouses.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">لا توجد مستودعات.</td></tr>';
    return;
  }
  body.innerHTML = warehouses.map(w => {
    // Calculate total stock in this warehouse
    const totalItems = store.products.reduce((sum, p) => sum + ((p.warehouseStocks && p.warehouseStocks[w.id]) || 0), 0);
    return `
    <tr>
      <td><span class="badge badge-primary" style="font-size:14px">${w.code}</span></td>
      <td style="font-weight:700">${w.name}</td>
      <td style="color:var(--text-secondary);font-size:12px">${w.notes || '—'}</td>
      <td style="font-weight:700;color:var(--success)">${totalItems.toLocaleString('ar-EG')} قطعة</td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center">
          <button class="btn-icon-edit" onclick="openWarehouseModal(${w.id})" title="تعديل">✏️</button>
          ${warehouses.length > 1 ? `<button class="btn-icon-delete" onclick="deleteWarehouse(${w.id})" title="حذف">🗑️</button>` : '<span style="font-size:10px;color:var(--text-muted)">رئيسي</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Refresh product stock table
  renderWarehouseStockTable();
  // Refresh transfer selectors
  populateTransferSelectors();
}

function renderWarehouseStockTable() {
  const body = document.getElementById('warehouseStockBody');
  if (!body) return;
  const warehouses = store.warehouses || [];
  const products   = store.products || [];
  if (!products.length) { body.innerHTML = '<tr><td colspan="20" style="text-align:center;padding:20px;color:var(--text-muted)">لا توجد منتجات</td></tr>'; return; }

  // Build header
  const thead = document.getElementById('warehouseStockThead');
  if (thead) {
    thead.innerHTML = `<tr><th>المنتج</th><th>الفئة</th>${warehouses.map(w=>`<th style="color:var(--primary)">${w.name}</th>`).join('')}<th>الإجمالي</th></tr>`;
  }

  body.innerHTML = products.map(p => {
    const whCells = warehouses.map(w => {
      const qty = (p.warehouseStocks && p.warehouseStocks[w.id]) || 0;
      return `<td style="text-align:center;font-weight:${qty>0?'700':'400'};color:${qty<=0?'var(--danger)':qty<=(p.minStock||0)?'var(--warning)':'var(--success)'}">${qty}</td>`;
    }).join('');
    return `<tr>
      <td style="font-weight:600">${p.name}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${p.category}</td>
      ${whCells}
      <td style="font-weight:800;color:var(--primary)">${p.stock}</td>
    </tr>`;
  }).join('');
}

function openWarehouseModal(whId) {
  editingWarehouseId = whId || null;
  const modal = document.getElementById('warehouseModal');
  if (!modal) return;
  const titleEl = document.getElementById('warehouseModalTitle');
  if (titleEl) titleEl.textContent = whId ? '✏️ تعديل مستودع' : '➕ إضافة مستودع جديد';
  if (whId) {
    const w = store.warehouses.find(w => w.id === whId);
    if (!w) return;
    document.getElementById('whName').value  = w.name;
    document.getElementById('whCode').value  = w.code;
    document.getElementById('whNotes').value = w.notes || '';
  } else {
    document.getElementById('whName').value  = '';
    document.getElementById('whCode').value  = '';
    document.getElementById('whNotes').value = '';
  }
  modal.classList.add('show');
}

function closeWarehouseModal() {
  document.getElementById('warehouseModal')?.classList.remove('show');
  editingWarehouseId = null;
}

function saveWarehouse() {
  const name  = document.getElementById('whName')?.value.trim();
  const code  = document.getElementById('whCode')?.value.trim().toUpperCase();
  const notes = document.getElementById('whNotes')?.value.trim();
  if (!name || !code) { showToast('يرجى إدخال الاسم والرمز', 'error'); return; }

  if (editingWarehouseId) {
    const w = store.warehouses.find(w => w.id === editingWarehouseId);
    if (w) { w.name = name; w.code = code; w.notes = notes; }
    showToast('✅ تم تحديث المستودع', 'success');
  } else {
    const newWh = { id: store.nextWarehouseId++, name, code, notes };
    store.warehouses.push(newWh);
    // Initialize this warehouse with 0 stock for all products
    store.products.forEach(p => {
      if (!p.warehouseStocks) p.warehouseStocks = {};
      p.warehouseStocks[newWh.id] = 0;
    });
    showToast('✅ تم إضافة المستودع بنجاح', 'success');
  }
  saveData();
  closeWarehouseModal();
  renderWarehouses();
  renderStockTransfers();
}

function deleteWarehouse(whId) {
  if (store.warehouses.length <= 1) { showToast('لا يمكن حذف المستودع الوحيد', 'error'); return; }
  if (!confirm('هل تريد حذف هذا المستودع؟ سيتم نقل مخزونه إلى المستودع الرئيسي.')) return;
  const mainWhId = store.warehouses.find(w => w.id !== whId)?.id;
  if (mainWhId) {
    store.products.forEach(p => {
      if (p.warehouseStocks) {
        const qty = p.warehouseStocks[whId] || 0;
        p.warehouseStocks[mainWhId] = (p.warehouseStocks[mainWhId] || 0) + qty;
        delete p.warehouseStocks[whId];
        p.stock = Object.values(p.warehouseStocks).reduce((a,b)=>a+(b||0),0);
      }
    });
  }
  store.warehouses = store.warehouses.filter(w => w.id !== whId);
  if (selectedWarehouseId === whId) selectedWarehouseId = store.warehouses[0]?.id || 1;
  saveData();
  renderWarehouses();
  showToast('تم حذف المستودع ونقل مخزونه', 'success');
}

// ==================== STOCK TRANSFERS ====================
function populateTransferSelectors() {
  const productSel = document.getElementById('transferProduct');
  const fromSel    = document.getElementById('transferFrom');
  const toSel      = document.getElementById('transferTo');
  if (!productSel || !fromSel || !toSel) return;

  productSel.innerHTML = '<option value="">اختر المنتج</option>' +
    store.products.map(p => `<option value="${p.id}">${p.name} (إجمالي: ${p.stock})</option>`).join('');
  const whOpts = store.warehouses.map(w => `<option value="${w.id}">${w.name} (${w.code})</option>`).join('');
  fromSel.innerHTML = whOpts;
  toSel.innerHTML   = whOpts;
  if (store.warehouses.length > 1) toSel.value = store.warehouses[1].id;
}

function onTransferProductChange() {
  const productId = parseInt(document.getElementById('transferProduct')?.value);
  const infoEl = document.getElementById('transferStockInfo');
  if (!infoEl) return;
  if (!productId) { infoEl.innerHTML = ''; return; }
  const p = store.products.find(p => p.id === productId);
  if (!p || !p.warehouseStocks) { infoEl.innerHTML = ''; return; }
  const rows = store.warehouses.map(w => {
    const qty = (p.warehouseStocks && p.warehouseStocks[w.id]) || 0;
    return `<span style="margin-left:12px"><strong>${w.name}:</strong> <span style="color:${qty>0?'var(--success)':'var(--danger)'}">${qty}</span></span>`;
  }).join('');
  infoEl.innerHTML = `<div class="transfer-stock-info">${rows}</div>`;
}

function executeTransfer() {
  const productId = parseInt(document.getElementById('transferProduct')?.value);
  const fromId    = parseInt(document.getElementById('transferFrom')?.value);
  const toId      = parseInt(document.getElementById('transferTo')?.value);
  const qty       = parseInt(document.getElementById('transferQty')?.value) || 0;

  if (!productId) { showToast('يرجى اختيار منتج', 'error'); return; }
  if (fromId === toId) { showToast('المستودع المصدر والهدف متطابقان!', 'error'); return; }
  if (qty <= 0) { showToast('يرجى إدخال كمية صحيحة', 'error'); return; }

  const p = store.products.find(p => p.id === productId);
  if (!p || !p.warehouseStocks) { showToast('المنتج غير موجود', 'error'); return; }

  const available = (p.warehouseStocks[fromId]) || 0;
  if (qty > available) {
    showToast(`الكمية المطلوبة (${qty}) أكبر من المتاح في المستودع (${available})`, 'error'); return;
  }

  // Perform transfer
  p.warehouseStocks[fromId]  = (p.warehouseStocks[fromId]  || 0) - qty;
  p.warehouseStocks[toId]    = (p.warehouseStocks[toId]    || 0) + qty;
  p.stock = Object.values(p.warehouseStocks).reduce((a,b)=>a+(b||0),0);

  const fromWh = store.warehouses.find(w => w.id === fromId);
  const toWh   = store.warehouses.find(w => w.id === toId);
  const now    = new Date();
  store.stockTransfers.push({
    id: store.nextTransferId++,
    productId, productName: p.name,
    fromId, fromName: fromWh?.name || '',
    toId,   toName:   toWh?.name   || '',
    qty,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}),
    userId: currentUser?.id || null,
    userName: currentUser?.name || 'النظام'
  });

  saveData();
  // Reset fields
  document.getElementById('transferQty').value = '';
  document.getElementById('transferStockInfo').innerHTML = '';
  document.getElementById('transferProduct').value = '';

  renderWarehouses();
  renderStockTransfers();
  showToast(`✅ تم تحويل ${qty} قطعة من "${fromWh?.name}" إلى "${toWh?.name}"`, 'success');
}

function renderStockTransfers() {
  const body = document.getElementById('transfersBody');
  if (!body) return;
  const transfers = (store.stockTransfers || []).slice().reverse();
  if (!transfers.length) {
    body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">لا توجد تحويلات مخزون سابقة</td></tr>';
    return;
  }
  body.innerHTML = transfers.slice(0, 50).map(t => `
    <tr>
      <td style="color:var(--text-muted);font-size:11px">#${t.id}</td>
      <td style="font-size:12px">${t.date}<br><span style="color:var(--text-muted)">${t.time}</span></td>
      <td style="font-weight:700">${t.productName}</td>
      <td style="color:var(--danger)">${t.fromName}</td>
      <td style="color:var(--text-muted)">→</td>
      <td style="color:var(--success)">${t.toName}</td>
      <td style="font-weight:800;color:var(--primary)">${t.qty}</td>
      <td style="font-size:11px;color:var(--text-muted)">${t.userName || '—'}</td>
    </tr>`).join('');
}


// ==================== WHATSAPP INTEGRATION ====================

/**
 * بناء رابط واتساب مع رسالة مُشفَّرة
 */
function buildWhatsAppUrl(phone, message) {
  let cleaned = (phone || '').replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '20' + cleaned.substring(1);
  if (!cleaned) return null;
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

/**
 * إرسال تفاصيل فاتورة عبر واتساب
 */
function sendInvoiceViaWhatsApp(saleId) {
  const sale = store.sales.find(s => s.id === saleId);
  if (!sale) return;

  const customer = sale.customerId
    ? store.customers.find(c => c.id === sale.customerId)
    : store.customers.find(c => c.name === sale.customerName);

  const phone = customer?.phone || '';
  const storeName = store.settings.storeName || 'أحمد ستور';
  const itemsText = sale.items.map(i => `• ${i.name} × ${i.qty} = ${i.subtotal.toFixed(2)} ج`).join('\n');
  const discountText = sale.discount > 0 ? `\n🏷️ خصم: ${sale.discount.toFixed(2)} ج` : '';

  const message =
`🧾 *فاتورة من ${storeName}*
━━━━━━━━━━━━━━━━━━
📅 التاريخ: ${sale.date}  🕐 ${sale.time}
🔢 رقم الفاتورة: #${sale.id}
👤 العميل: ${sale.customerName}
💳 طريقة الدفع: ${getPayLabel(sale.paymentMethod)}
━━━━━━━━━━━━━━━━━━
${itemsText}
━━━━━━━━━━━━━━━━━━
📦 المجموع الفرعي: ${sale.subtotal.toFixed(2)} ج${discountText}
✅ *الإجمالي: ${sale.total.toFixed(2)} ج*
━━━━━━━━━━━━━━━━━━
${store.settings.invoiceFooter || 'شكراً لتعاملكم معنا!'}`;

  if (!phone) {
    openWhatsAppPhoneModal(message, `فاتورة #${sale.id}`);
  } else {
    const url = buildWhatsAppUrl(phone, message);
    if (url) window.open(url, '_blank');
  }
}

/**
 * إرسال رسالة مخصصة للعميل عبر واتساب
 */
function sendCustomerWhatsApp(customerId) {
  const c = store.customers.find(c => c.id === customerId);
  if (!c) return;
  const storeName = store.settings.storeName || 'أحمد ستور';
  const debtMsg = (c.debt || 0) > 0
    ? `\n\n💳 *تذكير:* يوجد مديونية بقيمة *${(c.debt).toLocaleString('ar-EG')} ج* — نرجو التكرم بالسداد.`
    : '';
  const defaultMsg =
`مرحباً ${c.name} 👋
نتشرف بتواصلكم مع *${storeName}* 🛍️${debtMsg}

نحن في خدمتكم دائماً!`;
  openWhatsAppComposeModal(c.phone, defaultMsg, c.name);
}

/**
 * فتح نافذة إدخال الهاتف لإرسال واتساب
 */
function openWhatsAppPhoneModal(message, context) {
  const el = document.getElementById('whatsappPhoneModal');
  if (!el) return;
  document.getElementById('waPhoneContext').textContent = context || '';
  document.getElementById('waPhoneInput').value = '';
  document.getElementById('waPreviewText').textContent = message;
  window._waPendingMessage = message;
  el.classList.add('show');
  setTimeout(() => document.getElementById('waPhoneInput')?.focus(), 100);
}

function closeWhatsAppPhoneModal() {
  document.getElementById('whatsappPhoneModal')?.classList.remove('show');
  window._waPendingMessage = null;
}

function confirmWhatsAppSend() {
  const phone = document.getElementById('waPhoneInput')?.value.trim();
  if (!phone) { showToast('أدخل رقم الهاتف', 'error'); return; }
  const url = buildWhatsAppUrl(phone, window._waPendingMessage || '');
  if (url) { window.open(url, '_blank'); closeWhatsAppPhoneModal(); }
  else showToast('رقم الهاتف غير صحيح', 'error');
}

/**
 * فتح نافذة تحرير رسالة حرة للعميل
 */
function openWhatsAppComposeModal(phone, defaultMsg, customerName) {
  const el = document.getElementById('whatsappComposeModal');
  if (!el) return;
  document.getElementById('waComposePhone').value = phone || '';
  document.getElementById('waComposeText').value = defaultMsg || '';
  document.getElementById('waComposeTitle').textContent = customerName ? `📲 رسالة لـ ${customerName}` : '📲 رسالة واتساب';
  el.classList.add('show');
  setTimeout(() => document.getElementById('waComposeText')?.focus(), 100);
}

function closeWhatsAppComposeModal() {
  document.getElementById('whatsappComposeModal')?.classList.remove('show');
}

function sendComposedWhatsApp() {
  const phone = document.getElementById('waComposePhone')?.value.trim();
  const text  = document.getElementById('waComposeText')?.value.trim();
  if (!phone) { showToast('أدخل رقم الهاتف', 'error'); return; }
  if (!text)  { showToast('اكتب نص الرسالة', 'error'); return; }
  const url = buildWhatsAppUrl(phone, text);
  if (url) { window.open(url, '_blank'); closeWhatsAppComposeModal(); showToast('✅ تم فتح واتساب', 'success'); }
  else showToast('رقم الهاتف غير صحيح', 'error');
}

/**
 * إرسال تذكير مديونية عبر واتساب
 */
function sendDebtReminderWhatsApp(customerId) {
  const c = store.customers.find(c => c.id === customerId);
  if (!c) return;
  if ((c.debt || 0) <= 0) { showToast('لا توجد مديونية لهذا العميل', 'info'); return; }
  const storeName = store.settings.storeName || 'أحمد ستور';
  const msg =
`مرحباً *${c.name}* 👋
نرجو التكرم بسداد المبلغ المستحق عليكم لدى *${storeName}*:

💳 المبلغ: *${(c.debt).toLocaleString('ar-EG')} ج*

شاكرين لكم حسن تعاونكم 🙏`;

  if (c.phone) {
    const url = buildWhatsAppUrl(c.phone, msg);
    if (url) window.open(url, '_blank');
  } else {
    openWhatsAppPhoneModal(msg, `تذكير دين - ${c.name}`);
  }
}

// ==================== RECURRING INVOICES ====================

let editingRecurringId = null;

function initRecurringInvoices() {
  if (!store.recurringInvoices) store.recurringInvoices = [];
  if (!store.nextRecurringId)   store.nextRecurringId = 1;
}

function renderRecurringInvoices() {
  initRecurringInvoices();
  const tbody = document.getElementById('recurringBody');
  if (!tbody) return;

  checkDueRecurringInvoices();

  const list = store.recurringInvoices;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">📅 لا توجد فواتير متكررة مجدولة</td></tr>';
    updateRecurringDueBadge();
    return;
  }

  const freqLabel = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', yearly: 'سنوي' };
  const todayStr = new Date().toISOString().split('T')[0];

  tbody.innerHTML = list.map(r => {
    const customer = store.customers.find(c => c.id === r.customerId);
    const statusBadge = r.active
      ? '<span class="badge badge-success">✅ نشط</span>'
      : '<span class="badge badge-warning">⏸️ متوقف</span>';
    const overdue = r.active && r.nextDueDate && r.nextDueDate <= todayStr;
    return `<tr${overdue ? ' style="background:rgba(255,79,100,0.07)"' : ''}>
      <td><span class="badge badge-primary">#${r.id}</span></td>
      <td style="font-weight:700;font-size:13px">${r.name}</td>
      <td style="font-size:12px">${customer?.name || r.customerName || 'عميل عام'}</td>
      <td><span class="badge badge-info">${freqLabel[r.frequency] || r.frequency}</span></td>
      <td style="font-weight:700;color:var(--primary-light)">${r.total.toFixed(2)} ج</td>
      <td style="font-size:12px;${overdue ? 'color:var(--danger);font-weight:700' : ''}">${r.nextDueDate || '—'}${overdue ? ' ⚠️' : ''}</td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap">
          <button class="btn-icon" onclick="generateRecurringNow(${r.id})" title="توليد فاتورة الآن">▶️</button>
          <button class="btn-icon" onclick="toggleRecurring(${r.id})" title="${r.active ? 'إيقاف' : 'تفعيل'}">${r.active ? '⏸️' : '▶️'}</button>
          <button class="btn-icon" onclick="openRecurringModal(${r.id})" title="تعديل">✏️</button>
          <button class="btn-icon" onclick="deleteRecurring(${r.id})" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  updateRecurringDueBadge();

  // Update KPI counters in the page
  const todayS = new Date().toISOString().split('T')[0];
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('recurringTotalCount', list.length);
  setEl('recurringActiveCount', list.filter(r => r.active).length);
  setEl('recurringDueCount', list.filter(r => r.active && r.nextDueDate && r.nextDueDate <= todayS).length);
}

function updateRecurringDueBadge() {
  const todayStr = new Date().toISOString().split('T')[0];
  const dueCount = (store.recurringInvoices || []).filter(r => r.active && r.nextDueDate && r.nextDueDate <= todayStr).length;
  const alertEl = document.getElementById('recurringDueBadge');
  if (alertEl) {
    alertEl.textContent = dueCount;
    alertEl.style.display = dueCount > 0 ? 'flex' : 'none';
  }
}

function openRecurringModal(id) {
  initRecurringInvoices();
  editingRecurringId = id || null;

  const modal = document.getElementById('recurringModal');
  if (!modal) return;

  const custSel = document.getElementById('recCustomer');
  if (custSel) {
    custSel.innerHTML = '<option value="">عميل عام</option>' +
      store.customers.map(c => `<option value="${c.id}">${c.name}${c.phone ? ' — ' + c.phone : ''}</option>`).join('');
  }

  if (id) {
    const r = store.recurringInvoices.find(r => r.id === id);
    if (!r) return;
    document.getElementById('recurringModalTitle').textContent = '✏️ تعديل فاتورة متكررة';
    document.getElementById('recName').value = r.name;
    if (custSel) custSel.value = r.customerId || '';
    document.getElementById('recFrequency').value = r.frequency;
    document.getElementById('recStartDate').value = r.startDate;
    document.getElementById('recEndDate').value = r.endDate || '';
    document.getElementById('recNotes').value = r.notes || '';
    renderRecurringItemsForm(r.items || []);
  } else {
    document.getElementById('recurringModalTitle').textContent = '➕ فاتورة متكررة جديدة';
    document.getElementById('recName').value = '';
    if (custSel) custSel.value = '';
    document.getElementById('recFrequency').value = 'monthly';
    document.getElementById('recStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('recEndDate').value = '';
    document.getElementById('recNotes').value = '';
    renderRecurringItemsForm([]);
    addRecurringItem();
  }

  modal.classList.add('show');
  setTimeout(() => document.getElementById('recName')?.focus(), 100);
}

function closeRecurringModal() {
  document.getElementById('recurringModal')?.classList.remove('show');
  editingRecurringId = null;
}

function renderRecurringItemsForm(items) {
  const container = document.getElementById('recItemsContainer');
  if (!container) return;
  container.innerHTML = '';
  (items || []).forEach(item => addRecurringItemRow(item));
  updateRecurringTotal();
}

function addRecurringItem() {
  addRecurringItemRow(null);
  updateRecurringTotal();
}

function addRecurringItemRow(item) {
  const container = document.getElementById('recItemsContainer');
  if (!container) return;
  const productOptions = store.products.map(p =>
    `<option value="${p.id}" data-price="${p.sellPrice}"${item && item.productId === p.id ? ' selected' : ''}>${p.name} — ${p.sellPrice.toFixed(2)} ج</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'rec-item-row';
  row.innerHTML = `
    <select class="form-control rec-product-sel" onchange="onRecProductChange(this)" style="flex:2;min-width:120px">
      <option value="">اختر منتجاً (أو يدوي)</option>
      ${productOptions}
    </select>
    <input type="text" class="form-control rec-item-name" placeholder="اسم الصنف" value="${item?.name || ''}" style="flex:2;min-width:100px" oninput="updateRecurringTotal()" />
    <input type="number" class="form-control rec-item-price" placeholder="السعر" value="${item?.price || ''}" min="0" style="flex:1;min-width:80px" oninput="updateRecurringTotal()" />
    <input type="number" class="form-control rec-item-qty" placeholder="الكمية" value="${item?.qty || 1}" min="1" style="flex:0.7;min-width:60px" oninput="updateRecurringTotal()" />
    <span class="rec-item-sub" style="min-width:70px;font-weight:700;color:var(--primary-light);text-align:center;align-self:center">0 ج</span>
    <button type="button" class="btn-icon" onclick="this.parentElement.remove();updateRecurringTotal()" title="حذف السطر">🗑️</button>
  `;
  container.appendChild(row);
  updateRecurringTotal();
}

function onRecProductChange(sel) {
  const row = sel.closest('.rec-item-row');
  if (!row) return;
  const productId = parseInt(sel.value);
  const p = store.products.find(p => p.id === productId);
  if (p) {
    row.querySelector('.rec-item-name').value = p.name;
    row.querySelector('.rec-item-price').value = p.sellPrice;
  }
  updateRecurringTotal();
}

function updateRecurringTotal() {
  const rows = document.querySelectorAll('#recItemsContainer .rec-item-row');
  let total = 0;
  rows.forEach(row => {
    const price = parseFloat(row.querySelector('.rec-item-price')?.value) || 0;
    const qty   = parseFloat(row.querySelector('.rec-item-qty')?.value) || 1;
    const sub   = price * qty;
    const subEl = row.querySelector('.rec-item-sub');
    if (subEl) subEl.textContent = sub.toFixed(2) + ' ج';
    total += sub;
  });
  const totalEl = document.getElementById('recTotalDisplay');
  if (totalEl) totalEl.textContent = total.toFixed(2) + ' ج';
}

function calcNextDueDate(fromDate, frequency) {
  const d = new Date(fromDate);
  if (frequency === 'daily')   d.setDate(d.getDate() + 1);
  if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  if (frequency === 'yearly')  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

function saveRecurring() {
  initRecurringInvoices();
  const name      = document.getElementById('recName')?.value.trim();
  const custId    = parseInt(document.getElementById('recCustomer')?.value) || null;
  const frequency = document.getElementById('recFrequency')?.value;
  const startDate = document.getElementById('recStartDate')?.value;
  const endDate   = document.getElementById('recEndDate')?.value || null;
  const notes     = document.getElementById('recNotes')?.value.trim() || '';

  if (!name)      { showToast('أدخل اسم الفاتورة المتكررة', 'error'); return; }
  if (!startDate) { showToast('حدد تاريخ البدء', 'error'); return; }

  const rows = document.querySelectorAll('#recItemsContainer .rec-item-row');
  const items = [];
  rows.forEach(row => {
    const productId = parseInt(row.querySelector('.rec-product-sel')?.value) || null;
    const itemName  = row.querySelector('.rec-item-name')?.value.trim();
    const price     = parseFloat(row.querySelector('.rec-item-price')?.value) || 0;
    const qty       = parseInt(row.querySelector('.rec-item-qty')?.value) || 1;
    if (itemName && price > 0) {
      items.push({ productId, name: itemName, price, qty, subtotal: price * qty });
    }
  });

  if (!items.length) { showToast('أضف صنفاً واحداً على الأقل', 'error'); return; }

  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const customer = custId ? store.customers.find(c => c.id === custId) : null;

  const data = {
    name, customerId: custId, customerName: customer?.name || 'عميل عام',
    frequency, startDate, endDate, notes, items, total,
    active: true,
    nextDueDate: startDate,
    lastGeneratedDate: null,
    generatedCount: 0,
  };

  if (editingRecurringId) {
    const idx = store.recurringInvoices.findIndex(r => r.id === editingRecurringId);
    if (idx !== -1) store.recurringInvoices[idx] = { ...store.recurringInvoices[idx], ...data };
    showToast('✅ تم تحديث الفاتورة المتكررة', 'success');
  } else {
    data.id = store.nextRecurringId++;
    store.recurringInvoices.push(data);
    showToast('✅ تمت إضافة الفاتورة المتكررة', 'success');
  }

  saveData();
  closeRecurringModal();
  renderRecurringInvoices();
}

function toggleRecurring(id) {
  const r = store.recurringInvoices.find(r => r.id === id);
  if (!r) return;
  r.active = !r.active;
  saveData();
  renderRecurringInvoices();
  showToast(r.active ? '✅ تم تفعيل الفاتورة المتكررة' : '⏸️ تم إيقاف الفاتورة المتكررة', 'info');
}

function deleteRecurring(id) {
  if (!confirm('هل تريد حذف هذه الفاتورة المتكررة؟')) return;
  store.recurringInvoices = store.recurringInvoices.filter(r => r.id !== id);
  saveData();
  renderRecurringInvoices();
  showToast('🗑️ تم حذف الفاتورة المتكررة', 'info');
}

function generateRecurringNow(id) {
  const r = store.recurringInvoices.find(r => r.id === id);
  if (!r) return;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const time  = now.toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'});
  const subtotal = r.items.reduce((a, i) => a + i.subtotal, 0);

  const newSale = {
    id: store.nextInvoiceNo++,
    date: today, time,
    customerId: r.customerId || null,
    customerName: r.customerName || 'عميل عام',
    items: r.items.map(i => ({ ...i })),
    subtotal, discount: 0, total: subtotal,
    paymentMethod: 'cash',
    recurringId: r.id,
    isRecurring: true,
  };
  store.sales.push(newSale);

  if (r.customerId) {
    const c = store.customers.find(c => c.id === r.customerId);
    if (c) { c.totalPurchases = (c.totalPurchases || 0) + subtotal; c.visitCount = (c.visitCount || 0) + 1; }
  }

  r.lastGeneratedDate = today;
  r.generatedCount    = (r.generatedCount || 0) + 1;
  r.nextDueDate       = calcNextDueDate(today, r.frequency);
  if (r.endDate && r.nextDueDate > r.endDate) r.active = false;

  saveData();
  renderRecurringInvoices();
  renderSales();
  renderDashboard();
  buildNotifications();
  showToast(`✅ تم توليد الفاتورة #${newSale.id} بقيمة ${subtotal.toFixed(2)} ج`, 'success');
}

function checkDueRecurringInvoices() {
  if (!store.recurringInvoices) return;
  const today = new Date().toISOString().split('T')[0];
  let generated = 0;

  store.recurringInvoices.forEach(r => {
    if (!r.active) return;
    if (!r.nextDueDate || r.nextDueDate > today) return;
    if (r.endDate && today > r.endDate) { r.active = false; return; }

    const now  = new Date();
    const time = now.toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'});
    const subtotal = r.items.reduce((a, i) => a + i.subtotal, 0);

    store.sales.push({
      id: store.nextInvoiceNo++,
      date: r.nextDueDate, time,
      customerId: r.customerId || null,
      customerName: r.customerName || 'عميل عام',
      items: r.items.map(i => ({ ...i })),
      subtotal, discount: 0, total: subtotal,
      paymentMethod: 'cash',
      recurringId: r.id,
      isRecurring: true,
    });

    if (r.customerId) {
      const c = store.customers.find(c => c.id === r.customerId);
      if (c) { c.totalPurchases = (c.totalPurchases || 0) + subtotal; c.visitCount = (c.visitCount || 0) + 1; }
    }

    r.lastGeneratedDate = r.nextDueDate;
    r.generatedCount    = (r.generatedCount || 0) + 1;
    r.nextDueDate       = calcNextDueDate(r.nextDueDate, r.frequency);
    if (r.endDate && r.nextDueDate > r.endDate) r.active = false;
    generated++;
  });

  if (generated > 0) {
    saveData();
    buildNotifications();
    showToast(`🔄 تم توليد ${generated} فاتورة متكررة تلقائياً`, 'success');
  }
}

// ==================== HOLD INVOICES (تعليق الفواتير) ====================

function updateHeldBadge() {
  const count = (store.heldInvoices || []).length;
  const badge = document.getElementById('heldInvoicesBadge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline-flex' : 'none'; }
}

function holdCurrentInvoice() {
  if (!cart.length) { showToast('السلة فارغة، لا يوجد ما يمكن تعليقه!', 'error'); return; }
  if (!store.heldInvoices) store.heldInvoices = [];
  if (!store.nextHeldId)   store.nextHeldId = 1;

  const customerId = document.getElementById('cartCustomer')?.value;
  const customer   = customerId ? store.customers.find(c => c.id == customerId) : null;
  const discVal    = parseFloat(document.getElementById('discountAmount')?.value || 0) || 0;
  const discType   = document.getElementById('discountType')?.value || 'fixed';
  const subtotal   = cart.reduce((a, i) => a + i.subtotal, 0);
  const discount   = discType === 'percent' ? (subtotal * discVal / 100) : discVal;
  const total      = Math.max(0, subtotal - discount);
  const split      = getPaySplit();
  const now        = new Date();

  store.heldInvoices.push({
    id: store.nextHeldId++,
    heldAt: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    heldDate: now.toISOString().split('T')[0],
    customerId: customer?.id || null,
    customerName: customer?.name || 'بدون عميل',
    items: [...cart],
    discountAmount: discVal,
    discountType: discType,
    subtotal, discount, total,
    paymentSplit: split,
    warehouseId: selectedWarehouseId
  });

  saveData();
  clearCart();
  updateHeldBadge();
  showToast(`⏸️ تم تعليق الفاتورة (${total.toFixed(2)} ج) — يمكنك استرجاعها من زر الفواتير المعلقة`, 'info');
}

function openHeldInvoicesModal() {
  renderHeldInvoices();
  document.getElementById('heldInvoicesModal')?.classList.add('show');
}

function closeHeldInvoicesModal() {
  document.getElementById('heldInvoicesModal')?.classList.remove('show');
}

function renderHeldInvoices() {
  const list = store.heldInvoices || [];
  const body = document.getElementById('heldInvoicesList');
  if (!body) return;
  if (!list.length) {
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">⏸️ لا توجد فواتير معلقة حالياً</div>';
    return;
  }
  body.innerHTML = list.map(h => `
    <div class="held-invoice-card">
      <div class="held-invoice-info">
        <div class="held-invoice-customer">👤 ${h.customerName}</div>
        <div class="held-invoice-meta">🕐 ${h.heldAt} · ${h.items.length} صنف · <strong>${h.total.toFixed(2)} ج</strong></div>
        <div class="held-invoice-items">${h.items.map(i => `${i.name} ×${i.qty}`).join(' · ')}</div>
      </div>
      <div class="held-invoice-actions">
        <button class="btn-primary" onclick="restoreHeldInvoice(${h.id})" style="padding:8px 16px;font-size:12px">▶️ استرجاع</button>
        <button class="btn-icon-delete" onclick="deleteHeldInvoice(${h.id})" title="حذف">🗑️</button>
      </div>
    </div>`).join('');
}

function restoreHeldInvoice(id) {
  const h = (store.heldInvoices || []).find(h => h.id === id);
  if (!h) return;
  if (cart.length > 0) {
    if (!confirm('السلة الحالية بها منتجات. هل تريد استبدالها بالفاتورة المعلقة؟')) return;
  }
  // Restore cart
  cart = h.items.map(i => ({ ...i }));
  // Restore customer
  const custSel = document.getElementById('cartCustomer');
  if (custSel && h.customerId) custSel.value = h.customerId;
  // Restore discount
  const discEl = document.getElementById('discountAmount');
  const discTypeEl = document.getElementById('discountType');
  if (discEl) discEl.value = h.discountAmount || 0;
  if (discTypeEl) discTypeEl.value = h.discountType || 'fixed';
  // Restore payment split
  if (h.paymentSplit) {
    Object.entries(h.paymentSplit).forEach(([m, v]) => {
      const el = document.getElementById(`pay-${m}-amount`);
      if (el) el.value = v;
    });
  }
  // Remove from held
  store.heldInvoices = store.heldInvoices.filter(x => x.id !== id);
  saveData();
  closeHeldInvoicesModal();
  renderCart();
  updateCartTotals();
  updateHeldBadge();
  showToast('✅ تم استرجاع الفاتورة المعلقة', 'success');
}

function deleteHeldInvoice(id) {
  if (!confirm('هل تريد حذف هذه الفاتورة المعلقة نهائياً؟')) return;
  store.heldInvoices = (store.heldInvoices || []).filter(h => h.id !== id);
  saveData();
  renderHeldInvoices();
  updateHeldBadge();
  showToast('🗑️ تم حذف الفاتورة المعلقة', 'info');
}

// ==================== PURCHASE INVOICES (فواتير المشتريات) ====================

function renderPurchaseInvoices() {
  if (!store.purchaseInvoices) store.purchaseInvoices = [];
  const list = store.purchaseInvoices;
  const tbody = document.getElementById('purchaseInvoicesBody');
  if (!tbody) return;

  // KPIs
  const totalCount  = list.length;
  const totalAmount = list.reduce((a, p) => a + (p.total || 0), 0);
  const unpaid      = list.filter(p => p.payStatus === 'unpaid').length;
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('piTotalCount',  totalCount);
  setEl('piTotalAmount', totalAmount.toLocaleString('ar-EG') + ' ج');
  setEl('piUnpaidCount', unpaid);

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">📋 لا توجد فواتير مشتريات مسجلة</td></tr>';
    return;
  }
  const payLabels = { paid: '✅ مدفوع', partial: '🔶 جزئي', unpaid: '❌ آجل' };
  const payColors = { paid: 'badge-success', partial: 'badge-warning', unpaid: 'badge-danger' };
  tbody.innerHTML = list.slice().reverse().map(p => {
    const supplier = store.suppliers.find(s => s.id === p.supplierId);
    return `<tr>
      <td><span class="badge badge-primary">#${p.id}</span></td>
      <td style="font-size:12px">${p.date}</td>
      <td style="font-weight:700">${supplier?.name || p.supplierName || '—'}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${p.refNo || '—'}</td>
      <td>${p.items?.length || 0} صنف</td>
      <td style="font-weight:800;color:var(--primary-light)">${(p.total||0).toFixed(2)} ج</td>
      <td><span class="badge ${payColors[p.payStatus]||'badge-info'}">${payLabels[p.payStatus]||p.payStatus}</span></td>
      <td>
        <div style="display:flex;gap:5px;justify-content:center">
          <button class="btn-icon" onclick="viewPurchaseInvoice(${p.id})" title="عرض">👁️</button>
          <button class="btn-icon-delete" onclick="deletePurchaseInvoice(${p.id})" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openPurchaseInvoiceModal(id) {
  editingPurchaseInvId = id || null;
  const modal = document.getElementById('purchaseInvoiceModal');
  if (!modal) return;

  // Populate suppliers
  const supSel = document.getElementById('piSupplier');
  if (supSel) {
    supSel.innerHTML = '<option value="">اختر المورد</option>' +
      (store.suppliers || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
  document.getElementById('piDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('piRefNo').value = '';
  document.getElementById('piNotes').value = '';
  document.getElementById('piPayStatus').value = 'paid';
  document.getElementById('piItemsContainer').innerHTML = '';
  document.getElementById('piTotalDisplay').textContent = '0 ج';
  document.getElementById('piModalTitle').textContent = '➕ فاتورة مشتريات جديدة';

  if (id) {
    const p = (store.purchaseInvoices || []).find(p => p.id === id);
    if (!p) return;
    document.getElementById('piModalTitle').textContent = `✏️ تعديل فاتورة مشتريات #${p.id}`;
    if (supSel) supSel.value = p.supplierId || '';
    document.getElementById('piDate').value = p.date;
    document.getElementById('piRefNo').value = p.refNo || '';
    document.getElementById('piNotes').value = p.notes || '';
    document.getElementById('piPayStatus').value = p.payStatus || 'paid';
    (p.items || []).forEach(item => addPurchaseInvoiceItemRow(item));
    updatePurchaseInvoiceTotal();
  } else {
    addPurchaseInvoiceItemRow(null);
  }
  modal.classList.add('show');
}

function closePurchaseInvoiceModal() {
  document.getElementById('purchaseInvoiceModal')?.classList.remove('show');
  editingPurchaseInvId = null;
}

function addPurchaseInvoiceItemRow(item) {
  const container = document.getElementById('piItemsContainer');
  if (!container) return;
  const productOptions = (store.products || []).map(p =>
    `<option value="${p.id}" data-cost="${p.costPrice||0}"${item && item.productId === p.id ? ' selected' : ''}>${p.name}</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'rec-item-row';
  row.innerHTML = `
    <select class="form-control pi-product-sel" onchange="onPiProductChange(this)" style="flex:2;min-width:120px">
      <option value="">اختر منتج أو يدوي</option>${productOptions}
    </select>
    <input type="text" class="form-control pi-item-name" placeholder="اسم الصنف" value="${item?.name||''}" style="flex:2;min-width:100px" oninput="updatePurchaseInvoiceTotal()"/>
    <input type="number" class="form-control pi-item-cost" placeholder="تكلفة الوحدة" value="${item?.cost||''}" min="0" style="flex:1;min-width:80px" oninput="updatePurchaseInvoiceTotal()"/>
    <input type="number" class="form-control pi-item-qty" placeholder="الكمية" value="${item?.qty||1}" min="1" style="flex:0.7;min-width:60px" oninput="updatePurchaseInvoiceTotal()"/>
    <span class="rec-item-sub" style="min-width:70px;font-weight:700;color:var(--primary-light);text-align:center;align-self:center">0 ج</span>
    <button type="button" class="btn-icon" onclick="this.parentElement.remove();updatePurchaseInvoiceTotal()" title="حذف">🗑️</button>`;
  container.appendChild(row);
  updatePurchaseInvoiceTotal();
}

function onPiProductChange(sel) {
  const row = sel.closest('.rec-item-row');
  if (!row) return;
  const p = store.products.find(p => p.id === parseInt(sel.value));
  if (p) {
    row.querySelector('.pi-item-name').value = p.name;
    row.querySelector('.pi-item-cost').value = p.costPrice || 0;
  }
  updatePurchaseInvoiceTotal();
}

function updatePurchaseInvoiceTotal() {
  const rows = document.querySelectorAll('#piItemsContainer .rec-item-row');
  let total = 0;
  rows.forEach(row => {
    const cost = parseFloat(row.querySelector('.pi-item-cost')?.value) || 0;
    const qty  = parseFloat(row.querySelector('.pi-item-qty')?.value) || 1;
    const sub  = cost * qty;
    const subEl = row.querySelector('.rec-item-sub');
    if (subEl) subEl.textContent = sub.toFixed(2) + ' ج';
    total += sub;
  });
  const el = document.getElementById('piTotalDisplay');
  if (el) el.textContent = total.toFixed(2) + ' ج';
}

function savePurchaseInvoice() {
  const supplierId = parseInt(document.getElementById('piSupplier')?.value) || null;
  const date       = document.getElementById('piDate')?.value;
  const refNo      = document.getElementById('piRefNo')?.value.trim();
  const notes      = document.getElementById('piNotes')?.value.trim();
  const payStatus  = document.getElementById('piPayStatus')?.value || 'paid';

  if (!date) { showToast('حدد تاريخ الفاتورة', 'error'); return; }

  const rows = document.querySelectorAll('#piItemsContainer .rec-item-row');
  const items = [];
  rows.forEach(row => {
    const productId = parseInt(row.querySelector('.pi-product-sel')?.value) || null;
    const name = row.querySelector('.pi-item-name')?.value.trim();
    const cost = parseFloat(row.querySelector('.pi-item-cost')?.value) || 0;
    const qty  = parseInt(row.querySelector('.pi-item-qty')?.value) || 1;
    if (name && cost >= 0 && qty > 0) items.push({ productId, name, cost, qty, subtotal: cost * qty });
  });
  if (!items.length) { showToast('أضف صنفاً واحداً على الأقل', 'error'); return; }

  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const supplier = supplierId ? store.suppliers.find(s => s.id === supplierId) : null;

  const data = {
    supplierId, supplierName: supplier?.name || '',
    date, refNo, notes, payStatus, items, total
  };

  if (editingPurchaseInvId) {
    const idx = store.purchaseInvoices.findIndex(p => p.id === editingPurchaseInvId);
    if (idx !== -1) store.purchaseInvoices[idx] = { ...store.purchaseInvoices[idx], ...data };
    showToast('✅ تم تحديث فاتورة المشتريات', 'success');
  } else {
    data.id = store.nextPurchaseInvId++;
    store.purchaseInvoices.push(data);
    // Update stock for each item
    items.forEach(item => {
      if (item.productId) {
        const p = store.products.find(p => p.id === item.productId);
        if (p) {
          p.stock = (p.stock || 0) + item.qty;
          if (p.warehouseStocks && selectedWarehouseId) {
            p.warehouseStocks[selectedWarehouseId] = (p.warehouseStocks[selectedWarehouseId] || 0) + item.qty;
          }
        }
      }
    });
    showToast('✅ تم حفظ فاتورة المشتريات وتحديث المخزون', 'success');
  }

  saveData();
  closePurchaseInvoiceModal();
  renderPurchaseInvoices();
  renderInventory();
}

function deletePurchaseInvoice(id) {
  if (!confirm('هل تريد حذف فاتورة المشتريات هذه؟')) return;
  store.purchaseInvoices = (store.purchaseInvoices || []).filter(p => p.id !== id);
  saveData();
  renderPurchaseInvoices();
  showToast('🗑️ تم حذف فاتورة المشتريات', 'info');
}

function viewPurchaseInvoice(id) {
  const p = (store.purchaseInvoices || []).find(p => p.id === id);
  if (!p) return;
  const payLabels = { paid: '✅ مدفوع', partial: '🔶 جزئي', unpaid: '❌ آجل' };
  const html = `
    <div style="padding:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;font-size:13px">
        <div><strong>المورد:</strong> ${p.supplierName || '—'}</div>
        <div><strong>التاريخ:</strong> ${p.date}</div>
        <div><strong>رقم الفاتورة:</strong> ${p.refNo || '—'}</div>
        <div><strong>حالة الدفع:</strong> ${payLabels[p.payStatus]||p.payStatus}</div>
      </div>
      <table class="data-table full-table">
        <thead><tr><th>الصنف</th><th>التكلفة</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
        <tbody>${(p.items||[]).map(i=>`<tr><td>${i.name}</td><td>${i.cost.toFixed(2)} ج</td><td>${i.qty}</td><td>${i.subtotal.toFixed(2)} ج</td></tr>`).join('')}</tbody>
      </table>
      <div style="text-align:left;margin-top:14px;font-size:18px;font-weight:800;color:var(--primary-light)">الإجمالي: ${(p.total||0).toFixed(2)} ج</div>
      ${p.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">ملاحظات: ${p.notes}</div>` : ''}
    </div>`;
  const modal = document.getElementById('purchaseInvoiceViewModal');
  const body  = document.getElementById('purchaseInvoiceViewBody');
  if (body) body.innerHTML = html;
  if (modal) modal.classList.add('show');
}

function closePurchaseInvoiceViewModal() {
  document.getElementById('purchaseInvoiceViewModal')?.classList.remove('show');
}

// ==================== STOCK ADJUSTMENTS (لجنة الجرد) ====================

function renderStockAdjustments() {
  renderStockAdjustForm();
  renderStockAdjustHistory();
}

function renderStockAdjustForm() {
  const tbody = document.getElementById('adjTableBody');
  if (!tbody) return;
  // Populate warehouse selector
  const whSel = document.getElementById('adjWarehouse');
  if (whSel) {
    const whId = parseInt(whSel.value) || (store.warehouses?.[0]?.id) || 1;
    whSel.innerHTML = (store.warehouses || []).map(w =>
      `<option value="${w.id}" ${w.id === whId ? 'selected' : ''}>${w.name}</option>`
    ).join('');
  }
  const warehouseId = parseInt(document.getElementById('adjWarehouse')?.value) || (store.warehouses?.[0]?.id) || 1;
  const searchQ = (document.getElementById('adjSearch')?.value || '').toLowerCase().trim();

  let products = store.products || [];
  if (searchQ) {
    products = products.filter(p =>
      p.name.toLowerCase().includes(searchQ) ||
      (p.barcode || '').toLowerCase().includes(searchQ) ||
      (p.category || '').toLowerCase().includes(searchQ)
    );
  }

  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('adjTotalProducts', (store.products || []).length);
  setEl('adjFilteredCount', products.length);
  setEl('adjTotalCountDisplay', (store.products || []).length);

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">لا توجد منتجات' + (searchQ ? ' تطابق البحث' : '') + '</td></tr>';
    setEl('adjModifiedCount', 0);
    setEl('adjNetDiff', 0);
    return;
  }

  tbody.innerHTML = products.map((p, i) => {
    const currentStock = (p.warehouseStocks && p.warehouseStocks[warehouseId] !== undefined) ? p.warehouseStocks[warehouseId] : p.stock;
    return `
    <tr>
      <td style="color:var(--text-muted);font-size:11px">${i + 1}</td>
      <td style="font-weight:600">${p.name}</td>
      <td style="font-size:11px;color:var(--text-secondary)">${p.category || '—'}</td>
      <td style="text-align:center;font-weight:700;color:${currentStock <= 0 ? 'var(--danger)' : 'var(--success)'}" id="adj-sys-${p.id}">${currentStock}</td>
      <td style="text-align:center">
        <input type="number" class="form-control adj-actual" data-product-id="${p.id}"
          data-sys="${currentStock}" placeholder="الفعلي" min="0"
          style="width:100px;text-align:center;padding:6px 8px;font-size:13px;font-weight:700"
          oninput="onAdjInput(this)" />
      </td>
      <td style="text-align:center;font-weight:800;font-size:14px" id="adj-diff-${p.id}">—</td>
    </tr>`;
  }).join('');

  updateAdjKPIs();
}

function onAdjInput(input) {
  const productId = input.dataset.productId;
  const sysQty = parseInt(input.dataset.sys) || 0;
  const actual = parseFloat(input.value);
  const diffEl = document.getElementById(`adj-diff-${productId}`);
  if (!diffEl) return;
  if (isNaN(actual)) {
    diffEl.textContent = '—';
    diffEl.style.color = 'var(--text-muted)';
  } else {
    const diff = actual - sysQty;
    diffEl.textContent = (diff >= 0 ? '+' : '') + diff;
    diffEl.style.color = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--text-muted)';
  }
  updateAdjKPIs();
}

function updateAdjKPIs() {
  const inputs = document.querySelectorAll('#adjTableBody .adj-actual');
  let modified = 0;
  let netDiff = 0;
  inputs.forEach(inp => {
    const actual = parseFloat(inp.value);
    if (isNaN(actual)) return;
    modified++;
    const sysQty = parseInt(inp.dataset.sys) || 0;
    netDiff += (actual - sysQty);
  });
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('adjModifiedCount', modified);
  setEl('adjNetDiff', (netDiff >= 0 ? '+' : '') + netDiff);
  const diffEl = document.getElementById('adjNetDiff');
  if (diffEl) {
    diffEl.style.color = netDiff > 0 ? 'var(--success)' : netDiff < 0 ? 'var(--danger)' : 'var(--text-primary)';
  }
}

function resetAdjForm() {
  const searchEl = document.getElementById('adjSearch');
  if (searchEl) searchEl.value = '';
  document.getElementById('adjNotes').value = '';
  renderStockAdjustForm();
}

function confirmAdjustment() {
  const notes = document.getElementById('adjNotes')?.value.trim() || 'تسوية جردية';
  const warehouseId = parseInt(document.getElementById('adjWarehouse')?.value) || (store.warehouses?.[0]?.id) || 1;
  const warehouseName = store.warehouses?.find(w => w.id === warehouseId)?.name || '';

  const inputs = document.querySelectorAll('#adjTableBody .adj-actual');
  const items = [];
  inputs.forEach(input => {
    const actual = parseFloat(input.value);
    if (isNaN(actual)) return;
    const productId = parseInt(input.dataset.productId);
    const sysQty = parseInt(input.dataset.sys) || 0;
    const p = store.products.find(p => p.id === productId);
    if (!p) return;
    const diff = actual - sysQty;
    items.push({ productId, productName: p.name, systemQty: sysQty, actualQty: actual, diff });
    // Apply adjustment to the selected warehouse
    if (!p.warehouseStocks) p.warehouseStocks = {};
    p.warehouseStocks[warehouseId] = Math.max(0, actual);
    p.stock = Object.values(p.warehouseStocks).reduce((a, b) => a + (b || 0), 0);
  });

  if (!items.length) { showToast('لم تُدخل أي كميات فعلية للتسوية', 'error'); return; }

  const now = new Date();
  if (!store.stockAdjustments) store.stockAdjustments = [];
  store.stockAdjustments.push({
    id: store.nextAdjustId++,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    warehouseId, warehouseName, notes, items,
    userId: currentUser?.id || null,
    userName: currentUser?.name || 'النظام'
  });

  saveData();
  renderStockAdjustments();
  renderInventory();
  showToast(`✅ تم حفظ التسوية الجردية (${items.length} منتج) للفرع "${warehouseName}"`, 'success');
}

function renderStockAdjustHistory() {
  if (!store.stockAdjustments) store.stockAdjustments = [];
  const list = store.stockAdjustments;
  const tbody = document.getElementById('adjustmentsBody');
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">📦 لا توجد تسويات جردية مسجلة</td></tr>';
    return;
  }
  tbody.innerHTML = list.slice().reverse().map(a => {
    const netDiff = (a.items || []).reduce((s, i) => s + (i.diff || 0), 0);
    return `
    <tr>
      <td><span class="badge badge-primary">#${a.id}</span></td>
      <td style="font-size:12px">${a.date}<br><span style="color:var(--text-muted)">${a.time||''}</span></td>
      <td style="font-weight:700">${a.notes || 'تسوية جردية'}</td>
      <td>${a.items?.length || 0} منتج</td>
      <td style="font-weight:800;color:${netDiff > 0 ? 'var(--success)' : netDiff < 0 ? 'var(--danger)' : 'var(--text-muted)'}">${netDiff >= 0 ? '+' : ''}${netDiff}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${a.warehouseName || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${a.userName || '—'}</td>
      <td><button class="btn-icon" onclick="viewAdjustment(${a.id})" title="عرض">👁️</button></td>
    </tr>`;
  }).join('');
}

function viewAdjustment(id) {
  const a = (store.stockAdjustments || []).find(a => a.id === id);
  if (!a) return;
  const netDiff = (a.items || []).reduce((s, i) => s + (i.diff || 0), 0);
  const html = `
    <div style="padding:16px">
      <div style="display:flex;gap:16px;font-size:13px;margin-bottom:14px;flex-wrap:wrap">
        <span><strong>التاريخ:</strong> ${a.date} ${a.time||''}</span>
        <span><strong>الفرع:</strong> ${a.warehouseName || '—'}</span>
        <span><strong>بواسطة:</strong> ${a.userName||'—'}</span>
        <span><strong>صافي الفرق:</strong> <span style="font-weight:800;color:${netDiff > 0 ? 'var(--success)' : netDiff < 0 ? 'var(--danger)' : 'var(--text-muted)'}">${netDiff >= 0 ? '+' : ''}${netDiff}</span></span>
      </div>
      <div style="margin-bottom:14px;padding:10px 14px;background:var(--bg-input);border-radius:8px;font-size:12px;color:var(--text-secondary)">${a.notes||'لا توجد ملاحظات'}</div>
      <table class="data-table full-table">
        <thead><tr><th>المنتج</th><th>المخزون السابق</th><th>الفعلي</th><th>الفرق</th></tr></thead>
        <tbody>${(a.items||[]).map(i=>`
          <tr>
            <td>${i.productName}</td>
            <td style="text-align:center">${i.systemQty}</td>
            <td style="text-align:center;font-weight:700">${i.actualQty}</td>
            <td style="text-align:center;font-weight:800;color:${i.diff>0?'var(--success)':i.diff<0?'var(--danger)':'var(--text-muted)'}">${i.diff>=0?'+':''}${i.diff}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  const modal = document.getElementById('adjustViewModal');
  const body  = document.getElementById('adjustViewBody');
  if (body) body.innerHTML = html;
  if (modal) modal.classList.add('show');
}

function closeAdjustViewModal() {
  document.getElementById('adjustViewModal')?.classList.remove('show');
}

// ==================== TREASURY MANAGEMENT ====================
let editingTreasuryId = null;

function renderTreasuries() {
  const body = document.getElementById('treasuriesTableBody');
  if (!body) return;
  const treasuries = store.treasuries || [];
  // Update KPIs
  const countEl = document.getElementById('treasuriesTotalCount');
  if (countEl) countEl.textContent = treasuries.length;
  const balanceEl = document.getElementById('treasuriesTotalBalance');
  if (balanceEl) balanceEl.textContent = treasuries.reduce((s, t) => s + (t.balance || 0), 0).toFixed(2) + ' ج';

  if (!treasuries.length) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">لا توجد خزن. أضف خزنة جديدة.</td></tr>';
    return;
  }
  body.innerHTML = treasuries.map(t => {
    const typeLabel = t.type === 'bank' ? '<span class="treasury-badge-bank">🏦 بنكي</span>' : '<span class="treasury-badge-cash">💰 نقدي</span>';
    const bankInfo = t.type === 'bank' ? `${t.bankName || ''} ${t.accountNumber ? '· ' + t.accountNumber : ''}` : '—';
    const methods = (t.activeMethods || ['cash']).map(m => {
      const labels = { cash:'💵', card:'💳', wallet:'📱', instapay:'⚡' };
      return `<span class="treasury-method-tag">${labels[m] || ''} ${m}</span>`;
    }).join('');
    return `
    <tr>
      <td style="font-weight:700">${t.name} ${t.isDefault ? '<span style="font-size:10px;color:var(--text-muted)">(الافتراضية)</span>' : ''}</td>
      <td>${typeLabel}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${bankInfo}</td>
      <td>${methods}</td>
      <td style="text-align:center;font-weight:800;font-size:15px;color:${(t.balance||0) >= 0 ? 'var(--success)' : 'var(--danger)'}">${(t.balance||0).toFixed(2)} ج</td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center">
          <button class="btn-icon-edit" onclick="openTreasuryModal(${t.id})" title="تعديل">✏️</button>
          <button class="btn-icon-delete" onclick="deleteTreasury(${t.id})" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  // Refresh transaction filter
  populateTreasuryTxFilter();
}

function populateTreasuryTxFilter() {
  const sel = document.getElementById('treasuryTransactionFilter');
  if (!sel) return;
  const treasuries = store.treasuries || [];
  sel.innerHTML = treasuries.map(t => `<option value="${t.id}">${t.name} (${(t.balance||0).toFixed(2)} ج)</option>`).join('');
  renderTreasuryTransactions();
}

function renderTreasuryTransactions() {
  const body = document.getElementById('treasuryTransactionsBody');
  if (!body) return;
  const filterId = parseInt(document.getElementById('treasuryTransactionFilter')?.value) || 0;
  if (!filterId) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted)">اختر خزنة لعرض حركتها</td></tr>';
    return;
  }
  const treasury = (store.treasuries || []).find(t => t.id === filterId);
  let runningBalance = treasury ? (treasury.balance || 0) : 0;
  let txs = (store.treasuryTransactions || []).filter(tx => tx.treasuryId === filterId).slice().reverse();
  if (!txs.length) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted)">لا توجد حركات مالية لهذه الخزنة</td></tr>';
    return;
  }
  body.innerHTML = txs.map(tx => {
    const typeLabels = {
      inflow:'<span style="color:var(--success)">💰 إيداع</span>',
      outflow:'<span style="color:var(--danger)">💸 سحب</span>',
      sale:'<span style="color:var(--primary)">🛒 بيع</span>',
      expense:'<span style="color:var(--warning)">💸 مصروف</span>',
      transfer:'<span style="color:var(--info)">🔄 تحويل</span>'
    };
    const methodLabels = { cash:'💵', card:'💳', wallet:'📱', instapay:'⚡', transfer:'📱' };
    const isInflow = tx.type === 'inflow' || tx.type === 'sale';
    const amount = tx.amount || 0;
    if (isInflow) runningBalance -= amount; else runningBalance += amount;
    const rowBalance = runningBalance;
    return `
    <tr>
      <td style="font-size:11px;color:var(--text-secondary)">${tx.date || '—'}</td>
      <td>${typeLabels[tx.type] || tx.type}</td>
      <td style="font-size:12px">${methodLabels[tx.paymentMethod] || ''} ${tx.paymentMethod || '—'}</td>
      <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tx.description || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${tx.reference || '—'}</td>
      <td style="text-align:center;font-weight:700;color:var(--success)">${isInflow ? amount.toFixed(2) + ' ج' : '—'}</td>
      <td style="text-align:center;font-weight:700;color:var(--danger)">${!isInflow ? amount.toFixed(2) + ' ج' : '—'}</td>
      <td style="text-align:center;font-weight:800;color:${rowBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">${rowBalance.toFixed(2)} ج</td>
      <td style="text-align:center;font-size:11px;color:var(--text-muted)">${tx.createdBy || 'النظام'}</td>
    </tr>`;
  }).join('');
}

function openTreasuryModal(tId) {
  editingTreasuryId = tId || null;
  const modal = document.getElementById('treasuryModal');
  if (!modal) return;
  const titleEl = document.getElementById('treasuryModalTitle');
  if (titleEl) titleEl.textContent = tId ? '✏️ تعديل خزنة' : '➕ إضافة خزنة جديدة';
  if (tId) {
    const t = (store.treasuries || []).find(t => t.id === tId);
    if (!t) return;
    document.getElementById('trName').value = t.name;
    document.getElementById('trType').value = t.type;
    document.getElementById('trBankName').value = t.bankName || '';
    document.getElementById('trAccount').value = t.accountNumber || '';
    document.getElementById('trNotes').value = t.notes || '';
    document.getElementById('trBalance').value = '';
    document.getElementById('trBalance').disabled = true;
    const methods = t.activeMethods || ['cash'];
    document.getElementById('trMethodCash').checked = methods.includes('cash');
    document.getElementById('trMethodCard').checked = methods.includes('card');
    document.getElementById('trMethodWallet').checked = methods.includes('wallet');
    document.getElementById('trMethodInstapay').checked = methods.includes('instapay');
  } else {
    document.getElementById('trName').value = '';
    document.getElementById('trType').value = 'cash';
    document.getElementById('trBankName').value = '';
    document.getElementById('trAccount').value = '';
    document.getElementById('trNotes').value = '';
    document.getElementById('trBalance').value = '';
    document.getElementById('trBalance').disabled = false;
    document.getElementById('trMethodCash').checked = true;
    document.getElementById('trMethodCard').checked = false;
    document.getElementById('trMethodWallet').checked = false;
    document.getElementById('trMethodInstapay').checked = false;
  }
  toggleTreasuryBankFields();
  modal.classList.add('show');
}

function toggleTreasuryBankFields() {
  const type = document.getElementById('trType')?.value;
  const bankGroup = document.getElementById('trBankNameGroup');
  const accountGroup = document.getElementById('trAccountGroup');
  if (bankGroup) bankGroup.style.display = type === 'bank' ? 'flex' : 'none';
  if (accountGroup) accountGroup.style.display = type === 'bank' ? 'flex' : 'none';
}

function closeTreasuryModal() {
  document.getElementById('treasuryModal')?.classList.remove('show');
  editingTreasuryId = null;
}

function saveTreasury() {
  const name = document.getElementById('trName')?.value.trim();
  const type = document.getElementById('trType')?.value;
  const bankName = document.getElementById('trBankName')?.value.trim() || '';
  const accountNumber = document.getElementById('trAccount')?.value.trim() || '';
  const notes = document.getElementById('trNotes')?.value.trim() || '';
  const balance = parseFloat(document.getElementById('trBalance')?.value || 0) || 0;
  const methods = [];
  if (document.getElementById('trMethodCash')?.checked) methods.push('cash');
  if (document.getElementById('trMethodCard')?.checked) methods.push('card');
  if (document.getElementById('trMethodWallet')?.checked) methods.push('wallet');
  if (document.getElementById('trMethodInstapay')?.checked) methods.push('instapay');
  if (!name) { showToast('يرجى إدخال اسم الخزنة', 'error'); return; }
  if (!methods.length) { showToast('اختر وسيلة دفع واحدة على الأقل', 'error'); return; }

  if (editingTreasuryId) {
    const t = (store.treasuries || []).find(t => t.id === editingTreasuryId);
    if (t) {
      t.name = name;
      t.type = type;
      t.bankName = bankName;
      t.accountNumber = accountNumber;
      t.notes = notes;
      t.activeMethods = methods;
    }
    showToast('✅ تم تحديث الخزنة', 'success');
  } else {
    const newT = {
      id: store.nextTreasuryId++,
      name, type, bankName, accountNumber, notes,
      balance: type === 'cash' ? balance : balance,
      activeMethods: methods,
      isDefault: (store.treasuries || []).length === 0
    };
    store.treasuries.push(newT);
    // Log opening balance as inflow transaction
    if (balance > 0) {
      const now = new Date();
      store.treasuryTransactions.push({
        id: (store.treasuryTransactions || []).length + 1,
        treasuryId: newT.id,
        date: now.toISOString().split('T')[0],
        time: now.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' }),
        type: 'inflow',
        amount: balance,
        paymentMethod: type === 'cash' ? 'cash' : 'transfer',
        reference: 'رصيد افتتاحي',
        description: 'رصيد افتتاحي للخزنة',
        createdBy: currentUser?.name || 'النظام'
      });
    }
    showToast('✅ تم إضافة الخزنة بنجاح', 'success');
  }
  saveData();
  closeTreasuryModal();
  renderTreasuries();
}

function deleteTreasury(tId) {
  if (!confirm('هل تريد حذف هذه الخزنة؟')) return;
  store.treasuries = (store.treasuries || []).filter(t => t.id !== tId);
  saveData();
  renderTreasuries();
  showToast('تم حذف الخزنة', 'success');
}

// ==================== TREASURY TRANSACTIONS ====================
function openTreasuryTxModal() {
  const modal = document.getElementById('treasuryTxModal');
  if (!modal) return;
  const treasurySel = document.getElementById('txTreasury');
  if (treasurySel) {
    treasurySel.innerHTML = (store.treasuries || []).map(t =>
      `<option value="${t.id}">${t.name} (${(t.balance||0).toFixed(2)} ج)</option>`
    ).join('');
  }
  const txTypeEl = document.getElementById('txType'); if (txTypeEl) txTypeEl.value = 'inflow';
  const txAmtEl = document.getElementById('txAmount'); if (txAmtEl) txAmtEl.value = '';
  const txDescEl = document.getElementById('txDescription'); if (txDescEl) txDescEl.value = '';
  const txRefEl = document.getElementById('txReference'); if (txRefEl) txRefEl.value = '';
  modal.classList.add('show');
}

function closeTreasuryTxModal() {
  document.getElementById('treasuryTxModal')?.classList.remove('show');
}

function saveTreasuryTx() {
  const treasuryId = parseInt(document.getElementById('txTreasury')?.value);
  const type = document.getElementById('txType')?.value;
  const paymentMethod = document.getElementById('txMethod')?.value;
  const amount = parseFloat(document.getElementById('txAmount')?.value) || 0;
  const description = document.getElementById('txDescription')?.value.trim();
  const reference = document.getElementById('txReference')?.value.trim() || '';

  if (!treasuryId) { showToast('اختر الخزنة', 'error'); return; }
  if (amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'error'); return; }
  if (!description) { showToast('أدخل بيان الحركة', 'error'); return; }

  const treasury = (store.treasuries || []).find(t => t.id === treasuryId);
  if (!treasury) { showToast('الخزنة غير موجودة', 'error'); return; }

  const now = new Date();
  const tx = {
    id: (store.treasuryTransactions || []).length + 1,
    treasuryId,
    date: now.toISOString().split('T')[0],
    time: now.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' }),
    type,
    amount,
    paymentMethod,
    reference,
    description,
    createdBy: currentUser?.name || 'النظام'
  };
  if (!store.treasuryTransactions) store.treasuryTransactions = [];
  store.treasuryTransactions.push(tx);

  // Update treasury balance
  if (type === 'inflow') {
    treasury.balance = (treasury.balance || 0) + amount;
  } else {
    treasury.balance = (treasury.balance || 0) - amount;
  }

  saveData();
  closeTreasuryTxModal();
  renderTreasuries();
  showToast(`✅ تم تسجيل الحركة المالية (${type === 'inflow' ? 'وارد' : 'منصرف'})`, 'success');
}


