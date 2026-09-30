/**
 * Finance Tracker — Personal Financial Dashboard
 * - Dual Mode (Dark & Light) di Pengaturan
 * - Format Mata Uang (IDR, USD, EUR, SGD, MYR, JPY, GBP, AUD, SAR, KRW)
 * - Multi-Bahasa (Indonesia, English, Melayu, Jepang, Korea, Mandarin, Arab, Spanyol)
 * - Pengaturan Kata Sandi (PIN 6 Digit, Pola 3x3 Interaktif, atau Sidik Jari Biometrik)
 * - Download Laporan PDF Langsung Otomatis tanpa perlu Login Google
 * - Fitur "Cadangkan Transaksi Anda": Deteksi otomatis Akun Google di perangkat, wajib login terlebih dahulu,
 *   lalu berjalan otomatis di belakang layar ke Google Drive agar saat ganti perangkat tidak mulai dari 0.
 */

const LEGACY_KEYS = [
  'family_finance_transactions_v1',
  'family_finance_budgets_v1',
  'family_finance_filter_v1',
  'family_finance_transactions_v2',
  'family_finance_budgets_v2',
  'finance_tracker_meta_v3',
  'finance_tracker_transactions_v3',
  'finance_tracker_budgets_v3',
  'finance_tracker_meta_v4',
  'finance_tracker_wallets_v4'
];

const STORAGE_KEYS = {
  META: 'finance_tracker_meta_v5',
  TRANSACTIONS: 'finance_tracker_transactions_v4',
  BUDGETS: 'finance_tracker_budgets_v4',
  CUSTOM_CATEGORIES: 'finance_tracker_custom_cats_v4',
  WALLETS: 'finance_tracker_wallets_v5',
  GOOGLE_ACCOUNT: 'finance_tracker_google_acc_v5',
  DEVICE_GOOGLE_ACCOUNTS: 'finance_tracker_device_google_accs_v6',
  DRIVE_BACKUPS: 'finance_tracker_drive_backups_v6',
  DRIVE_CLOUD_SNAPSHOTS: 'finance_tracker_cloud_snapshots_v6',
  PREFERENCES: 'finance_tracker_prefs_v6',
  SECURITY: 'finance_tracker_security_v6'
};

let state = {
  activeTab: 'dashboard', // 'dashboard' | 'wallets' | 'income' | 'expense' | 'savings' | 'history' | 'settings'
  theme: 'dark', // 'dark' | 'light'
  currency: 'IDR', // key in CURRENCIES
  language: 'id', // key in I18N_TRANSLATIONS
  firstOpenedYear: new Date().getFullYear(),
  firstOpenedMonth: new Date().getMonth(),
  selectedMonth: new Date().getMonth(),
  selectedYear: new Date().getFullYear(),
  transactions: [],
  budgets: {},
  customCategories: {
    Income: [],
    Expense: [],
    Savings: []
  },
  wallets: [],
  walletTypeFilter: 'ALL',
  googleAccount: null, // { name, email, deviceLabel, connectedAt, autoBackup }
  deviceGoogleAccounts: [], // Akun Google yang terdeteksi di perangkat ini
  driveBackups: [], // Riwayat sinkronisasi cadangan transaksi ke Google Drive
  isSyncingBackground: false,
  deviceHasFingerprintSensor: false,
  security: {
    enabled: false,
    method: null, // 'pin' | 'pattern' | 'fingerprint'
    secret: '', // PIN string, pattern string "0-1-2-5", or credentialId
    updatedAt: null
  },
  isAppLocked: false,
  txSearchQuery: '',
  txTypeFilter: 'ALL',
  editingTxId: null,
  editingWalletId: null
};

let charts = {
  topSpending: null,
  savingsDist: null,
  monthlyBar: null
};

// ================= HELPER BAHASA (I18N), KATEGORI & BULAN =================

function t(key) {
  const dict = I18N_TRANSLATIONS[state.language] || I18N_TRANSLATIONS.id;
  if (dict[key]) return dict[key];
  if (typeof I18N_KEY_ALIASES !== 'undefined' && I18N_KEY_ALIASES[key]) {
    const targetKey = I18N_KEY_ALIASES[key];
    if (dict[targetKey]) return dict[targetKey];
    if (I18N_TRANSLATIONS.id[targetKey]) return I18N_TRANSLATIONS.id[targetKey];
  }
  return I18N_TRANSLATIONS.id[key] || String(key).replace(/_/g, ' ');
}

function translateCategoryName(rawName) {
  if (!rawName) return '';
  if (typeof CATEGORY_TRANSLATIONS !== 'undefined' && CATEGORY_TRANSLATIONS[rawName]) {
    return CATEGORY_TRANSLATIONS[rawName][state.language] || CATEGORY_TRANSLATIONS[rawName].id || rawName;
  }
  return rawName;
}

function translateTxType(type) {
  if (type === 'Income') return t('nav_income');
  if (type === 'Expense') return t('nav_expense');
  if (type === 'Savings') return t('nav_savings');
  return type;
}

function getMonthNames() {
  return MONTHS_BY_LANG[state.language] || MONTHS_BY_LANG.id;
}

function getShortMonthNames() {
  return MONTHS_SHORT_BY_LANG[state.language] || MONTHS_SHORT_BY_LANG.id;
}

function getActiveLocale() {
  const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === state.language);
  return langObj ? langObj.locale : 'id-ID';
}

function applyTranslationsToDOM() {
  document.documentElement.lang = state.language || 'id';
  document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      el.textContent = t(key);
    }
  });

  const searchInput = document.getElementById('txSearchInput');
  if (searchInput) searchInput.placeholder = t('search_placeholder');

  const txNoteInput = document.getElementById('txNote');
  if (txNoteInput) txNoteInput.placeholder = t('modal_tx_note_placeholder');

  const customCatInput = document.getElementById('customCatName');
  if (customCatInput) customCatInput.placeholder = t('modal_cat_name_placeholder');

  const newWalletInput = document.getElementById('newWalletName');
  if (newWalletInput) newWalletInput.placeholder = t('modal_new_wallet_placeholder');

  const txFilterSelect = document.getElementById('txTypeFilterSelect');
  if (txFilterSelect && txFilterSelect.options.length >= 4) {
    txFilterSelect.options[0].textContent = t('all_types');
    txFilterSelect.options[1].textContent = t('nav_income');
    txFilterSelect.options[2].textContent = t('nav_expense');
    txFilterSelect.options[3].textContent = t('nav_savings');
    syncCustomSelectTrigger(txFilterSelect);
  }

  const customCatTypeSelect = document.getElementById('customCatType');
  if (customCatTypeSelect && customCatTypeSelect.options.length >= 3) {
    customCatTypeSelect.options[0].textContent = t('nav_savings');
    customCatTypeSelect.options[1].textContent = t('nav_expense');
    customCatTypeSelect.options[2].textContent = t('nav_income');
    syncCustomSelectTrigger(customCatTypeSelect);
  }

  const newWalletTypeSelect = document.getElementById('newWalletType');
  if (newWalletTypeSelect && newWalletTypeSelect.options.length >= 3) {
    newWalletTypeSelect.options[0].textContent = t('wallet_cat_bank');
    newWalletTypeSelect.options[1].textContent = t('wallet_cat_ewallet');
    newWalletTypeSelect.options[2].textContent = t('wallet_cat_cash');
    syncCustomSelectTrigger(newWalletTypeSelect);
  }
}

// ================= FORMATTER MATA UANG DINAMIS & PEMISAH RIBUAN =================

function getActiveCurrencyObj() {
  return CURRENCIES[state.currency] || CURRENCIES.IDR;
}

function formatRp(amount) {
  const cur = getActiveCurrencyObj();
  const num = Math.round(Number(amount) || 0);
  const absFormatted = Math.abs(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, cur.thousandSep || '.');
  if (num < 0) {
    return `-${cur.symbol} ${absFormatted}`;
  }
  return `${cur.symbol} ${absFormatted}`;
}

function formatCompactRp(amount) {
  const cur = getActiveCurrencyObj();
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const isId = state.language === 'id' || state.currency === 'IDR';

  if (abs >= 1_000_000_000) {
    const suffix = isId ? 'M' : 'B';
    return `${cur.symbol} ${(num / 1_000_000_000).toFixed(1).replace('.', cur.decimalSep)} ${suffix}`;
  }
  if (abs >= 1_000_000) {
    const suffix = isId ? 'Jt' : 'M';
    return `${cur.symbol} ${(num / 1_000_000).toFixed(1).replace('.', cur.decimalSep)} ${suffix}`;
  }
  if (abs >= 1_000) {
    const suffix = isId ? 'Rb' : 'K';
    return `${cur.symbol} ${(num / 1_000).toFixed(0)} ${suffix}`;
  }
  return formatRp(num);
}

function formatNumberWithDots(value) {
  const cur = getActiveCurrencyObj();
  const sep = cur.thousandSep || '.';
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.replace(/^0+(?=\d)/, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

function parseFormattedNumber(str) {
  const digits = String(str ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) || 0;
}

function attachThousandSeparatorInput(inputEl, previewEl = null) {
  if (!inputEl) return;
  inputEl.addEventListener('input', (e) => {
    const raw = e.target.value;
    const formatted = formatNumberWithDots(raw);
    e.target.value = formatted;
    if (previewEl) {
      previewEl.textContent = formatRp(parseFormattedNumber(formatted));
    }
  });
}

function syncCurrencySymbolsInDOM() {
  const cur = getActiveCurrencyObj();
  document.querySelectorAll('[data-currency-symbol]').forEach((el) => {
    el.textContent = cur.symbol;
  });

  const previewBadge = document.getElementById('currencyPreviewBadge');
  if (previewBadge) {
    const sample = cur.code === 'IDR' || cur.code === 'KRW' || cur.code === 'JPY' ? 1500000 : 1500;
    previewBadge.textContent = formatRp(sample);
  }

  // Update tombol nominal cepat (quick amounts) sesuai mata uang aktif
  const quickAmounts = cur.quickAmounts || [25000, 50000, 100000, 500000, 1000000];
  const txQuickEl = document.getElementById('txQuickAmountsContainer');
  if (txQuickEl) {
    txQuickEl.innerHTML = quickAmounts
      .map(
        (amt) =>
          `<button type="button" onclick="addQuickAmount(${amt})" class="px-2.5 py-1 rounded-lg text-[11px] font-mono-num bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/70">+${formatNumberWithDots(amt)}</button>`
      )
      .join('');
  }

  const walletQuickAmounts = quickAmounts.slice(1);
  const walBalQuickEl = document.getElementById('walletBalanceQuickAmounts');
  if (walBalQuickEl) {
    walBalQuickEl.innerHTML = walletQuickAmounts
      .map(
        (amt) =>
          `<button type="button" onclick="addQuickWalletBalance('walletBalanceInput', 'walletBalancePreview', ${amt})" class="px-2.5 py-1 rounded-lg text-[11px] font-mono-num bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/70">+${formatNumberWithDots(amt)}</button>`
      )
      .join('');
  }

  const newWalQuickEl = document.getElementById('newWalletQuickAmounts');
  if (newWalQuickEl) {
    newWalQuickEl.innerHTML = walletQuickAmounts
      .map(
        (amt) =>
          `<button type="button" onclick="addQuickWalletBalance('newWalletInitial', 'newWalletPreview', ${amt})" class="px-2.5 py-1 rounded-lg text-[11px] font-mono-num bg-slate-800/70 hover:bg-slate-700 text-slate-300 border border-slate-700/70">+${formatNumberWithDots(amt)}</button>`
      )
      .join('');
  }
}

// ================= DUAL MODE (DARK & LIGHT THEME DENGAN OPACITY RENDAH) =================

function applyThemeToDOM() {
  const htmlEl = document.documentElement;
  if (state.theme === 'light') {
    htmlEl.classList.remove('dark');
    htmlEl.classList.add('light');
  } else {
    htmlEl.classList.remove('light');
    htmlEl.classList.add('dark');
  }

  const darkBtn = document.getElementById('btnThemeDark');
  const lightBtn = document.getElementById('btnThemeLight');
  const themeBadge = document.getElementById('activeThemeBadge');

  if (darkBtn && lightBtn) {
    if (state.theme === 'dark') {
      darkBtn.className =
        'py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all bg-emerald-500/15 border-emerald-500/45 text-emerald-300';
      lightBtn.className =
        'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all bg-transparent border-transparent text-slate-400 hover:text-slate-200';
    } else {
      lightBtn.className =
        'py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all bg-emerald-500/15 border-emerald-500/45 text-emerald-400';
      darkBtn.className =
        'py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all bg-transparent border-transparent text-slate-400 hover:text-slate-200';
    }
  }

  if (themeBadge) {
    themeBadge.textContent = state.theme === 'light' ? t('theme_light') : t('theme_dark');
  }
}

function setThemeMode(mode) {
  state.theme = mode === 'light' ? 'light' : 'dark';
  savePreferencesToStorage();
  applyThemeToDOM();
  refreshDashboard();
  showToast(`${t('settings_theme_label')}: ${state.theme === 'light' ? t('theme_light') : t('theme_dark')}`);
}

function setCurrencyFormat(currencyCode) {
  if (!CURRENCIES[currencyCode]) return;
  state.currency = currencyCode;
  savePreferencesToStorage();
  syncCurrencySymbolsInDOM();
  refreshDashboard();
  showToast(`${t('settings_currency_label')}: ${CURRENCIES[currencyCode].name}`);
}

function setAppLanguage(langCode) {
  const exists = SUPPORTED_LANGUAGES.some((l) => l.code === langCode);
  if (!exists) return;
  state.language = langCode;
  savePreferencesToStorage();
  applyTranslationsToDOM();
  refreshDashboard();
  const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === langCode);
  showToast(`${t('settings_language_label')}: ${langObj ? langObj.name : langCode}`);
}

// ================= SCHEMA & KATEGORI DINAMIS =================

function getActiveSchema() {
  const schema = JSON.parse(JSON.stringify(DEFAULT_FINANCE_SCHEMA));
  ['Income', 'Expense', 'Savings'].forEach((type) => {
    const customs = state.customCategories[type] || [];
    customs.forEach((customItem) => {
      const exists = schema[type].groups[0].items.some(
        (i) => i.name.toLowerCase() === customItem.name.toLowerCase()
      );
      if (!exists) {
        schema[type].groups[0].items.push({
          id: customItem.id,
          name: customItem.name,
          icon: customItem.icon || 'folder-plus',
          defaultBudget: 0,
          noBudget: type === 'Income' ? true : Boolean(customItem.noBudget),
          isCustom: true
        });
      }
    });
  });
  return schema;
}

function getAllCategoriesFlat() {
  const schema = getActiveSchema();
  const list = [];
  Object.entries(schema).forEach(([type, typeObj]) => {
    typeObj.groups.forEach((group) => {
      group.items.forEach((item) => {
        list.push({
          ...item,
          type,
          groupName: group.groupName
        });
      });
    });
  });
  return list;
}

function isCategoryNoBudget(categoryName, type = null) {
  if (type === 'Income') return true;
  const found = getAllCategoriesFlat().find(
    (c) => c.name.toLowerCase() === String(categoryName || '').toLowerCase()
  );
  if (!found) return false;
  return found.type === 'Income' || Boolean(found.noBudget);
}

// ================= PENGUNCIAN BULAN & TAHUN BERDASARKAN PENGGUNA =================

function getPeriodPrefix(year = state.selectedYear, monthIndex = state.selectedMonth) {
  const m = monthIndex === -1 ? getCurrentDateInfo(state.language).month : monthIndex;
  return `${year}-${String(m + 1).padStart(2, '0')}`;
}

function makeBudgetKey(categoryName, year = state.selectedYear, monthIndex = state.selectedMonth) {
  return `${getPeriodPrefix(year, monthIndex)}::${categoryName}`;
}

function getEarliestUsageYearMonth() {
  const now = getCurrentDateInfo(state.language);
  let startYear = typeof state.firstOpenedYear === 'number' ? state.firstOpenedYear : now.year;
  let startMonth = typeof state.firstOpenedMonth === 'number' ? state.firstOpenedMonth : now.month;

  if (startYear > now.year || (startYear === now.year && startMonth > now.month)) {
    startYear = now.year;
    startMonth = now.month;
  }

  return { startYear, startMonth };
}

function getTotalMonthsUsed() {
  const now = getCurrentDateInfo(state.language);
  const { startYear, startMonth } = getEarliestUsageYearMonth();
  const diff = (now.year - startYear) * 12 + (now.month - startMonth) + 1;
  return Math.max(1, diff);
}

function isFullYearUnlocked() {
  return getTotalMonthsUsed() >= 12;
}

function getAvailableYears() {
  const nowYear = getCurrentDateInfo(state.language).year;
  const { startYear } = getEarliestUsageYearMonth();
  const yearSet = new Set();

  for (let y = startYear; y <= nowYear; y++) {
    yearSet.add(y);
  }

  return Array.from(yearSet).sort((a, b) => a - b);
}

function getAvailableMonthsForYear(year = state.selectedYear) {
  const now = getCurrentDateInfo(state.language);
  const { startYear, startMonth } = getEarliestUsageYearMonth();

  let minMonth = 0;
  let maxMonth = 11;

  if (year <= startYear) {
    minMonth = startMonth;
  }
  if (year >= now.year) {
    maxMonth = now.month;
  }

  if (minMonth > maxMonth) {
    minMonth = maxMonth;
  }

  const months = [];
  for (let m = minMonth; m <= maxMonth; m++) {
    months.push(m);
  }
  return months;
}

// ================= LOCALSTORAGE MANAGEMENT =================

function loadStateFromStorage() {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));

    // Load Preferences (Theme, Currency, Language)
    const savedPrefs = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    if (savedPrefs) {
      const parsedPrefs = JSON.parse(savedPrefs);
      if (parsedPrefs.theme === 'light' || parsedPrefs.theme === 'dark') {
        state.theme = parsedPrefs.theme;
      }
      if (parsedPrefs.currency && CURRENCIES[parsedPrefs.currency]) {
        state.currency = parsedPrefs.currency;
      }
      if (parsedPrefs.language && I18N_TRANSLATIONS[parsedPrefs.language]) {
        state.language = parsedPrefs.language;
      }
    }

    // Fitur Kata Sandi & Keamanan dinonaktifkan sesuai permintaan
    state.security = {
      enabled: false,
      method: null,
      secret: '',
      updatedAt: null
    };
    state.isAppLocked = false;

    const now = getCurrentDateInfo(state.language);
    const savedMeta = localStorage.getItem(STORAGE_KEYS.META);
    if (savedMeta) {
      const parsedMeta = JSON.parse(savedMeta);
      state.firstOpenedYear =
        typeof parsedMeta.firstOpenedYear === 'number' ? parsedMeta.firstOpenedYear : now.year;
      state.firstOpenedMonth =
        typeof parsedMeta.firstOpenedMonth === 'number' ? parsedMeta.firstOpenedMonth : now.month;
    } else {
      state.firstOpenedYear = now.year;
      state.firstOpenedMonth = now.month;
      localStorage.setItem(
        STORAGE_KEYS.META,
        JSON.stringify({
          firstOpenedYear: state.firstOpenedYear,
          firstOpenedMonth: state.firstOpenedMonth,
          firstOpenedAt: now.isoDate
        })
      );
    }

    const savedTx = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    state.transactions = savedTx ? JSON.parse(savedTx) : getInitialTransactions();

    const savedBudgets = localStorage.getItem(STORAGE_KEYS.BUDGETS);
    state.budgets = savedBudgets ? JSON.parse(savedBudgets) : getInitialBudgets();

    const savedCustomCats = localStorage.getItem(STORAGE_KEYS.CUSTOM_CATEGORIES);
    if (savedCustomCats) {
      state.customCategories = {
        Income: [],
        Expense: [],
        Savings: [],
        ...JSON.parse(savedCustomCats)
      };
    }

    const savedWallets = localStorage.getItem(STORAGE_KEYS.WALLETS);
    if (savedWallets) {
      state.wallets = JSON.parse(savedWallets);
    } else {
      state.wallets = JSON.parse(JSON.stringify(DEFAULT_WALLETS));
      saveWalletsToStorage();
    }

    const savedGoogle = localStorage.getItem(STORAGE_KEYS.GOOGLE_ACCOUNT);
    state.googleAccount = savedGoogle ? JSON.parse(savedGoogle) : null;

    const savedDeviceAccs = localStorage.getItem(STORAGE_KEYS.DEVICE_GOOGLE_ACCOUNTS);
    state.deviceGoogleAccounts = savedDeviceAccs ? JSON.parse(savedDeviceAccs) : [];

    const savedBackups = localStorage.getItem(STORAGE_KEYS.DRIVE_BACKUPS);
    state.driveBackups = savedBackups ? JSON.parse(savedBackups) : [];

    state.selectedMonth = now.month;
    state.selectedYear = now.year;
  } catch (err) {
    console.error('Gagal memuat LocalStorage:', err);
    state.transactions = [];
    state.budgets = {};
    state.wallets = JSON.parse(JSON.stringify(DEFAULT_WALLETS));
    state.googleAccount = null;
    state.driveBackups = [];
  }
}

function savePreferencesToStorage() {
  localStorage.setItem(
    STORAGE_KEYS.PREFERENCES,
    JSON.stringify({
      theme: state.theme,
      currency: state.currency,
      language: state.language
    })
  );
}

function saveSecurityToStorage() {
  localStorage.setItem(STORAGE_KEYS.SECURITY, JSON.stringify(state.security));
}

function saveTransactionsToStorage() {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
  triggerSilentAutoBackupIfConnected();
}

function saveBudgetsToStorage() {
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(state.budgets));
  triggerSilentAutoBackupIfConnected();
}

function saveCustomCategoriesToStorage() {
  localStorage.setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, JSON.stringify(state.customCategories));
  triggerSilentAutoBackupIfConnected();
}

function saveWalletsToStorage() {
  localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(state.wallets));
  triggerSilentAutoBackupIfConnected();
}

function saveGoogleAccountToStorage() {
  if (state.googleAccount) {
    localStorage.setItem(STORAGE_KEYS.GOOGLE_ACCOUNT, JSON.stringify(state.googleAccount));
  } else {
    localStorage.removeItem(STORAGE_KEYS.GOOGLE_ACCOUNT);
  }
}

function saveDeviceGoogleAccountsToStorage() {
  localStorage.setItem(
    STORAGE_KEYS.DEVICE_GOOGLE_ACCOUNTS,
    JSON.stringify(state.deviceGoogleAccounts)
  );
}

function saveDriveBackupsToStorage() {
  localStorage.setItem(STORAGE_KEYS.DRIVE_BACKUPS, JSON.stringify(state.driveBackups));
}

// ================= KALKULASI SALDO WALLET =================

function getWalletNetTxDelta(walletName) {
  let delta = 0;
  state.transactions.forEach((tx) => {
    if (tx.account !== walletName) return;
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'Income') {
      delta += amt;
    } else if (tx.type === 'Expense') {
      delta -= amt;
    }
  });
  return delta;
}

function getCalculatedWallets() {
  return state.wallets.map((w) => {
    let totalIn = 0;
    let totalOut = 0;
    state.transactions.forEach((tx) => {
      if (tx.account !== w.name) return;
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'Income') totalIn += amt;
      else if (tx.type === 'Expense') totalOut += amt;
    });
    const netDelta = totalIn - totalOut;
    const currentBalance = (Number(w.initialBalance) || 0) + netDelta;
    return {
      ...w,
      totalIn,
      totalOut,
      netDelta,
      currentBalance
    };
  });
}

// ================= FILTER & KALKULASI METRIK =================

function isTransactionInSelectedPeriod(tx) {
  if (!tx.date) return false;
  const parts = tx.date.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const matchYear = year === state.selectedYear;
  const matchMonth = state.selectedMonth === -1 ? true : month === state.selectedMonth;
  return matchYear && matchMonth;
}

function getFilteredTransactions() {
  return state.transactions.filter(isTransactionInSelectedPeriod);
}

function getCategoryBudget(categoryName) {
  if (isCategoryNoBudget(categoryName)) return 0;
  if (state.selectedMonth === -1) {
    let yearlySum = 0;
    const availMonths = getAvailableMonthsForYear(state.selectedYear);
    availMonths.forEach((m) => {
      yearlySum += Number(state.budgets[makeBudgetKey(categoryName, state.selectedYear, m)]) || 0;
    });
    return yearlySum;
  }
  return Number(state.budgets[makeBudgetKey(categoryName, state.selectedYear, state.selectedMonth)]) || 0;
}

function calculateSummaryMetrics(filteredTx) {
  const schema = getActiveSchema();
  let totalIncome = 0;
  let totalExpense = 0;
  let totalSavings = 0;

  let totalIncomeBudget = 0;
  let totalExpenseBudget = 0;
  let totalSavingsBudget = 0;

  const trackedByCategory = {};
  const cumulativeSavingsByCategory = {};

  getAllCategoriesFlat().forEach((c) => {
    trackedByCategory[c.name] = 0;
    if (c.type === 'Savings') {
      cumulativeSavingsByCategory[c.name] = 0;
    }
  });

  filteredTx.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'Income') totalIncome += amt;
    else if (tx.type === 'Expense') totalExpense += amt;

    if (trackedByCategory[tx.category] !== undefined) {
      trackedByCategory[tx.category] += amt;
    } else {
      trackedByCategory[tx.category] = amt;
    }
  });

  state.transactions.forEach((tx) => {
    if (tx.type !== 'Savings') return;
    if (!tx.date) return;
    const txYear = parseInt(tx.date.split('-')[0], 10);
    const txMonth = parseInt(tx.date.split('-')[1], 10) - 1;
    const isUpToPeriod =
      state.selectedMonth === -1
        ? txYear <= state.selectedYear
        : txYear < state.selectedYear ||
          (txYear === state.selectedYear && txMonth <= state.selectedMonth);

    if (isUpToPeriod) {
      const amt = Number(tx.amount) || 0;
      totalSavings += amt;
      if (cumulativeSavingsByCategory[tx.category] !== undefined) {
        cumulativeSavingsByCategory[tx.category] += amt;
      } else {
        cumulativeSavingsByCategory[tx.category] = amt;
      }
    }
  });

  totalIncomeBudget = 0;

  schema.Expense.groups.forEach((g) =>
    g.items.forEach((i) => {
      if (!i.noBudget) totalExpenseBudget += getCategoryBudget(i.name);
    })
  );
  schema.Savings.groups.forEach((g) =>
    g.items.forEach((i) => {
      if (!i.noBudget) totalSavingsBudget += getCategoryBudget(i.name);
    })
  );

  const periodSavings = filteredTx
    .filter((t) => t.type === 'Savings')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const sisaDana = totalIncome - totalExpense - periodSavings;

  return {
    totalIncome,
    totalExpense,
    totalSavings,
    periodSavings,
    totalIncomeBudget,
    totalExpenseBudget,
    totalSavingsBudget,
    sisaDana,
    trackedByCategory,
    cumulativeSavingsByCategory
  };
}

// ================= TAB NAVIGATION (DESKTOP & MOBILE) =================

function switchTab(tabName) {
  const sections = ['dashboard', 'wallets', 'income', 'expense', 'savings', 'history', 'settings'];
  const prevTab = state.activeTab || 'dashboard';
  const prevIndex = sections.indexOf(prevTab);
  const nextIndex = sections.indexOf(tabName);
  const animClass =
    prevIndex !== -1 && nextIndex !== -1 && prevIndex !== nextIndex
      ? nextIndex > prevIndex
        ? 'tab-anim-right'
        : 'tab-anim-left'
      : 'tab-anim-right';

  state.activeTab = tabName;

  sections.forEach((sec) => {
    const el = document.getElementById(`tabSection-${sec}`);
    if (!el) return;
    if (sec === tabName) {
      el.classList.remove('hidden', 'tab-anim-right', 'tab-anim-left');
      // Force reflow so the animation plays smoothly every time a tab is switched
      void el.offsetWidth;
      el.classList.add(animClass);
    } else {
      el.classList.add('hidden');
      el.classList.remove('tab-anim-right', 'tab-anim-left');
    }
  });

  document.querySelectorAll('[data-tab-target]').forEach((btn) => {
    const target = btn.getAttribute('data-tab-target');
    const isMobile = btn.classList.contains('mobile-tab-btn');

    if (!isMobile) {
      if (btn.classList.contains('desktop-tab-btn')) {
        btn.className = 'desktop-tab-btn';
        if (target === tabName) {
          void btn.offsetWidth;
          btn.classList.add(`active-tab-${tabName}`);
        }
      }
    } else {
      if (target === tabName) {
        let activeColor = 'text-emerald-400';
        if (tabName === 'expense') activeColor = 'text-rose-400';
        if (tabName === 'savings') activeColor = 'text-blue-400';
        if (tabName === 'wallets') activeColor = 'text-purple-400';
        if (tabName === 'settings') activeColor = 'text-blue-400';
        btn.className = `mobile-tab-btn tab-btn-active flex flex-col items-center justify-center py-1.5 px-1 ${activeColor} font-bold transition-all`;
      } else {
        btn.className =
          'mobile-tab-btn flex flex-col items-center justify-center py-1.5 px-1 text-slate-400 hover:text-slate-200 font-medium transition-all';
      }
    }
  });

  if (tabName === 'dashboard') {
    setTimeout(() => {
      Object.values(charts).forEach((c) => {
        if (c) c.resize();
      });
    }, 50);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ================= NAVIGASI PERIODE BULAN / TAHUN =================

function navigatePeriod(direction) {
  const availableYears = getAvailableYears();
  const minYear = availableYears[0];
  const maxYear = availableYears[availableYears.length - 1];
  const monthsList = getMonthNames();

  if (state.selectedMonth === -1) {
    const nextYear = state.selectedYear + direction;
    if (nextYear < minYear || nextYear > maxYear) {
      showToast(`Periode tahun terkunci pada ${availableYears.join(', ')}`, 'error');
      return;
    }
    state.selectedYear = nextYear;
    syncFilterDropdowns();
    refreshDashboard();
    return;
  }

  const validPeriods = [];
  availableYears.forEach((y) => {
    const months = getAvailableMonthsForYear(y);
    months.forEach((m) => {
      validPeriods.push({ year: y, month: m });
    });
  });

  const currentIndex = validPeriods.findIndex(
    (p) => p.year === state.selectedYear && p.month === state.selectedMonth
  );

  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= validPeriods.length) {
    const { startYear, startMonth } = getEarliestUsageYearMonth();
    showToast(
      `Periode bulan terkunci mulai ${monthsList[startMonth]} ${startYear} hingga bulan ini.`,
      'error'
    );
    return;
  }

  state.selectedYear = validPeriods[targetIndex].year;
  state.selectedMonth = validPeriods[targetIndex].month;
  syncFilterDropdowns();
  refreshDashboard();
}

// ================= RENDER UI: 4 HEADER CARDS SERAGAM =================

function renderUniformCardSubList(rows) {
  const MAX_VISIBLE = 2;
  const visibleRows = rows.slice(0, MAX_VISIBLE);
  const hasMore = rows.length > MAX_VISIBLE;

  let html = visibleRows
    .map(
      (r) => `
      <div class="flex items-center justify-between gap-1.5 text-[10px] sm:text-[11px] leading-tight">
        <span class="text-slate-400 truncate max-w-[55%]" title="${r.label}">${r.label}</span>
        <span class="font-mono-num font-semibold ${r.colorClass} shrink-0 truncate max-w-[45%]">${r.valueText}</span>
      </div>
    `
    )
    .join('');

  if (hasMore) {
    const hiddenLabels = rows
      .slice(MAX_VISIBLE)
      .map((r) => `${r.label}: ${r.valueText}`)
      .join(' • ');
    html += `
      <div class="flex items-center justify-between text-[11px] font-extrabold text-slate-400 leading-none tracking-widest pt-0.5 select-none" title="${hiddenLabels}">
        <span>...</span>
        <span class="text-[9px] font-semibold tracking-normal text-slate-500">+${rows.length - MAX_VISIBLE}</span>
      </div>
    `;
  }

  return html;
}

function renderHeaderCards(metrics) {
  const schema = getActiveSchema();
  const now = getCurrentDateInfo(state.language);
  const monthsList = getMonthNames();

  const todayLabelEl = document.getElementById('liveTodayBadge');
  if (todayLabelEl) {
    todayLabelEl.textContent = now.formattedToday;
  }

  const periodLabel =
    state.selectedMonth === -1
      ? `${state.selectedYear}`
      : `${monthsList[state.selectedMonth]} ${state.selectedYear}`;

  const activeBadge = document.getElementById('activePeriodBadge');
  if (activeBadge) activeBadge.textContent = periodLabel;

  // 1. TOTAL INCOME
  document.getElementById('cardTotalIncome').textContent = formatRp(metrics.totalIncome);
  const incomeRows = schema.Income.groups[0].items.map((item) => {
    const val = metrics.trackedByCategory[item.name] || 0;
    return {
      label: translateCategoryName(item.name),
      valueText: formatRp(val),
      colorClass: val > 0 ? 'text-emerald-300' : 'text-slate-500'
    };
  });
  document.getElementById('cardIncomeSub').innerHTML = renderUniformCardSubList(incomeRows);

  // 2. TOTAL EXPENSES
  document.getElementById('cardTotalExpense').textContent = formatRp(metrics.totalExpense);
  const expenseRows = schema.Expense.groups[0].items.map((item) => {
    const val = metrics.trackedByCategory[item.name] || 0;
    return {
      label: translateCategoryName(item.name),
      valueText: formatRp(val),
      colorClass: val > 0 ? 'text-rose-300' : 'text-slate-500'
    };
  });
  document.getElementById('cardExpenseSub').innerHTML = renderUniformCardSubList(expenseRows);

  // 3. TOTAL SAVINGS
  document.getElementById('cardTotalSavings').textContent = formatRp(metrics.totalSavings);
  const savingsRows = schema.Savings.groups[0].items.map((item) => {
    const val = metrics.cumulativeSavingsByCategory[item.name] || 0;
    return {
      label: translateCategoryName(item.name),
      valueText: formatRp(val),
      colorClass: val > 0 ? 'text-blue-300' : 'text-slate-500'
    };
  });
  document.getElementById('cardSavingsSub').innerHTML = renderUniformCardSubList(savingsRows);

  // 4. TOTAL BALANCE
  const sisaEl = document.getElementById('cardSisaDana');
  sisaEl.textContent = formatRp(metrics.sisaDana);
  sisaEl.className = `text-base sm:text-2xl font-extrabold font-mono-num tracking-tight mb-2 truncate ${
    metrics.sisaDana >= 0 ? 'text-teal-300' : 'text-rose-400'
  }`;

  const balanceRows = [
    {
      label: t('nav_income'),
      valueText: formatRp(metrics.totalIncome),
      colorClass: 'text-emerald-300'
    },
    {
      label: t('nav_expense'),
      valueText: '-' + formatRp(metrics.totalExpense),
      colorClass: 'text-rose-300'
    },
    {
      label: t('nav_savings'),
      valueText: '-' + formatRp(metrics.periodSavings),
      colorClass: 'text-blue-300'
    }
  ];
  document.getElementById('cardSisaDanaSub').innerHTML = renderUniformCardSubList(balanceRows);

  // Update Banner di masing-masing Tab
  const bannerIncTotal = document.getElementById('tabBannerIncomeTotal');
  if (bannerIncTotal) bannerIncTotal.textContent = formatRp(metrics.totalIncome);

  const bannerExpTotal = document.getElementById('tabBannerExpenseTotal');
  if (bannerExpTotal) bannerExpTotal.textContent = formatRp(metrics.totalExpense);
  const bannerExpBudget = document.getElementById('tabBannerExpenseBudget');
  if (bannerExpBudget) bannerExpBudget.textContent = formatRp(metrics.totalExpenseBudget);

  const bannerSavTotal = document.getElementById('tabBannerSavingsTotal');
  if (bannerSavTotal) bannerSavTotal.textContent = formatRp(metrics.totalSavings);
  const bannerSavBudget = document.getElementById('tabBannerSavingsBudget');
  if (bannerSavBudget) bannerSavBudget.textContent = formatRp(metrics.totalSavingsBudget);
}

// ================= RENDER UI: TAB WALLET =================

function setWalletTypeFilter(filterType) {
  state.walletTypeFilter = filterType || 'ALL';
  renderWalletsSection();
  if (window.lucide) window.lucide.createIcons();
}

function renderWalletsSection() {
  const calculated = getCalculatedWallets();
  const totalFunds = calculated.reduce((sum, w) => sum + w.currentBalance, 0);

  let totalBank = 0;
  let totalEwallet = 0;
  let totalCash = 0;
  let countBank = 0;
  let countEwallet = 0;
  let countCash = 0;

  calculated.forEach((w) => {
    if (w.type === 'Bank') {
      totalBank += w.currentBalance;
      countBank++;
    } else if (w.type === 'E-Wallet') {
      totalEwallet += w.currentBalance;
      countEwallet++;
    } else {
      totalCash += w.currentBalance;
      countCash++;
    }
  });

  const positiveTotal = Math.max(0, totalBank) + Math.max(0, totalCash) + Math.max(0, totalEwallet);
  const pctBank = positiveTotal > 0 ? Math.round((Math.max(0, totalBank) / positiveTotal) * 100) : 0;
  const pctCash = positiveTotal > 0 ? Math.round((Math.max(0, totalCash) / positiveTotal) * 100) : 0;
  const pctEwallet = positiveTotal > 0 ? Math.round((Math.max(0, totalEwallet) / positiveTotal) * 100) : 0;

  const totalEl = document.getElementById('walletTotalBalance');
  if (totalEl) totalEl.textContent = formatRp(totalFunds);

  const countBadgeEl = document.getElementById('walletCountBadge');
  if (countBadgeEl) countBadgeEl.textContent = `${calculated.length} ${t('nav_wallets')}`;

  const sumBankEl = document.getElementById('walletSumBank');
  if (sumBankEl) sumBankEl.textContent = formatRp(totalBank);
  const sumCashEl = document.getElementById('walletSumCash');
  if (sumCashEl) sumCashEl.textContent = formatRp(totalCash);
  const sumEwalletEl = document.getElementById('walletSumEwallet');
  if (sumEwalletEl) sumEwalletEl.textContent = formatRp(totalEwallet);

  const countBankEl = document.getElementById('walletCountBank');
  if (countBankEl) countBankEl.textContent = `${countBank} ${t('wallet_accounts_suffix')}`;
  const countCashEl = document.getElementById('walletCountCash');
  if (countCashEl) countCashEl.textContent = `${countCash} ${t('wallet_accounts_suffix')}`;
  const countEwalletEl = document.getElementById('walletCountEwallet');
  if (countEwalletEl) countEwalletEl.textContent = `${countEwallet} ${t('wallet_accounts_suffix')}`;

  const pctBankEl = document.getElementById('walletPctBank');
  if (pctBankEl) pctBankEl.textContent = `${pctBank}%`;
  const pctCashEl = document.getElementById('walletPctCash');
  if (pctCashEl) pctCashEl.textContent = `${pctCash}%`;
  const pctEwalletEl = document.getElementById('walletPctEwallet');
  if (pctEwalletEl) pctEwalletEl.textContent = `${pctEwallet}%`;

  const barBankEl = document.getElementById('walletBarBank');
  if (barBankEl) barBankEl.style.width = `${pctBank}%`;
  const barCashEl = document.getElementById('walletBarCash');
  if (barCashEl) barCashEl.style.width = `${pctCash}%`;
  const barEwalletEl = document.getElementById('walletBarEwallet');
  if (barEwalletEl) barEwalletEl.style.width = `${pctEwallet}%`;

  document.querySelectorAll('.wallet-filter-btn').forEach((btn) => {
    const fType = btn.getAttribute('data-wallet-filter');
    if (fType === state.walletTypeFilter) {
      btn.className =
        'wallet-filter-btn px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/35 transition-all text-center whitespace-nowrap focus:outline-none';
    } else {
      btn.className =
        'wallet-filter-btn px-2.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold text-slate-400 hover:text-slate-200 border border-transparent transition-all text-center whitespace-nowrap focus:outline-none';
    }
  });

  const dashWalletTotalEl = document.getElementById('dashboardWalletTotal');
  if (dashWalletTotalEl) {
    dashWalletTotalEl.textContent = formatRp(totalFunds);
  }

  const dashWalletChipsEl = document.getElementById('dashboardWalletChips');
  if (dashWalletChipsEl) {
    const activeWallets = calculated.filter((w) => w.currentBalance !== 0);
    if (activeWallets.length === 0) {
      dashWalletChipsEl.innerHTML = '';
      dashWalletChipsEl.classList.add('hidden');
      dashWalletChipsEl.classList.remove('flex');
    } else {
      dashWalletChipsEl.classList.remove('hidden');
      dashWalletChipsEl.classList.add('flex');
      dashWalletChipsEl.innerHTML = activeWallets
        .map(
          (w) => `
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/75 border border-slate-700/80 hover:border-purple-500/40 transition-all">
            <div onclick="openSetWalletBalanceModal('${w.id}')" class="cursor-pointer inline-flex items-center gap-2">
              <i data-lucide="${w.icon || 'wallet'}" class="w-3.5 h-3.5 text-purple-400"></i>
              <span class="text-xs font-medium text-slate-200">${w.name}:</span>
              <span class="text-xs font-mono-num font-bold text-emerald-400">${formatRp(w.currentBalance)}</span>
            </div>
            <button
              type="button"
              onclick="clearWalletNominal('${w.id}')"
              class="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="${t('btn_reset')} ${w.name}"
            >
              <i data-lucide="trash-2" class="w-3 h-3"></i>
            </button>
          </div>
        `
        )
        .join('');
    }
  }

  const gridEl = document.getElementById('walletsGridContainer');
  if (!gridEl) return;

  const filteredWallets =
    state.walletTypeFilter === 'ALL'
      ? calculated
      : calculated.filter((w) => w.type === state.walletTypeFilter);

  if (filteredWallets.length === 0) {
    let emptyTitle = t('wallet_empty_all_title');
    let emptyDesc = t('wallet_empty_all_desc');

    if (state.walletTypeFilter === 'Bank') {
      emptyTitle = t('wallet_empty_bank_title');
      emptyDesc = t('wallet_empty_bank_desc');
    } else if (state.walletTypeFilter === 'Tunai') {
      emptyTitle = t('wallet_empty_cash_title');
      emptyDesc = t('wallet_empty_cash_desc');
    } else if (state.walletTypeFilter === 'E-Wallet') {
      emptyTitle = t('wallet_empty_ewallet_title');
      emptyDesc = t('wallet_empty_ewallet_desc');
    }

    const defaultModalType =
      state.walletTypeFilter === 'ALL' ? 'Bank' : state.walletTypeFilter;

    gridEl.innerHTML = `
      <div class="col-span-full glass-card rounded-2xl p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-3 border border-dashed border-slate-700/80">
        <div class="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-inner">
          <i data-lucide="wallet-cards" class="w-6 h-6"></i>
        </div>
        <div class="space-y-1 max-w-md">
          <h4 class="text-sm sm:text-base font-bold text-slate-100">${emptyTitle}</h4>
          <p class="text-xs text-slate-400 leading-relaxed">${emptyDesc}</p>
        </div>
        <div class="pt-1">
          <button
            type="button"
            onclick="openAddWalletModal('${defaultModalType}')"
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white keep-white shadow-lg shadow-purple-500/20 transition-all focus:outline-none"
          >
            <i data-lucide="plus" class="w-4 h-4 stroke-[2.5]"></i>
            <span>${t('btn_add_wallet')}</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = filteredWallets
    .map((w) => {
      const pct =
        totalFunds > 0 && w.currentBalance > 0
          ? ((w.currentBalance / totalFunds) * 100).toFixed(1)
          : '0.0';
      const barWidth = Math.min(100, Math.max(0, parseFloat(pct)));

      let badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      let iconBoxClass = 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
      let barGradient = 'from-emerald-500 to-teal-400';
      let cardHoverBorder = 'hover:border-emerald-500/40';
      let typeLabel = t('wallet_bank_label');

      if (w.type === 'E-Wallet') {
        badgeClass = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
        iconBoxClass = 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400';
        barGradient = 'from-cyan-500 to-blue-400';
        cardHoverBorder = 'hover:border-cyan-500/40';
        typeLabel = t('wallet_ewallet_label');
      } else if (w.type === 'Tunai') {
        badgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
        iconBoxClass = 'bg-amber-500/15 border-amber-500/30 text-amber-400';
        barGradient = 'from-amber-500 to-orange-400';
        cardHoverBorder = 'hover:border-amber-500/40';
        typeLabel = t('wallet_cash_label');
      }

      return `
        <div class="glass-card rounded-2xl p-4 flex flex-col justify-between gap-3.5 border border-slate-800/90 ${cardHoverBorder} transition-all relative overflow-hidden">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBoxClass}">
                <i data-lucide="${w.icon || 'wallet'}" class="w-5 h-5"></i>
              </div>
              <div class="min-w-0">
                <h4 class="text-sm font-bold text-white truncate">${w.name}</h4>
                <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass}">
                  ${typeLabel}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onclick="openSetWalletBalanceModal('${w.id}')"
                class="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-slate-800/75 hover:bg-purple-500/20 text-slate-200 hover:text-purple-200 border border-slate-700/80 hover:border-purple-500/35 transition-all inline-flex items-center gap-1"
                title="${t('wallet_btn_set_balance')} ${w.name}"
              >
                <i data-lucide="sliders-horizontal" class="w-3 h-3 text-purple-400"></i>
                <span>${t('wallet_btn_set_balance')}</span>
              </button>
              <button
                type="button"
                onclick="clearWalletNominal('${w.id}')"
                class="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 transition-colors"
                title="${t('btn_reset')} ${w.name}"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>

          <div class="p-3 rounded-xl bg-slate-950/55 border border-slate-800/80 flex items-center justify-between gap-2">
            <span class="text-[11px] font-medium text-slate-400">${t('wallet_saved_balance')}</span>
            <span class="text-lg sm:text-xl font-extrabold font-mono-num truncate ${
              w.currentBalance >= 0 ? 'text-white' : 'text-rose-400'
            }">
              ${formatRp(w.currentBalance)}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-[11px]">
            <div class="px-2.5 py-1.5 rounded-lg bg-slate-900/65 border border-slate-800/80 flex items-center justify-between gap-1">
              <span class="text-slate-400">${t('wallet_in')}</span>
              <span class="font-mono-num font-semibold text-emerald-400 truncate">+${formatCompactRp(w.totalIn || 0)}</span>
            </div>
            <div class="px-2.5 py-1.5 rounded-lg bg-slate-900/65 border border-slate-800/80 flex items-center justify-between gap-1">
              <span class="text-slate-400">${t('wallet_out')}</span>
              <span class="font-mono-num font-semibold text-rose-400 truncate">-${formatCompactRp(w.totalOut || 0)}</span>
            </div>
          </div>

          <div class="space-y-1.5 pt-1 border-t border-slate-800/70">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>${t('wallet_share')}</span>
              <span class="font-mono-num font-bold text-slate-200">${pct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full progress-track overflow-hidden">
              <div class="h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500" style="width: ${barWidth}%"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

// ================= RENDER UI: BREAKDOWN TABLES =================

function getProgressStyles(tracked, budget, type) {
  const pct = budget > 0 ? (tracked / budget) * 100 : 0;
  const pctClamped = Math.min(pct, 100);
  const isOver100 = budget > 0 && tracked > budget;
  const budgetLeft = Math.max(0, budget - tracked);
  const excess = budget > 0 ? Math.max(0, tracked - budget) : 0;

  let barColorClass = 'bg-emerald-500';
  let pctBadgeClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';

  if (isOver100) {
    barColorClass =
      'bg-gradient-to-r from-rose-600 to-red-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]';
    pctBadgeClass = 'text-rose-300 bg-rose-500/20 border-rose-500/40 overbudget-pulse';
  } else if (type === 'Expense' && pct >= 85) {
    barColorClass = 'bg-gradient-to-r from-amber-500 to-orange-400';
    pctBadgeClass = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
  } else if (type === 'Savings') {
    barColorClass = 'bg-gradient-to-r from-blue-500 to-cyan-400';
    pctBadgeClass = 'text-blue-300 bg-blue-500/15 border-blue-500/30';
  } else if (type === 'Income') {
    barColorClass = 'bg-gradient-to-r from-emerald-500 to-teal-400';
    pctBadgeClass = 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30';
  }

  return { pct, pctClamped, isOver100, budgetLeft, excess, barColorClass, pctBadgeClass };
}

function buildIncomeDesktopRowHTML(item, tracked, totalIncome) {
  const sharePct = totalIncome > 0 ? (tracked / totalIncome) * 100 : 0;
  const shareClamped = Math.min(100, Math.max(0, sharePct));
  const escapedName = item.name.replace(/'/g, "\\'");
  const displayCatName = translateCategoryName(item.name);

  return `
    <tr class="group">
      <td class="py-3.5 pl-4 pr-3 whitespace-nowrap">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/70 flex items-center justify-center text-emerald-400">
              <i data-lucide="${item.icon || 'coins'}" class="w-4 h-4"></i>
            </div>
            <div>
              <span class="font-medium text-slate-100 text-sm">${displayCatName}</span>
              <span class="block text-[10px] text-slate-400">${t('income_source_sub')}</span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              onclick="openQuickAddModal('Income', '${escapedName}')"
              title="+ ${displayCatName}"
              class="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all text-xs flex items-center gap-1"
            >
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            </button>
            <button
              onclick="clearCategoryNominal('Income', '${escapedName}', ${item.isCustom ? `'${item.id}'` : 'null'})"
              title="${t('btn_reset')} ${displayCatName}"
              class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 transition-all text-xs"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </td>

      <td class="py-3.5 px-3 text-center whitespace-nowrap">
        <span class="inline-block font-mono-num text-xs font-semibold px-2.5 py-1 rounded-full border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
          ${sharePct.toFixed(1)}%
        </span>
      </td>

      <td class="py-3.5 px-4 min-w-[160px] w-56">
        <div class="w-full h-2.5 rounded-full progress-track">
          <div
            class="h-full rounded-full progress-fill bg-gradient-to-r from-emerald-500 to-teal-400"
            style="width: ${shareClamped}%"
          ></div>
        </div>
      </td>

      <td class="py-3.5 pl-3 pr-4 text-right whitespace-nowrap font-mono-num text-sm font-bold ${
        tracked > 0 ? 'text-emerald-300' : 'text-slate-500'
      }">
        ${formatRp(tracked)}
      </td>
    </tr>
  `;
}

function buildIncomeMobileCardHTML(item, tracked, totalIncome) {
  const sharePct = totalIncome > 0 ? (tracked / totalIncome) * 100 : 0;
  const shareClamped = Math.min(100, Math.max(0, sharePct));
  const escapedName = item.name.replace(/'/g, "\\'");
  const displayCatName = translateCategoryName(item.name);

  return `
    <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/70 flex items-center justify-center text-emerald-400 shrink-0">
            <i data-lucide="${item.icon || 'coins'}" class="w-4 h-4"></i>
          </div>
          <div class="truncate">
            <div class="font-semibold text-slate-100 text-sm truncate">${displayCatName}</div>
            <span class="block text-[10px] text-slate-400">${t('income_source_sub')}</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span class="font-mono-num text-[11px] font-semibold px-2 py-0.5 rounded-full border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
            ${sharePct.toFixed(0)}%
          </span>
          <button
            onclick="openQuickAddModal('Income', '${escapedName}')"
            class="p-2 rounded-lg bg-emerald-500/15 active:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
            title="+ ${displayCatName}"
          >
            <i data-lucide="plus" class="w-4 h-4"></i>
          </button>
          <button
            onclick="clearCategoryNominal('Income', '${escapedName}', ${item.isCustom ? `'${item.id}'` : 'null'})"
            class="p-2 rounded-lg bg-rose-500/10 active:bg-rose-500/25 text-rose-300 border border-rose-500/25"
            title="${t('btn_reset')} ${displayCatName}"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <div class="w-full h-2 rounded-full progress-track">
        <div class="h-full rounded-full progress-fill bg-gradient-to-r from-emerald-500 to-teal-400" style="width: ${shareClamped}%"></div>
      </div>

      <div class="bg-slate-950/55 rounded-lg p-2.5 border border-slate-800/80 flex items-center justify-between">
        <span class="text-[11px] text-slate-400 font-medium">${t('th_total_in')}:</span>
        <span class="font-mono-num text-sm font-extrabold ${
          tracked > 0 ? 'text-emerald-300' : 'text-slate-400'
        }">${formatRp(tracked)}</span>
      </div>
    </div>
  `;
}

function buildIncomeTableFooterHTML(totalIncome) {
  const pct = totalIncome > 0 ? 100 : 0;
  return `
    <tr class="bg-slate-900/80 border-t-2 border-slate-700 font-semibold text-slate-100">
      <td class="py-3.5 pl-4 pr-3 text-sm uppercase tracking-wider text-slate-300">${t('footer_total_income')}</td>
      <td class="py-3.5 px-3 text-center font-mono-num text-xs">
        <span class="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${pct.toFixed(0)}%</span>
      </td>
      <td class="py-3.5 px-4">
        <div class="w-full h-2.5 rounded-full progress-track">
          <div class="h-full rounded-full bg-emerald-500" style="width: ${pct}%"></div>
        </div>
      </td>
      <td class="py-3.5 pl-3 pr-4 text-right font-mono-num text-sm font-extrabold text-emerald-300">${formatRp(totalIncome)}</td>
    </tr>
  `;
}

function buildCategoryDesktopRowHTML(item, tracked, budget, type) {
  const escapedName = item.name.replace(/'/g, "\\'");
  const displayCatName = translateCategoryName(item.name);

  if (item.noBudget) {
    const barFill = tracked > 0 ? 100 : 0;
    return `
      <tr class="group">
        <td class="py-3.5 pl-4 pr-3 whitespace-nowrap">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/70 flex items-center justify-center text-blue-400">
                <i data-lucide="${item.icon || 'shield-alert'}" class="w-4 h-4"></i>
              </div>
              <div>
                <span class="font-medium text-slate-100 text-sm">${displayCatName}</span>
                <span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">${t('no_min_budget_badge')}</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                onclick="openQuickAddModal('${type}', '${escapedName}')"
                title="+ ${displayCatName}"
                class="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all text-xs flex items-center gap-1"
              >
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              </button>
              <button
                onclick="clearCategoryNominal('${type}', '${escapedName}', ${item.isCustom ? `'${item.id}'` : 'null'})"
                title="${t('btn_reset')} ${displayCatName}"
                class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 transition-all text-xs"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        </td>

        <td class="py-3.5 px-3 text-right whitespace-nowrap font-mono-num text-sm font-semibold ${
          tracked > 0 ? 'text-blue-300' : 'text-slate-500'
        }">
          ${formatRp(tracked)}
        </td>

        <td class="py-3.5 px-3 text-right whitespace-nowrap text-xs italic text-slate-400">
          ${t('no_min_label')}
        </td>

        <td class="py-3.5 px-3 text-center whitespace-nowrap">
          <span class="inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full border text-blue-300 bg-blue-500/15 border-blue-500/30">
            ${t('ready_to_use_badge')}
          </span>
        </td>

        <td class="py-3.5 px-4 min-w-[150px] w-44">
          <div class="w-full h-2.5 rounded-full progress-track">
            <div
              class="h-full rounded-full progress-fill bg-gradient-to-r from-blue-500 to-cyan-400"
              style="width: ${barFill}%"
            ></div>
          </div>
        </td>

        <td class="py-3.5 px-3 text-right whitespace-nowrap text-xs text-slate-500">—</td>
        <td class="py-3.5 pl-3 pr-4 text-right whitespace-nowrap text-xs text-slate-500">—</td>
      </tr>
    `;
  }

  const { pct, pctClamped, isOver100, budgetLeft, excess, barColorClass, pctBadgeClass } =
    getProgressStyles(tracked, budget, type);

  return `
    <tr class="group">
      <td class="py-3.5 pl-4 pr-3 whitespace-nowrap">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/70 flex items-center justify-center text-slate-300 group-hover:border-emerald-500/40 group-hover:text-emerald-400 transition-colors">
              <i data-lucide="${item.icon || 'folder'}" class="w-4 h-4"></i>
            </div>
            <div>
              <span class="font-medium text-slate-100 text-sm">${displayCatName}</span>
              ${
                isOver100
                  ? `<span class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">${t('over_budget_badge')}</span>`
                  : ''
              }
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              onclick="openQuickAddModal('${type}', '${escapedName}')"
              title="+ ${displayCatName}"
              class="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all text-xs flex items-center gap-1"
            >
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            </button>
            <button
              onclick="clearCategoryNominal('${type}', '${escapedName}', ${item.isCustom ? `'${item.id}'` : 'null'})"
              title="${t('btn_reset')} ${displayCatName}"
              class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 transition-all text-xs"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </td>

      <td class="py-3.5 px-3 text-right whitespace-nowrap font-mono-num text-sm font-semibold ${
        tracked > 0 ? 'text-slate-100' : 'text-slate-500'
      }">
        ${formatRp(tracked)}
      </td>

      <td class="py-3.5 px-3 text-right whitespace-nowrap font-mono-num text-sm text-slate-300">
        <span
          onclick="openSingleBudgetPrompt('${escapedName}')"
          title="${t('btn_set_budget')} ${displayCatName}"
          class="budget-editable"
        >${formatRp(budget)}</span>
      </td>

      <td class="py-3.5 px-3 text-center whitespace-nowrap">
        <span class="inline-block font-mono-num text-xs font-semibold px-2.5 py-1 rounded-full border ${pctBadgeClass}">
          ${pct.toFixed(1)}%
        </span>
      </td>

      <td class="py-3.5 px-4 min-w-[150px] w-44">
        <div class="w-full h-2.5 rounded-full progress-track">
          <div
            class="h-full rounded-full progress-fill ${barColorClass}"
            style="width: ${pctClamped}%"
          ></div>
        </div>
      </td>

      <td class="py-3.5 px-3 text-right whitespace-nowrap font-mono-num text-sm ${
        budgetLeft > 0 ? 'text-emerald-400/90' : 'text-slate-500'
      }">
        ${formatRp(budgetLeft)}
      </td>

      <td class="py-3.5 pl-3 pr-4 text-right whitespace-nowrap font-mono-num text-sm font-semibold ${
        excess > 0 ? 'text-rose-400' : 'text-slate-600'
      }">
        ${excess > 0 ? '+' + formatRp(excess) : formatRp(0)}
      </td>
    </tr>
  `;
}

function buildCategoryMobileCardHTML(item, tracked, budget, type) {
  const escapedName = item.name.replace(/'/g, "\\'");
  const displayCatName = translateCategoryName(item.name);

  if (item.noBudget) {
    return `
      <div class="p-3.5 rounded-xl bg-slate-900/65 border border-blue-500/25 space-y-2.5">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/70 flex items-center justify-center text-blue-400 shrink-0">
              <i data-lucide="${item.icon || 'shield-alert'}" class="w-4 h-4"></i>
            </div>
            <div class="truncate">
              <div class="font-semibold text-slate-100 text-sm truncate">${displayCatName}</div>
              <span class="inline-block text-[10px] font-semibold text-blue-400">${t('no_min_budget_badge')}</span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button
              onclick="openQuickAddModal('${type}', '${escapedName}')"
              class="p-2 rounded-lg bg-emerald-500/15 active:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
              title="+ ${displayCatName}"
            >
              <i data-lucide="plus" class="w-4 h-4"></i>
            </button>
            <button
              onclick="clearCategoryNominal('${type}', '${escapedName}', ${item.isCustom ? `'${item.id}'` : 'null'})"
              class="p-2 rounded-lg bg-rose-500/10 active:bg-rose-500/25 text-rose-300 border border-rose-500/25"
              title="${t('btn_reset')} ${displayCatName}"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <div class="bg-slate-950/55 rounded-lg p-2.5 border border-slate-800/80 flex items-center justify-between">
          <div>
            <span class="text-[10px] uppercase text-slate-400 block">${t('emergency_fund_balance')}</span>
            <span class="text-[10px] text-slate-500">${t('emergency_fund_sub')}</span>
          </div>
          <span class="font-mono-num text-sm font-extrabold ${
            tracked > 0 ? 'text-blue-300' : 'text-slate-400'
          }">${formatRp(tracked)}</span>
        </div>
      </div>
    `;
  }

  const { pct, pctClamped, isOver100, budgetLeft, excess, barColorClass, pctBadgeClass } =
    getProgressStyles(tracked, budget, type);

  return `
    <div class="p-3.5 rounded-xl bg-slate-900/65 border ${
      isOver100 ? 'border-rose-500/40' : 'border-slate-800'
    } space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/70 flex items-center justify-center text-slate-300 shrink-0">
            <i data-lucide="${item.icon || 'folder'}" class="w-4 h-4"></i>
          </div>
          <div class="truncate">
            <div class="font-semibold text-slate-100 text-sm truncate">${displayCatName}</div>
            ${
              isOver100
                ? `<span class="inline-block text-[10px] font-semibold text-rose-400">${t('over_budget_badge')}</span>`
                : ''
            }
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <span class="font-mono-num text-[11px] font-semibold px-2 py-0.5 rounded-full border ${pctBadgeClass}">
            ${pct.toFixed(0)}%
          </span>
          <button
            onclick="openQuickAddModal('${type}', '${escapedName}')"
            class="p-2 rounded-lg bg-emerald-500/15 active:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30"
            title="+ ${displayCatName}"
          >
            <i data-lucide="plus" class="w-4 h-4"></i>
          </button>
          <button
            onclick="clearCategoryNominal('${type}', '${escapedName}', ${item.isCustom ? `'${item.id}'` : 'null'})"
            class="p-2 rounded-lg bg-rose-500/10 active:bg-rose-500/25 text-rose-300 border border-rose-500/25"
            title="${t('btn_reset')} ${displayCatName}"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>

      <div class="w-full h-2 rounded-full progress-track">
        <div class="h-full rounded-full progress-fill ${barColorClass}" style="width: ${pctClamped}%"></div>
      </div>

      <div class="grid grid-cols-2 gap-2 pt-1 text-xs">
        <div class="bg-slate-950/55 rounded-lg p-2 border border-slate-800/80">
          <span class="text-[10px] uppercase text-slate-400 block">${t('th_tracked')}</span>
          <span class="font-mono-num font-bold text-slate-100">${formatRp(tracked)}</span>
        </div>
        <div
          onclick="openSingleBudgetPrompt('${escapedName}')"
          class="bg-slate-950/55 rounded-lg p-2 border border-slate-800/80 cursor-pointer active:border-emerald-500/50"
        >
          <span class="text-[10px] uppercase text-slate-400 flex items-center justify-between">
            <span>${t('th_monthly_budget')}</span>
            <i data-lucide="pencil" class="w-2.5 h-2.5 text-emerald-400"></i>
          </span>
          <span class="font-mono-num font-semibold text-slate-300">${formatRp(budget)}</span>
        </div>
        <div class="bg-slate-950/40 rounded-lg px-2 py-1.5 flex items-center justify-between">
          <span class="text-[10px] text-slate-400">${t('th_left')}:</span>
          <span class="font-mono-num text-emerald-400 font-medium">${formatRp(budgetLeft)}</span>
        </div>
        <div class="bg-slate-950/40 rounded-lg px-2 py-1.5 flex items-center justify-between">
          <span class="text-[10px] text-slate-400">${t('th_excess')}:</span>
          <span class="font-mono-num ${excess > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}">
            ${excess > 0 ? '+' + formatRp(excess) : formatRp(0)}
          </span>
        </div>
      </div>
    </div>
  `;
}

function buildTableFooterHTML(label, totalTracked, totalBudget, type) {
  const { pct, pctClamped, isOver100, budgetLeft, excess } = getProgressStyles(
    totalTracked,
    totalBudget,
    type
  );

  let barColorClass = 'bg-emerald-500';
  if (isOver100) barColorClass = 'bg-rose-500';
  else if (type === 'Savings') barColorClass = 'bg-blue-500';

  return `
    <tr class="bg-slate-900/80 border-t-2 border-slate-700 font-semibold text-slate-100">
      <td class="py-3.5 pl-4 pr-3 text-sm uppercase tracking-wider text-slate-300">${label}</td>
      <td class="py-3.5 px-3 text-right font-mono-num text-sm text-white">${formatRp(totalTracked)}</td>
      <td class="py-3.5 px-3 text-right font-mono-num text-sm text-slate-300">${formatRp(totalBudget)}</td>
      <td class="py-3.5 px-3 text-center font-mono-num text-xs">
        <span class="px-2.5 py-1 rounded-full ${
          isOver100 ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40' : 'bg-slate-800 text-slate-200'
        }">${pct.toFixed(1)}%</span>
      </td>
      <td class="py-3.5 px-4">
        <div class="w-full h-2.5 rounded-full progress-track">
          <div class="h-full rounded-full ${barColorClass}" style="width: ${pctClamped}%"></div>
        </div>
      </td>
      <td class="py-3.5 px-3 text-right font-mono-num text-sm text-emerald-400">${formatRp(budgetLeft)}</td>
      <td class="py-3.5 pl-3 pr-4 text-right font-mono-num text-sm ${
        excess > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'
      }">${excess > 0 ? '+' + formatRp(excess) : formatRp(0)}</td>
    </tr>
  `;
}

function renderBreakdownTables(metrics) {
  const schema = getActiveSchema();
  const { trackedByCategory, cumulativeSavingsByCategory, totalIncome } = metrics;

  // 1. INCOME
  let incomeDesktopHTML = '';
  let incomeMobileHTML = '';
  let incTotalTracked = 0;

  schema.Income.groups.forEach((group) => {
    group.items.forEach((item) => {
      const tracked = trackedByCategory[item.name] || 0;
      incTotalTracked += tracked;
      incomeDesktopHTML += buildIncomeDesktopRowHTML(item, tracked, totalIncome);
      incomeMobileHTML += buildIncomeMobileCardHTML(item, tracked, totalIncome);
    });
  });
  incomeDesktopHTML += buildIncomeTableFooterHTML(incTotalTracked);
  document.getElementById('tbodyIncome').innerHTML = incomeDesktopHTML;
  document.getElementById('mobileCardsIncome').innerHTML = incomeMobileHTML;

  // 2. EXPENSES
  let expenseDesktopHTML = '';
  let expenseMobileHTML = '';
  let expTotalTracked = 0;
  let expTotalBudget = 0;

  schema.Expense.groups.forEach((group) => {
    group.items.forEach((item) => {
      const tracked = trackedByCategory[item.name] || 0;
      const budget = getCategoryBudget(item.name);
      expTotalTracked += tracked;
      expTotalBudget += budget;
      expenseDesktopHTML += buildCategoryDesktopRowHTML(item, tracked, budget, 'Expense');
      expenseMobileHTML += buildCategoryMobileCardHTML(item, tracked, budget, 'Expense');
    });
  });

  expenseDesktopHTML += buildTableFooterHTML(t('footer_total_expense'), expTotalTracked, expTotalBudget, 'Expense');
  document.getElementById('tbodyExpense').innerHTML = expenseDesktopHTML;
  document.getElementById('mobileCardsExpense').innerHTML = expenseMobileHTML;

  // 3. SAVINGS
  let savingsDesktopHTML = '';
  let savingsMobileHTML = '';
  let savTotalTracked = 0;
  let savTotalBudget = 0;

  schema.Savings.groups.forEach((group) => {
    group.items.forEach((item) => {
      const tracked = cumulativeSavingsByCategory[item.name] || 0;
      const budget = item.noBudget ? 0 : getCategoryBudget(item.name);
      savTotalTracked += tracked;
      if (!item.noBudget) savTotalBudget += budget;
      savingsDesktopHTML += buildCategoryDesktopRowHTML(item, tracked, budget, 'Savings');
      savingsMobileHTML += buildCategoryMobileCardHTML(item, tracked, budget, 'Savings');
    });
  });
  savingsDesktopHTML += buildTableFooterHTML(t('footer_total_savings'), savTotalTracked, savTotalBudget, 'Savings');
  document.getElementById('tbodySavings').innerHTML = savingsDesktopHTML;
  document.getElementById('mobileCardsSavings').innerHTML = savingsMobileHTML;
}

// ================= AKSI HAPUS NOMINAL DI SEMUA TAB =================

function clearCategoryNominal(type, categoryName, customId = null) {
  let removedCount = 0;

  if (type === 'Savings') {
    const beforeLen = state.transactions.length;
    state.transactions = state.transactions.filter((tx) => {
      if (tx.type !== 'Savings' || tx.category !== categoryName) return true;
      if (!tx.date) return false;
      const txYear = parseInt(tx.date.split('-')[0], 10);
      const txMonth = parseInt(tx.date.split('-')[1], 10) - 1;
      const isUpToPeriod =
        state.selectedMonth === -1
          ? txYear <= state.selectedYear
          : txYear < state.selectedYear ||
            (txYear === state.selectedYear && txMonth <= state.selectedMonth);
      return !isUpToPeriod;
    });
    removedCount = beforeLen - state.transactions.length;
  } else {
    const beforeLen = state.transactions.length;
    state.transactions = state.transactions.filter((tx) => {
      const inPeriod = isTransactionInSelectedPeriod(tx);
      if (inPeriod && tx.type === type && tx.category === categoryName) {
        return false;
      }
      return true;
    });
    removedCount = beforeLen - state.transactions.length;
  }

  const m = state.selectedMonth === -1 ? getCurrentDateInfo(state.language).month : state.selectedMonth;
  const budgetKey = makeBudgetKey(categoryName, state.selectedYear, m);
  const hadBudget = Boolean(state.budgets[budgetKey]);

  if (removedCount > 0) {
    saveTransactionsToStorage();
    refreshDashboard();
    showToast(`Nominal "${categoryName}" berhasil dihapus (${formatRp(0)}).`);
    return;
  }

  if (hadBudget) {
    delete state.budgets[budgetKey];
    saveBudgetsToStorage();
    refreshDashboard();
    showToast(`Budget "${categoryName}" direset ke ${formatRp(0)}.`);
    return;
  }

  if (customId) {
    deleteCustomCategory(type, customId, categoryName);
    return;
  }

  showToast(`Nominal "${categoryName}" sudah ${formatRp(0)}.`);
}

function clearWalletNominal(walletId) {
  const calculated = getCalculatedWallets();
  const target = calculated.find((w) => w.id === walletId);
  if (!target) return;

  if (target.currentBalance !== 0) {
    const idx = state.wallets.findIndex((w) => w.id === walletId);
    if (idx !== -1) {
      const netDelta = getWalletNetTxDelta(target.name);
      state.wallets[idx].initialBalance = -netDelta;
      saveWalletsToStorage();
      refreshDashboard();
      showToast(`Nominal saldo "${target.name}" berhasil direset menjadi ${formatRp(0)}.`);
    }
    return;
  }

  deleteWallet(walletId);
}

// ================= RENDER UI: ANALYTICS CHARTS (CHART.JS DUAL MODE AWARE) =================

function renderAnalyticsCharts(metrics) {
  const schema = getActiveSchema();
  const { trackedByCategory, cumulativeSavingsByCategory } = metrics;
  const isLight = state.theme === 'light';
  const legendTextColor = isLight ? '#334155' : '#cbd5e1';
  const emptySliceColor = isLight ? '#e2e8f0' : '#1e293b';
  const chartBorderColor = isLight ? '#ffffff' : '#0f172a';
  const gridColor = isLight ? 'rgba(203, 213, 225, 0.55)' : 'rgba(51, 65, 85, 0.32)';
  const tickMutedColor = isLight ? '#475569' : '#94a3b8';
  const activeTickColor = isLight ? '#059669' : '#34d399';

  // 1. Donut Chart: Top Spending Categories
  const expenseCategories = [];
  schema.Expense.groups.forEach((group) => {
    group.items.forEach((item) => {
      const val = trackedByCategory[item.name] || 0;
      if (val > 0) {
        expenseCategories.push({ name: translateCategoryName(item.name), amount: val });
      }
    });
  });

  expenseCategories.sort((a, b) => b.amount - a.amount);
  const hasSpending = expenseCategories.length > 0;
  const ctxSpending = document.getElementById('chartTopSpending').getContext('2d');
  if (charts.topSpending) charts.topSpending.destroy();

  charts.topSpending = new Chart(ctxSpending, {
    type: 'doughnut',
    data: {
      labels: hasSpending
        ? expenseCategories.map((d) => d.name)
        : [`${t('chart_empty_label')} (${formatRp(0)})`],
      datasets: [
        {
          data: hasSpending ? expenseCategories.map((d) => d.amount) : [1],
          backgroundColor: hasSpending
            ? ['#f43f5e', '#f59e0b', '#06b6d4', '#10b981', '#8b5cf6', '#fb7185']
            : [emptySliceColor],
          borderColor: chartBorderColor,
          borderWidth: 3,
          hoverOffset: hasSpending ? 6 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: legendTextColor,
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
            padding: 8,
            usePointStyle: true,
            pointStyleWidth: 7
          }
        },
        tooltip: {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.92)',
          titleColor: isLight ? '#0f172a' : '#f8fafc',
          bodyColor: isLight ? '#334155' : '#e2e8f0',
          borderColor: isLight ? '#cbd5e1' : 'rgba(71, 85, 105, 0.6)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              if (!hasSpending) return ` ${formatRp(0)}`;
              const val = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${context.label}: ${formatRp(val)} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // 2. Donut Chart: Savings Distribution
  const savingsItems = schema.Savings.groups[0].items;
  const savingsDataList = savingsItems
    .map((item) => ({
      name: translateCategoryName(item.name),
      amount: cumulativeSavingsByCategory[item.name] || 0
    }))
    .filter((d) => d.amount > 0);
  const hasSavings = savingsDataList.length > 0;

  const ctxSavings = document.getElementById('chartSavingsDist').getContext('2d');
  if (charts.savingsDist) charts.savingsDist.destroy();

  charts.savingsDist = new Chart(ctxSavings, {
    type: 'doughnut',
    data: {
      labels: hasSavings
        ? savingsDataList.map((d) => d.name)
        : [`${t('chart_empty_label')} (${formatRp(0)})`],
      datasets: [
        {
          data: hasSavings ? savingsDataList.map((d) => d.amount) : [1],
          backgroundColor: hasSavings
            ? ['#3b82f6', '#10b981', '#06b6d4', '#8b5cf6', '#f59e0b']
            : [emptySliceColor],
          borderColor: chartBorderColor,
          borderWidth: 3,
          hoverOffset: hasSavings ? 6 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: legendTextColor,
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
            padding: 8,
            usePointStyle: true,
            pointStyleWidth: 7
          }
        },
        tooltip: {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.92)',
          titleColor: isLight ? '#0f172a' : '#f8fafc',
          bodyColor: isLight ? '#334155' : '#e2e8f0',
          borderColor: isLight ? '#cbd5e1' : 'rgba(71, 85, 105, 0.6)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              if (!hasSavings) return ` ${formatRp(0)}`;
              const val = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${context.label}: ${formatRp(val)} (${pct}%)`;
            }
          }
        }
      }
    }
  });

  // 3. Grouped Bar Chart: Actual Spending vs Budget per Bulan
  const monthlyActuals = new Array(12).fill(0);
  const monthlyBudgets = new Array(12).fill(0);

  const expenseCategoryNames = new Set();
  schema.Expense.groups.forEach((g) => g.items.forEach((i) => expenseCategoryNames.add(i.name)));

  for (let m = 0; m < 12; m++) {
    let mSum = 0;
    expenseCategoryNames.forEach((catName) => {
      mSum += Number(state.budgets[makeBudgetKey(catName, state.selectedYear, m)]) || 0;
    });
    monthlyBudgets[m] = mSum;
  }

  state.transactions.forEach((tx) => {
    if (tx.type !== 'Expense' || !tx.date) return;
    const parts = tx.date.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    if (y === state.selectedYear && m >= 0 && m < 12) {
      monthlyActuals[m] += Number(tx.amount) || 0;
    }
  });

  document.getElementById('barChartYearLabel').textContent = state.selectedYear;

  const ctxBar = document.getElementById('chartMonthlyBar').getContext('2d');
  if (charts.monthlyBar) charts.monthlyBar.destroy();

  const actualBarColors = monthlyActuals.map((actual, idx) => {
    const isSelected = state.selectedMonth === idx;
    const mBudget = monthlyBudgets[idx];
    if (mBudget > 0 && actual > mBudget) {
      return isSelected ? '#f43f5e' : 'rgba(244, 63, 94, 0.82)';
    }
    return isSelected ? '#10b981' : 'rgba(16, 185, 129, 0.78)';
  });

  const maxDataVal = Math.max(...monthlyActuals, ...monthlyBudgets, 0);
  const ySuggestedMax = maxDataVal > 0 ? Math.ceil((maxDataVal * 1.15) / 100) * 100 : 1000000;

  charts.monthlyBar = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: getShortMonthNames(),
      datasets: [
        {
          label: t('chart_actual_legend'),
          data: monthlyActuals,
          backgroundColor: actualBarColors,
          borderRadius: 5,
          barPercentage: 0.78,
          categoryPercentage: 0.68,
          minBarLength: 3
        },
        {
          label: t('chart_budget_legend'),
          data: monthlyBudgets,
          backgroundColor: isLight ? 'rgba(100, 116, 139, 0.22)' : 'rgba(148, 163, 184, 0.25)',
          borderColor: isLight ? 'rgba(100, 116, 139, 0.5)' : 'rgba(148, 163, 184, 0.55)',
          borderWidth: 1,
          borderRadius: 5,
          barPercentage: 0.78,
          categoryPercentage: 0.68,
          minBarLength: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 4, right: 4, bottom: 0, left: 0 }
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: (ctx) => (ctx.index === state.selectedMonth ? activeTickColor : tickMutedColor),
            font: (ctx) => ({
              family: "'Plus Jakarta Sans', sans-serif",
              size: window.innerWidth < 640 ? 9.5 : 10.5,
              weight: ctx.index === state.selectedMonth ? '700' : '500'
            }),
            autoSkip: false,
            maxRotation: 0,
            minRotation: 0,
            padding: 4
          }
        },
        y: {
          beginAtZero: true,
          suggestedMax: ySuggestedMax,
          border: { display: false, dash: [4, 4] },
          grid: {
            color: gridColor,
            tickLength: 0
          },
          ticks: {
            color: tickMutedColor,
            maxTicksLimit: 5,
            padding: 6,
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: function (value) {
              if (value === 0) return formatRp(0);
              return formatCompactRp(value);
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.92)',
          titleColor: isLight ? '#0f172a' : '#f8fafc',
          bodyColor: isLight ? '#334155' : '#e2e8f0',
          borderColor: isLight ? '#cbd5e1' : 'rgba(71, 85, 105, 0.65)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function (context) {
              return ` ${context.dataset.label}: ${formatRp(context.parsed.y)}`;
            }
          }
        }
      }
    }
  });
}

// ================= RENDER UI: RIWAYAT TRANSAKSI =================

function buildTxItemCardHTML(tx) {
  let badgeClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  let amountClass = 'text-emerald-400';
  let sign = '+';

  if (tx.type === 'Expense') {
    badgeClass = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    amountClass = 'text-rose-400';
    sign = '-';
  } else if (tx.type === 'Savings') {
    badgeClass = 'bg-blue-500/15 text-blue-300 border-blue-500/30';
    amountClass = 'text-blue-400';
    sign = '';
  }

  const formattedDate = new Date(tx.date + 'T00:00:00').toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const displayCategory = translateCategoryName(tx.category);
  const displayType = translateTxType(tx.type);

  return `
    <div class="p-3.5 rounded-xl bg-slate-900/65 border border-slate-800/90 flex items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}">${displayType}</span>
          <span class="text-[11px] font-mono-num text-slate-400">${formattedDate}</span>
        </div>
        <div class="text-sm font-semibold text-slate-100 truncate">${displayCategory}</div>
        <div class="text-xs text-slate-400 truncate">
          ${tx.account}${tx.note ? ` • ${tx.note}` : ''}
        </div>
      </div>

      <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
        <span class="font-mono-num text-sm font-bold ${amountClass}">
          ${sign}${formatRp(tx.amount)}
        </span>
        <div class="flex items-center gap-1">
          <button
            onclick="openEditTransactionModal('${tx.id}')"
            class="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-emerald-400"
            title="${t('modal_tx_edit_title')}"
          >
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button
            onclick="deleteTransaction('${tx.id}')"
            class="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/25 border border-rose-500/25"
            title="${t('btn_reset')}"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTransactionHistory(filteredTx) {
  const query = state.txSearchQuery.trim().toLowerCase();
  const typeFilter = state.txTypeFilter;

  const list = filteredTx
    .filter((tx) => {
      const matchType = typeFilter === 'ALL' || tx.type === typeFilter;
      const translatedCat = translateCategoryName(tx.category || '').toLowerCase();
      const matchSearch =
        !query ||
        (tx.category && tx.category.toLowerCase().includes(query)) ||
        translatedCat.includes(query) ||
        (tx.account && tx.account.toLowerCase().includes(query)) ||
        (tx.note && tx.note.toLowerCase().includes(query));
      return matchType && matchSearch;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  document.getElementById('txCountBadge').textContent = `${list.length} ${t('tx_count_suffix')}`;

  const recent5 = [...filteredTx].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recentContainer = document.getElementById('dashboardRecentTxList');
  if (recent5.length === 0) {
    recentContainer.innerHTML = `
      <div class="py-6 text-center text-slate-400 text-xs sm:text-sm">
        ${t('tx_empty_period')} (${formatRp(0)}).
      </div>
    `;
  } else {
    recentContainer.innerHTML = recent5.map((tx) => buildTxItemCardHTML(tx)).join('');
  }

  const tbody = document.getElementById('tbodyTransactions');
  const mobileListEl = document.getElementById('mobileTransactionsList');

  if (list.length === 0) {
    const emptyHTML = `
      <div class="py-10 text-center text-slate-400">
        <div class="flex flex-col items-center justify-center gap-2">
          <i data-lucide="inbox" class="w-8 h-8 text-slate-600"></i>
          <p class="text-sm">${t('tx_empty_period')} (${formatRp(0)}).</p>
        </div>
      </div>
    `;
    tbody.innerHTML = `<tr><td colspan="6">${emptyHTML}</td></tr>`;
    mobileListEl.innerHTML = emptyHTML;
    return;
  }

  mobileListEl.innerHTML = list.map((tx) => buildTxItemCardHTML(tx)).join('');

  tbody.innerHTML = list
    .map((tx) => {
      let badgeHTML = '';
      let amountClass = '';
      let sign = '';
      const displayType = translateTxType(tx.type);
      const displayCategory = translateCategoryName(tx.category);

      if (tx.type === 'Income') {
        badgeHTML = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">${displayType}</span>`;
        amountClass = 'text-emerald-400';
        sign = '+';
      } else if (tx.type === 'Expense') {
        badgeHTML = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">${displayType}</span>`;
        amountClass = 'text-rose-400';
        sign = '-';
      } else {
        badgeHTML = `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">${displayType}</span>`;
        amountClass = 'text-blue-400';
        sign = '';
      }

      const formattedDate = new Date(tx.date + 'T00:00:00').toLocaleDateString(getActiveLocale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      return `
        <tr class="hover:bg-slate-800/35 transition-colors">
          <td class="py-3 pl-4 pr-3 whitespace-nowrap text-xs font-mono-num text-slate-300">${formattedDate}</td>
          <td class="py-3 px-3 whitespace-nowrap">${badgeHTML}</td>
          <td class="py-3 px-3">
            <div class="text-sm font-medium text-slate-100">${displayCategory}</div>
            ${tx.note ? `<div class="text-xs text-slate-400 mt-0.5">${tx.note}</div>` : ''}
          </td>
          <td class="py-3 px-3 whitespace-nowrap text-xs text-slate-300">
            <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/75 border border-slate-700/70">
              <i data-lucide="wallet" class="w-3 h-3 text-emerald-400"></i>
              ${tx.account}
            </span>
          </td>
          <td class="py-3 px-3 text-right whitespace-nowrap font-mono-num text-sm font-semibold ${amountClass}">
            ${sign}${formatRp(tx.amount)}
          </td>
          <td class="py-3 pl-3 pr-4 text-right whitespace-nowrap">
            <div class="inline-flex items-center gap-1">
              <button
                onclick="openEditTransactionModal('${tx.id}')"
                title="${t('modal_tx_edit_title')}"
                class="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
              >
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              </button>
              <button
                onclick="deleteTransaction('${tx.id}')"
                title="${t('btn_reset')}"
                class="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/25 border border-rose-500/25 transition-colors"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

// ================= TAB PENGATURAN: TAMPILAN, MATA UANG, BAHASA, KEAMANAN & CADANGAN TRANSAKSI GOOGLE =================

function populateSettingsPreferencesDropdowns() {
  const curSelect = document.getElementById('settingsCurrencySelect');
  if (curSelect) {
    curSelect.innerHTML = Object.values(CURRENCIES)
      .map(
        (c) =>
          `<option value="${c.code}" ${c.code === state.currency ? 'selected' : ''}>${c.name}</option>`
      )
      .join('');
    curSelect.value = state.currency;
    syncCustomSelectTrigger(curSelect);
  }

  const langSelect = document.getElementById('settingsLanguageSelect');
  if (langSelect) {
    langSelect.innerHTML = SUPPORTED_LANGUAGES.map(
      (l) =>
        `<option value="${l.code}" ${l.code === state.language ? 'selected' : ''}>${l.flag} ${l.name}</option>`
    ).join('');
    langSelect.value = state.language;
    syncCustomSelectTrigger(langSelect);
  }

  const langFlagBadge = document.getElementById('languageActiveFlagBadge');
  if (langFlagBadge) {
    const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === state.language) || SUPPORTED_LANGUAGES[0];
    langFlagBadge.textContent = `${langObj.flag} ${langObj.code.toUpperCase()}`;
  }
}

function getDetectedDeviceName() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS / iPhone';
  if (/Win/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua)) return 'MacBook / macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Device';
}

function renderSettingsSection() {
  applyThemeToDOM();
  populateSettingsPreferencesDropdowns();
  renderSecuritySettingsArea();

  const accountAreaEl = document.getElementById('googleAccountCardArea');
  const authBadgeEl = document.getElementById('driveAuthBadge');
  const backupCountBadgeEl = document.getElementById('driveBackupCountBadge');
  const historyListEl = document.getElementById('driveBackupHistoryList');

  const isConnected = Boolean(state.googleAccount && state.googleAccount.email);

  if (authBadgeEl) {
    if (isConnected) {
      authBadgeEl.textContent = state.googleAccount.autoBackup
        ? t('drive_status_autosync')
        : t('drive_status_connected');
      authBadgeEl.className =
        'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shrink-0';
    } else {
      authBadgeEl.textContent = t('drive_status_unconnected');
      authBadgeEl.className =
        'px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700 shrink-0';
    }
  }

  if (backupCountBadgeEl) {
    const count = state.driveBackups ? state.driveBackups.length : 0;
    backupCountBadgeEl.textContent = `${count} ${t('drive_backups_count_suffix')}`;
  }

  if (accountAreaEl) {
    if (!isConnected) {
      accountAreaEl.innerHTML = `
        <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3.5">
          <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <i data-lucide="smartphone" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-bold text-white">${t('drive_device_sync_title')} (${getDetectedDeviceName()})</div>
              <p class="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                ${t('google_seamless_sub')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onclick="openGoogleAuthModal(false)"
            class="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-md transition-all active:scale-[0.99]"
            style="background-color:#ffffff !important; color:#1e293b !important; border-color:#cbd5e1 !important;"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"/>
              <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"/>
            </svg>
            <span style="color:#1e293b !important; font-weight:700;">Continue with Google</span>
          </button>
        </div>
      `;
    } else {
      const initials = state.googleAccount.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

      const driveFolderUrl = state.googleAccount.driveFolderId
        ? `https://drive.google.com/drive/folders/${state.googleAccount.driveFolderId}`
        : 'https://drive.google.com/drive/my-drive';

      accountAreaEl.innerHTML = `
        <div class="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2.5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-slate-950 font-extrabold text-sm flex items-center justify-center shrink-0">
                ${initials || 'G'}
              </div>
              <div class="min-w-0">
                <div class="text-xs sm:text-sm font-bold text-white truncate">${state.googleAccount.name}</div>
                <div class="text-[11px] text-emerald-400 truncate">${state.googleAccount.email}</div>
                <div class="text-[10px] text-slate-400 truncate">${t('drive_detected_on')} ${state.googleAccount.deviceLabel || getDetectedDeviceName()}</div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 shrink-0">
              <a
                href="${driveFolderUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1 transition-colors"
              >
                <i data-lucide="folder-open" class="w-3.5 h-3.5"></i>
                <span>Buka Folder Drive</span>
              </a>
              <button
                type="button"
                onclick="openGoogleAuthModal(false)"
                class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                ${t('drive_btn_switch_acc')}
              </button>
              <button
                type="button"
                onclick="disconnectGoogleAccount()"
                class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
              >
                ${t('drive_btn_logout')}
              </button>
            </div>
          </div>

          <div class="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px]">
            <span class="text-slate-300 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>${t('drive_bg_auto_label')}</span>
            </span>
            <span class="font-bold text-emerald-400">${t('sec_status_active')}</span>
          </div>
        </div>
      `;
    }
  }

  if (historyListEl) {
    if (!state.driveBackups || state.driveBackups.length === 0) {
      historyListEl.innerHTML = `
        <div class="py-4 px-3 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center text-xs text-slate-400">
          ${t('drive_empty_backups')}
        </div>
      `;
    } else {
      historyListEl.innerHTML = state.driveBackups
        .slice(0, 6)
        .map((b) => {
          const folderPath = b.folderPath || `FinanceTracker - Cadangan Transaksi / ${(b.createdAt || '').slice(0, 7) || getTodayLocalISO().slice(0, 7)}`;
          const itemFolderUrl =
            b.driveFolderUrl ||
            (state.googleAccount && state.googleAccount.driveFolderId
              ? `https://drive.google.com/drive/folders/${state.googleAccount.driveFolderId}`
              : 'https://drive.google.com/drive/my-drive');
          return `
          <div class="p-3 rounded-xl bg-slate-900/65 border border-slate-800 flex items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <i data-lucide="folder-kanban" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <a
                  href="${itemFolderUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 hover:underline truncate"
                >
                  <i data-lucide="folder" class="w-3 h-3 shrink-0"></i>
                  <span class="truncate">${folderPath}</span>
                </a>
                <div class="text-xs font-bold text-white truncate mt-0.5">${b.fileName}</div>
                <div class="text-[10px] text-slate-400 truncate">
                  ${b.txCount || 0} ${t('tx_count_suffix')} • ${b.walletCount || 0} ${t('nav_wallets')} • <span class="text-emerald-400">${b.email}</span> • ${b.createdAt}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <a
                href="${itemFolderUrl}"
                target="_blank"
                rel="noopener noreferrer"
                class="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors"
                title="Buka Folder di Google Drive"
              >
                <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
              </a>
              <button
                type="button"
                onclick="downloadBackupSnapshotJson('${b.id}')"
                class="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-colors"
                title="Download (.json)"
              >
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
              </button>
              <button
                type="button"
                onclick="deleteBackupHistoryItem('${b.id}')"
                class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 transition-colors"
                title="${t('btn_reset')}"
              >
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
        })
        .join('');
    }
  }
}

// ================= ALUR CONTINUE WITH GOOGLE (4 TAHAP SEPERTI CONTOH LYNK.ID) =================
// Tahap 1: Pilih akun Google yang terdeteksi di perangkat
// ================= REAL GOOGLE OAUTH 2.0 (GOOGLE IDENTITY SERVICES) & GOOGLE DRIVE API =================
// Alur Resmi:
// 1. Klik "Continue with Google" -> Memanggil Pop-up Resmi Google OAuth 2.0 (mendeteksi akun Google asli di perangkat)
// 2. Menyetujui kebijakan di layar resmi Google (Batal / Lanjutkan) -> Mengambil profil email & foto asli dari Google API
// 3. Masuk ke Form "Mengisi Nama Saja" (E-mail asli otomatis terisi + Input Nama Anda -> Confirm)
// 4. Muncul Pop-up "Selamat Datang, (Nama yang dimasukkan)!" & terhubung ke Google Drive API asli

// Masukkan Google OAuth Client ID Anda di sini (atau isi langsung lewat menu pengaturan di aplikasi)
const DEFAULT_GOOGLE_CLIENT_ID = '1097773326723-haj28s0pdfmm96mhbp0be8fc0bhentmf.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID_STORAGE_KEY = 'ft_v6_google_oauth_client_id';
const GOOGLE_DRIVE_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';

let pendingAutoBackupAfterLogin = false;
let googleTokenClient = null;
let latestGoogleAccessToken = '';

let googleOAuthFlowState = {
  step: 1, // 'setup_client_id' | 'loading_google' | 1 | 2 | 3 | 4
  selectedEmail: '',
  selectedDefaultName: '',
  selectedPicture: '',
  enteredName: '',
  showOtherAccountInput: false,
  showClientIdConfig: false
};

function getGoogleClientId() {
  const saved = (localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) || '').trim();
  return saved || DEFAULT_GOOGLE_CLIENT_ID.trim();
}

function saveGoogleClientId(clientId) {
  const cleaned = (clientId || '').trim();
  if (cleaned) {
    localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, cleaned);
  } else {
    localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
  }
}

/**
 * Mengambil daftar akun Google asli yang pernah login melalui Google OAuth di perangkat ini
 * (Tanpa akun paten/dummy).
 */
function getAutoDetectedDeviceGoogleAccounts() {
  const deviceLabel = getDetectedDeviceName();
  const accounts = [];
  const isDummyEmail = (email) => {
    const lower = (email || '').toLowerCase();
    return (
      lower === 'muhammaddwicahyono202@gmail.com' ||
      lower.startsWith('user.') && lower.endsWith('@gmail.com')
    );
  };

  const addUnique = (name, email, color, picture) => {
    if (!name || !email || isDummyEmail(email)) return;
    const exists = accounts.some((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!exists) {
      accounts.push({
        name,
        email,
        deviceLabel,
        color: color || '#059669',
        picture: picture || ''
      });
    }
  };

  if (state.googleAccount && state.googleAccount.email && !isDummyEmail(state.googleAccount.email)) {
    addUnique(
      state.googleAccount.name,
      state.googleAccount.email,
      '#059669',
      state.googleAccount.picture || ''
    );
  }

  if (Array.isArray(state.deviceGoogleAccounts)) {
    state.deviceGoogleAccounts = state.deviceGoogleAccounts.filter(
      (acc) => acc && acc.email && !isDummyEmail(acc.email)
    );
    state.deviceGoogleAccounts.forEach((acc) => {
      addUnique(acc.name, acc.email, '#2563eb', acc.picture || '');
    });
  }

  return accounts;
}

function handleBackupTransactionsClick() {
  if (!state.googleAccount || !state.googleAccount.email) {
    openGoogleAuthModal(true);
    return;
  }

  const now = Date.now();
  const hasValidToken = Boolean(
    latestGoogleAccessToken ||
      (state.googleAccount &&
        state.googleAccount.accessToken &&
        state.googleAccount.accessTokenExpiresAt &&
        now < state.googleAccount.accessTokenExpiresAt)
  );

  const clientId = getGoogleClientId();
  const isHttpOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  // Jika token Google Drive belum ada atau sudah kedaluwarsa, minta izin/token secara sinkron dari klik user
  if (
    !hasValidToken &&
    clientId &&
    isHttpOrigin &&
    window.google &&
    window.google.accounts &&
    window.google.accounts.oauth2
  ) {
    const refreshClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPES,
      hint: state.googleAccount.email,
      prompt: '',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          latestGoogleAccessToken = tokenResponse.access_token;
          state.googleAccount.accessToken = tokenResponse.access_token;
          state.googleAccount.accessTokenExpiresAt = Date.now() + 3300 * 1000;
          saveGoogleAccountToStorage();
          runBackgroundDriveBackup(false);
        }
      }
    });
    refreshClient.requestAccessToken({ prompt: '' });
    return;
  }

  runBackgroundDriveBackup(false);
}

function getGoogleGLogoSvg(sizeClass = 'w-4 h-4') {
  return `
    <svg class="${sizeClass} shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"/>
      <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"/>
    </svg>
  `;
}

/**
 * Membuka autentikasi Google:
 * - Jika Google OAuth Client ID sudah diisi & dibuka melalui http/https, langsung memunculkan
 *   Pop-up Resmi Google (Pilih Akun Perangkat Asli -> Setujui Kebijakan -> Lanjut ke Step 3 Isi Nama).
 * - Jika dibuka dari file:/// lokal, otomatis mengarahkan ke http://localhost:5500 agar Pop-up Resmi Google diizinkan oleh Google.
 */
async function openGoogleAuthModal(triggerBackupAfterLogin = false) {
  pendingAutoBackupAfterLogin = Boolean(triggerBackupAfterLogin);
  const clientId = getGoogleClientId();
  const isHttpOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  // Jika dibuka dari file:/// di PC dan server lokal aktif, arahkan otomatis ke http://localhost:5500
  if (window.location.protocol === 'file:') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      await fetch('http://localhost:5500/', { mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      window.location.href = 'http://localhost:5500/?tab=settings';
      return;
    } catch (_) {
      // Jika tidak ada server localhost (misal di dalam APK offline), lanjutkan dengan modal in-app
    }
  }

  // Jika Client ID sudah terpasang dan berjalan di HTTP/HTTPS (Hosting / Localhost) + GIS SDK siap, langsung buka Pop-Up Resmi Google!
  if (clientId && isHttpOrigin && window.google && window.google.accounts && window.google.accounts.oauth2) {
    launchRealGoogleOAuthPopup(clientId);
    return;
  }

  googleOAuthFlowState = {
    step: clientId ? 1 : 'setup_client_id',
    selectedEmail: '',
    selectedDefaultName: '',
    selectedPicture: '',
    enteredName: '',
    showOtherAccountInput: false,
    showClientIdConfig: !clientId
  };

  const modal = document.getElementById('modalGoogleAuth');
  if (!modal) return;

  renderGoogleAuthStep();

  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
  });
}

function launchRealGoogleOAuthPopup(clientId) {
  try {
    googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_SCOPES,
      prompt: 'select_account consent',
      callback: async (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          latestGoogleAccessToken = tokenResponse.access_token;
          await handleRealGoogleTokenSuccess(tokenResponse.access_token);
        }
      },
      error_callback: (err) => {
        console.warn('Google OAuth popup closed or error:', err);
      }
    });
    googleTokenClient.requestAccessToken({ prompt: 'select_account consent' });
  } catch (err) {
    console.error('Failed to initialize Google OAuth Client:', err);
    showToast('Client ID Google OAuth tidak valid atau belum diizinkan untuk origin ini.');
  }
}

async function handleRealGoogleTokenSuccess(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Gagal mengambil profil Google');
    const profile = await res.json();

    // Setelah user memilih akun asli & menyetujui kebijakan di pop-up Google,
    // langsung buka Tahap 3: Mengisi Nama Saja!
    googleOAuthFlowState = {
      step: 3,
      selectedEmail: profile.email || '',
      selectedDefaultName: profile.name || profile.given_name || '',
      selectedPicture: profile.picture || '',
      enteredName: profile.name || profile.given_name || '',
      showOtherAccountInput: false,
      showClientIdConfig: false
    };

    const modal = document.getElementById('modalGoogleAuth');
    if (modal) {
      renderGoogleAuthStep();
      modal.classList.remove('hidden');
      requestAnimationFrame(() => {
        modal.classList.add('modal-open');
      });
    }
  } catch (e) {
    console.error('Error fetching Google userinfo:', e);
    showToast('Gagal memuat profil akun Google.');
  }
}

function openGoogleClientIdSetupModal() {
  googleOAuthFlowState.step = 'setup_client_id';
  const modal = document.getElementById('modalGoogleAuth');
  if (!modal) return;
  renderGoogleAuthStep();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
  });
}

function handleSaveGoogleClientIdAndConnect(event) {
  if (event) event.preventDefault();
  const input = document.getElementById('googleClientIdInput');
  const raw = input ? input.value.trim() : '';
  if (!raw || !raw.includes('.apps.googleusercontent.com')) {
    showToast('Masukkan Google Client ID yang valid (akhiran .apps.googleusercontent.com)');
    return;
  }
  saveGoogleClientId(raw);
  const isHttpOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  if (isHttpOrigin && window.google && window.google.accounts && window.google.accounts.oauth2) {
    closeGoogleAuthModal();
    setTimeout(() => {
      launchRealGoogleOAuthPopup(raw);
    }, 200);
  } else {
    showToast('Client ID tersimpan! Buka aplikasi melalui http://localhost untuk memunculkan pop-up Google.');
    googleOAuthFlowState.step = 1;
    renderGoogleAuthStep();
  }
}

function renderGoogleAuthStep() {
  const container = document.getElementById('googleAuthStepContainer');
  if (!container) return;

  const step = googleOAuthFlowState.step;
  const activeLangOption =
    (typeof SUPPORTED_LANGUAGES !== 'undefined' &&
      SUPPORTED_LANGUAGES.find((l) => l.code === state.language)) || {
      name: 'Bahasa Indonesia'
    };

  const googleFooterHtml = `
    <div class="px-6 py-3.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 bg-slate-950/40">
      <div class="inline-flex items-center gap-1 font-medium text-slate-300">
        <span>${activeLangOption.name}</span>
        <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
      </div>
      <div class="flex items-center gap-4">
        <button type="button" onclick="openGoogleClientIdSetupModal()" class="hover:text-emerald-400 cursor-pointer">OAuth Client ID</button>
        <span class="hover:text-slate-200 cursor-pointer">${t('google_footer_privacy')}</span>
        <span class="hover:text-slate-200 cursor-pointer">${t('google_footer_terms')}</span>
      </div>
    </div>
  `;

  if (step === 'setup_client_id') {
    const currentClientId = getGoogleClientId();
    const currentOrigin = window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:5500';

    container.innerHTML = `
      <div>
        <div class="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            ${getGoogleGLogoSvg('w-4 h-4')}
            <span class="text-xs sm:text-sm font-bold text-white">Hubungkan Real Google OAuth 2.0</span>
          </div>
          <button
            type="button"
            onclick="closeGoogleAuthModal()"
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <form onsubmit="handleSaveGoogleClientIdAndConnect(event)" class="p-6 space-y-4">
          <div class="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-xs text-slate-300 space-y-1.5 leading-relaxed">
            <div class="font-bold text-blue-400 flex items-center gap-1.5">
              <i data-lucide="shield-check" class="w-4 h-4"></i>
              <span>Deteksi Akun Google Perangkat Asli</span>
            </div>
            <p class="text-[11px] text-slate-400">
              Agar Google mengizinkan pendeteksian akun asli di perangkat & penyimpanan ke Google Drive asli, masukkan <b>Google OAuth Client ID</b> (Web Application) Anda dari Google Cloud Console.
            </p>
            <div class="text-[11px] text-slate-400 pt-1">
              Origin URL aplikasi saat ini: <code class="px-1.5 py-0.5 rounded bg-slate-900 text-emerald-400 font-mono">${currentOrigin}</code>
            </div>
          </div>

          <div>
            <label for="googleClientIdInput" class="block text-xs font-bold text-white mb-1.5">
              Google OAuth Client ID
            </label>
            <input
              id="googleClientIdInput"
              type="text"
              required
              value="${currentClientId.replace(/"/g, '&quot;')}"
              placeholder="1234567890-abcdefg.apps.googleusercontent.com"
              class="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
            />
          </div>

          <div class="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="submit"
              class="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
              style="background: linear-gradient(135deg, #059669, #10b981) !important; color: #ffffff !important;"
            >
              <i data-lucide="check-circle-2" class="w-4 h-4"></i>
              <span>Simpan & Hubungkan Google Asli</span>
            </button>
          </div>
        </form>
      </div>
    `;
  } else if (step === 1) {
    const accounts = getAutoDetectedDeviceGoogleAccounts();
    const accountsHtml = accounts
      .map((acc) => {
        const safeName = acc.name.replace(/'/g, "\\'");
        const safeEmail = acc.email.replace(/'/g, "\\'");
        const initial = (acc.name || acc.email || 'G').trim().charAt(0).toUpperCase();

        return `
          <button
            type="button"
            onclick="handleGoogleStep1PickAccount('${safeName}', '${safeEmail}')"
            class="w-full py-3.5 px-2 border-b border-slate-800/80 hover:bg-slate-800/50 flex items-center gap-3.5 transition-colors text-left group"
          >
            <div
              class="w-9 h-9 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm"
              style="background-color: ${acc.color || '#15803d'}; color: #ffffff !important;"
            >
              ${initial}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition-colors">${acc.name}</div>
              <div class="text-xs text-slate-400 truncate">${acc.email}</div>
            </div>
          </button>
        `;
      })
      .join('');

    container.innerHTML = `
      <div>
        <!-- Top Header: Login dengan Google -->
        <div class="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            ${getGoogleGLogoSvg('w-4 h-4')}
            <span class="text-xs sm:text-sm font-medium text-slate-200">${t('google_header_login')}</span>
          </div>
          <button
            type="button"
            onclick="closeGoogleAuthModal()"
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Content: Pilih akun -->
        <div class="px-6 pt-6 pb-5">
          <div class="flex flex-col items-center text-center mb-5">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-sm">
              <i data-lucide="wallet-cards" class="w-6 h-6"></i>
            </div>
            <h3 class="text-xl font-bold text-white tracking-tight">${t('google_step1_title')}</h3>
            <p class="text-xs sm:text-sm text-slate-300 mt-1">
              ${t('google_step1_sub')}
            </p>
          </div>

          <!-- Daftar Akun Google yang Tersimpan / Gunakan Akun Lain -->
          <div class="border-t border-slate-800/80">
            ${accountsHtml}

            <!-- Gunakan akun lain -->
            <button
              type="button"
              onclick="toggleGoogleOtherAccountInput()"
              class="w-full py-3.5 px-2 border-b border-slate-800/80 hover:bg-slate-800/50 flex items-center gap-3.5 transition-colors text-left"
            >
              <div class="w-9 h-9 rounded-full bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <i data-lucide="user-circle-2" class="w-5 h-5"></i>
              </div>
              <div class="text-sm font-medium text-slate-200">${t('google_use_another_acc')}</div>
            </button>

            <div id="googleOtherAccountBox" class="${googleOAuthFlowState.showOtherAccountInput || accounts.length === 0 ? '' : 'hidden'} pt-3 pb-2 space-y-2">
              <input
                id="googleOtherEmailInput"
                type="email"
                placeholder="${t('google_other_email_placeholder')}"
                class="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
              />
              <div class="flex justify-end">
                <button
                  type="button"
                  onclick="handleGoogleOtherEmailContinue()"
                  class="px-4 py-2 rounded-full text-xs font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-all"
                >
                  ${t('google_btn_continue')}
                </button>
              </div>
            </div>
          </div>

          <!-- Policy Notice -->
          <p class="text-[11px] text-slate-400 leading-relaxed mt-5">
            ${t('google_step1_policy')}
          </p>
        </div>

        ${googleFooterHtml}
      </div>
    `;
  } else if (step === 2) {
    const email = googleOAuthFlowState.selectedEmail;
    const initial = (googleOAuthFlowState.selectedDefaultName || email || 'G')
      .trim()
      .charAt(0)
      .toUpperCase();

    container.innerHTML = `
      <div>
        <!-- Top Header: Login dengan Google -->
        <div class="px-5 py-3.5 border-b border-slate-800/90 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            ${getGoogleGLogoSvg('w-4 h-4')}
            <span class="text-xs sm:text-sm font-medium text-slate-200">${t('google_header_login')}</span>
          </div>
          <button
            type="button"
            onclick="closeGoogleAuthModal()"
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Content: Menyetujui Kebijakan -->
        <div class="px-6 pt-6 pb-6">
          <div class="flex flex-col items-center text-center mb-5">
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-sm">
              <i data-lucide="wallet-cards" class="w-6 h-6"></i>
            </div>
            <h3 class="text-xl font-bold text-white tracking-tight">${t('google_step2_title')}</h3>

            <!-- Account Pill Switcher -->
            <button
              type="button"
              onclick="googleBackToStep1()"
              class="mt-2.5 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-700/90 hover:border-slate-600 text-xs text-slate-200 transition-colors"
            >
              <span
                class="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0"
                style="background-color:#15803d; color:#ffffff !important;"
              >
                ${initial}
              </span>
              <span class="truncate max-w-[210px]">${email}</span>
              <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i>
            </button>
          </div>

          <div class="space-y-4">
            <h4 class="text-sm sm:text-base font-semibold text-white leading-snug">
              ${t('google_step2_allow_title')}
            </h4>

            <div class="flex items-start gap-3 py-2">
              <div class="w-7 h-7 rounded-full bg-slate-800/90 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                <i data-lucide="user-circle-2" class="w-4 h-4"></i>
              </div>
              <div class="min-w-0">
                <div class="text-xs sm:text-sm font-semibold text-white">${t('google_step2_email_label')}</div>
                <div class="text-xs text-slate-400 truncate">${email}</div>
              </div>
            </div>

            <div class="space-y-2.5 text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
              <p>${t('google_step2_policy_1')}</p>
              <p>${t('google_step2_policy_2')}</p>
              <p>${t('google_step2_policy_3')}</p>
            </div>

            <!-- Action Buttons: Batal & Lanjutkan -->
            <div class="grid grid-cols-2 gap-3 pt-3">
              <button
                type="button"
                onclick="googleBackToStep1()"
                class="py-2.5 px-4 rounded-full text-xs sm:text-sm font-semibold bg-slate-800/80 hover:bg-slate-800 text-blue-300 border border-slate-700 transition-all"
              >
                ${t('btn_cancel')}
              </button>
              <button
                type="button"
                onclick="handleGoogleStep2ApprovePolicy()"
                class="py-2.5 px-4 rounded-full text-xs sm:text-sm font-bold bg-blue-500/25 hover:bg-blue-500/35 text-blue-200 border border-blue-400/40 transition-all shadow-sm"
              >
                ${t('google_btn_continue')}
              </button>
            </div>
          </div>
        </div>

        ${googleFooterHtml}
      </div>
    `;
  } else if (step === 3) {
    const email = googleOAuthFlowState.selectedEmail;
    const prefillName = googleOAuthFlowState.enteredName || googleOAuthFlowState.selectedDefaultName || '';

    container.innerHTML = `
      <div>
        <!-- Green Header Banner seperti contoh Gambar 4 -->
        <div
          class="px-6 py-5 flex items-center justify-between"
          style="background: linear-gradient(135deg, #059669, #10b981) !important;"
        >
          <div>
            <div class="flex items-center gap-2">
              <i data-lucide="wallet-cards" class="w-5 h-5" style="color:#ffffff !important;"></i>
              <h3 class="text-lg font-extrabold tracking-tight" style="color:#ffffff !important;">FinanceTracker</h3>
            </div>
            <p class="text-xs mt-1" style="color:#ecfdf5 !important;">
              ${t('google_step3_banner_sub')}
            </p>
          </div>
          <button
            type="button"
            onclick="closeGoogleAuthModal()"
            class="p-1.5 rounded-lg bg-black/15 hover:bg-black/25 transition-colors"
            style="color:#ffffff !important;"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>

        <!-- Form: Hanya E-mail (otomatis) & Nama Anda saja -->
        <form onsubmit="handleGoogleStep3ConfirmName(event)" class="p-6 space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-300 mb-1.5">${t('google_step3_email_label')}</label>
            <input
              type="email"
              value="${email}"
              readonly
              class="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-slate-400 bg-slate-950/60 border border-slate-800 cursor-not-allowed focus:outline-none"
            />
          </div>

          <div>
            <label for="googleStep3NameInput" class="block text-xs font-bold text-white mb-1.5">${t('google_step3_name_label')}</label>
            <input
              id="googleStep3NameInput"
              type="text"
              required
              value="${prefillName.replace(/"/g, '&quot;')}"
              placeholder="${t('google_step3_name_placeholder')}"
              class="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <label class="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
            <input
              id="googleStep3TermsCheck"
              type="checkbox"
              checked
              required
              class="w-4 h-4 rounded accent-emerald-500"
            />
            <span class="text-xs text-slate-300">${t('google_step3_terms')}</span>
          </label>

          <div class="pt-2">
            <button
              type="submit"
              class="w-full py-3 px-4 rounded-xl text-sm font-bold transition-all shadow-lg"
              style="background: linear-gradient(135deg, #059669, #10b981) !important; color: #ffffff !important;"
            >
              ${t('google_btn_confirm')}
            </button>
          </div>
        </form>
      </div>
    `;

    setTimeout(() => {
      const nameInput = document.getElementById('googleStep3NameInput');
      if (nameInput) {
        nameInput.focus();
        nameInput.select();
      }
    }, 60);
  } else if (step === 4) {
    const finalName = googleOAuthFlowState.enteredName || googleOAuthFlowState.selectedDefaultName || 'User';
    const email = googleOAuthFlowState.selectedEmail;

    container.innerHTML = `
      <div class="p-6 sm:p-7 text-center space-y-4">
        <div class="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 mx-auto shadow-lg">
          <i data-lucide="party-popper" class="w-8 h-8"></i>
        </div>

        <div class="space-y-1.5">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-400">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i>
            <span>${t('drive_status_connected')}</span>
          </div>
          <h3 class="text-xl sm:text-2xl font-extrabold text-white tracking-tight pt-1">
            ${t('google_welcome_prefix')}, ${finalName}!
          </h3>
          <p class="text-xs font-semibold text-emerald-400">${email}</p>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
          ${t('google_welcome_sub')}
        </p>

        <div class="pt-2">
          <button
            type="button"
            onclick="finishGoogleWelcomePopup()"
            class="w-full py-3 px-4 rounded-xl text-sm font-bold transition-all shadow-lg"
            style="background: linear-gradient(135deg, #059669, #10b981) !important; color: #ffffff !important;"
          >
            ${t('google_btn_done')}
          </button>
        </div>
      </div>
    `;
  }

  if (window.lucide) {
    window.lucide.createIcons({ nodes: [container] });
  }
}

function handleGoogleStep1PickAccount(name, email) {
  googleOAuthFlowState.selectedDefaultName = name || '';
  googleOAuthFlowState.selectedEmail = email || '';
  googleOAuthFlowState.enteredName = name || '';
  googleOAuthFlowState.step = 2;
  renderGoogleAuthStep();
}

function toggleGoogleOtherAccountInput() {
  googleOAuthFlowState.showOtherAccountInput = !googleOAuthFlowState.showOtherAccountInput;
  renderGoogleAuthStep();
  if (googleOAuthFlowState.showOtherAccountInput) {
    setTimeout(() => {
      const input = document.getElementById('googleOtherEmailInput');
      if (input) input.focus();
    }, 50);
  }
}

function handleGoogleOtherEmailContinue() {
  const input = document.getElementById('googleOtherEmailInput');
  const rawEmail = input ? input.value.trim() : '';
  if (!rawEmail || !rawEmail.includes('@')) {
    showToast(t('toast_google_invalid'));
    return;
  }
  const emailPrefix = rawEmail.split('@')[0].replace(/[._-]+/g, ' ');
  const suggestedName = emailPrefix
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  handleGoogleStep1PickAccount(suggestedName || 'User', rawEmail);
}

function googleBackToStep1() {
  googleOAuthFlowState.step = 1;
  renderGoogleAuthStep();
}

function handleGoogleStep2ApprovePolicy() {
  googleOAuthFlowState.step = 3;
  renderGoogleAuthStep();
}

function handleGoogleStep3ConfirmName(event) {
  if (event) event.preventDefault();
  const nameInput = document.getElementById('googleStep3NameInput');
  const enteredName = nameInput ? nameInput.value.trim() : '';
  if (!enteredName) {
    showToast(t('toast_google_invalid'));
    return;
  }

  googleOAuthFlowState.enteredName = enteredName;
  const email = googleOAuthFlowState.selectedEmail;
  const picture = googleOAuthFlowState.selectedPicture || '';
  const deviceLabel = getDetectedDeviceName();

  // Simpan akun Google yang telah terhubung beserta nama yang dimasukkan
  state.googleAccount = {
    name: enteredName,
    email,
    picture,
    accessToken: latestGoogleAccessToken || '',
    accessTokenExpiresAt: latestGoogleAccessToken ? Date.now() + 3300 * 1000 : 0,
    driveFolderId: (state.googleAccount && state.googleAccount.driveFolderId) || '',
    deviceLabel,
    autoBackup: true,
    connectedAt: new Date().toLocaleString(getActiveLocale())
  };

  const existsIdx = state.deviceGoogleAccounts.findIndex(
    (a) => a.email.toLowerCase() === email.toLowerCase()
  );
  if (existsIdx === -1) {
    state.deviceGoogleAccounts.unshift({ name: enteredName, email, picture, deviceLabel });
  } else {
    state.deviceGoogleAccounts[existsIdx] = { name: enteredName, email, picture, deviceLabel };
  }

  saveGoogleAccountToStorage();
  saveDeviceGoogleAccountsToStorage();
  renderSettingsSection();
  if (window.lucide) window.lucide.createIcons();

  // Tampilkan Tahap 4: Pop-Up "Selamat Datang, (Nama yang dimasukkan)!"
  googleOAuthFlowState.step = 4;
  renderGoogleAuthStep();
}

async function finishGoogleWelcomePopup() {
  const name = googleOAuthFlowState.enteredName || (state.googleAccount && state.googleAccount.name) || 'User';
  const email = googleOAuthFlowState.selectedEmail || (state.googleAccount && state.googleAccount.email) || '';

  closeGoogleAuthModal();

  // Jika menggunakan token Google Drive asli & transaksi lokal masih kosong, cek cadangan dari Google Drive asli
  if (latestGoogleAccessToken && state.transactions.length === 0) {
    const driveSnapshot = await fetchLatestBackupFromRealGoogleDrive(latestGoogleAccessToken);
    if (driveSnapshot && driveSnapshot.transactions && driveSnapshot.transactions.length > 0) {
      pendingAutoBackupAfterLogin = false;
      restoreFromSnapshotObject(driveSnapshot);
      return;
    }
  }

  // Cek juga cadangan lokal browser
  const cloudMap = getCloudSnapshotsMap();
  const existingSnapshot = email ? cloudMap[email.toLowerCase()] : null;
  if (
    existingSnapshot &&
    state.transactions.length === 0 &&
    existingSnapshot.transactions &&
    existingSnapshot.transactions.length > 0
  ) {
    pendingAutoBackupAfterLogin = false;
    restoreFromSnapshotObject(existingSnapshot);
    return;
  }

  // Langsung buat folder & cadangan pertama di Google Drive begitu selesai login
  pendingAutoBackupAfterLogin = false;
  showToast(`${t('google_welcome_prefix')}, ${name}!`);
  runBackgroundDriveBackup(false);
}

const DRIVE_MAIN_FOLDER_NAME = 'FinanceTracker - Cadangan Transaksi';

/**
 * Mencari atau membuat folder di Google Drive agar file cadangan tersusun rapi di dalam folder.
 */
async function getOrCreateGoogleDriveFolder(accessToken, folderName, parentFolderId = null) {
  if (!accessToken || !folderName) return null;
  try {
    const escapedName = folderName.replace(/'/g, "\\'");
    let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;
    if (parentFolderId) {
      q += ` and '${parentFolderId}' in parents`;
    }

    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (searchRes.status === 401) {
      return 'TOKEN_EXPIRED';
    }

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }
    }

    // Jika folder belum ada, buat folder baru di Google Drive
    const folderMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Folder Otomatis Cadangan Transaksi FinanceTracker'
    };
    if (parentFolderId) {
      folderMetadata.parents = [parentFolderId];
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(folderMetadata)
    });

    if (!createRes.ok) return null;
    const createdFolder = await createRes.json();
    return createdFolder.id || null;
  } catch (e) {
    console.warn('Error getOrCreateGoogleDriveFolder:', e);
    return null;
  }
}

/**
 * Menyimpan atau memperbarui (Upsert) file JSON di dalam folder Google Drive tertentu
 * agar tidak ada file duplikat yang berantakan.
 */
async function upsertJsonFileInDriveFolder(accessToken, folderId, fileName, payloadObj, descriptionText) {
  if (!accessToken || !fileName) return null;
  try {
    const escapedName = fileName.replace(/'/g, "\\'");
    let q = `name = '${escapedName}' and trashed = false`;
    if (folderId) {
      q += ` and '${folderId}' in parents`;
    }

    let existingFileId = null;
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      description: descriptionText || 'FinanceTracker Automatic Transaction Backup'
    };
    if (!existingFileId && folderId) {
      metadata.parents = [folderId];
    }

    const boundary = '-------FinanceTrackerDriveBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;
    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(payloadObj, null, 2) +
      closeDelim;

    const uploadUrl = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';

    const response = await fetch(uploadUrl, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.warn('Error upsertJsonFileInDriveFolder:', e);
    return null;
  }
}

/**
 * Membersihkan atau memindahkan file Cadangan_Transaksi lama yang sempat tercecer di luar folder utama (root My Drive)
 * agar Google Drive tetap rapi dan seluruh file hanya berada di dalam folder FinanceTracker - Cadangan Transaksi.
 */
async function cleanupLooseRootBackupFiles(accessToken, mainFolderId, monthFolderId) {
  if (!accessToken || !mainFolderId) return;
  try {
    const q = `name contains 'Cadangan_Transaksi_' and trashed = false and not '${mainFolderId}' in parents${
      monthFolderId ? ` and not '${monthFolderId}' in parents` : ''
    }`;
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=20`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!listRes.ok) return;
    const listData = await listRes.json();
    if (!listData.files || listData.files.length === 0) return;

    for (const file of listData.files) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
  } catch (e) {
    console.warn('Error cleanupLooseRootBackupFiles:', e);
  }
}

/**
 * Mengunggah cadangan ke dalam struktur folder Google Drive yang rapi:
 * 📁 FinanceTracker - Cadangan Transaksi / 📁 YYYY-MM / 📄 Cadangan_Transaksi_YYYY-MM-DD.json
 * serta memperbarui 📄 FinanceTracker_Master_Sync.json di folder utama.
 */
async function uploadBackupToRealGoogleDrive(accessToken, fileName, payloadObj, monthFolderName) {
  if (!accessToken) return null;
  try {
    // 1. Pastikan Folder Utama "FinanceTracker - Cadangan Transaksi" ada
    const mainFolderId = await getOrCreateGoogleDriveFolder(
      accessToken,
      DRIVE_MAIN_FOLDER_NAME,
      null
    );

    if (mainFolderId === 'TOKEN_EXPIRED') {
      return { error: 'TOKEN_EXPIRED' };
    }

    // 2. Pastikan Sub-Folder Periode Bulan (misal "2026-09") ada di dalam Folder Utama
    const subFolderLabel = monthFolderName || getTodayLocalISO().slice(0, 7);
    const monthFolderId = mainFolderId
      ? await getOrCreateGoogleDriveFolder(accessToken, subFolderLabel, mainFolderId)
      : null;

    // 3. Simpan / perbarui file harian di dalam Sub-Folder Bulan tersebut terlebih dahulu
    const dailyFile = await upsertJsonFileInDriveFolder(
      accessToken,
      monthFolderId || mainFolderId,
      fileName,
      payloadObj,
      `Cadangan Harian FinanceTracker (${subFolderLabel})`
    );

    // 4. Perbarui juga file Master Sync di dalam Folder Utama untuk pemulihan instan lintas perangkat
    if (mainFolderId) {
      await upsertJsonFileInDriveFolder(
        accessToken,
        mainFolderId,
        'FinanceTracker_Master_Sync.json',
        payloadObj,
        'Master Sync Terbaru FinanceTracker (Digunakan saat pindah perangkat)'
      );
    }

    // 5. Bersihkan file cadangan lama yang sempat tercecer di luar folder setelah file baru berhasil tersimpan
    if (dailyFile && mainFolderId) {
      await cleanupLooseRootBackupFiles(accessToken, mainFolderId, monthFolderId);
    }

    return {
      dailyFile,
      mainFolderId: mainFolderId || '',
      monthFolderId: monthFolderId || ''
    };
  } catch (e) {
    console.warn('Real Google Drive folder upload error:', e);
    return null;
  }
}

async function fetchLatestBackupFromRealGoogleDrive(accessToken) {
  if (!accessToken) return null;
  try {
    const query = encodeURIComponent(
      "(name = 'FinanceTracker_Master_Sync.json' or name contains 'Cadangan_Transaksi_') and trashed = false"
    );
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,modifiedTime)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!listRes.ok) return null;
    const listData = await listRes.json();
    if (!listData.files || listData.files.length === 0) return null;

    const latestFileId = listData.files[0].id;
    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${latestFileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!fileRes.ok) return null;
    return await fileRes.json();
  } catch (e) {
    console.warn('Real Google Drive restore error:', e);
    return null;
  }
}

function closeGoogleAuthModal() {
  const modal = document.getElementById('modalGoogleAuth');
  if (!modal) return;
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function disconnectGoogleAccount() {
  latestGoogleAccessToken = '';
  state.googleAccount = null;
  saveGoogleAccountToStorage();
  renderSettingsSection();
  if (window.lucide) window.lucide.createIcons();
  showToast(t('drive_status_unconnected'));
}

function getCloudSnapshotsMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DRIVE_CLOUD_SNAPSHOTS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveCloudSnapshotForEmail(email, snapshotData) {
  const map = getCloudSnapshotsMap();
  map[email.toLowerCase()] = snapshotData;
  localStorage.setItem(STORAGE_KEYS.DRIVE_CLOUD_SNAPSHOTS, JSON.stringify(map));
}

function buildFullTransactionBackupPayload() {
  return {
    app: 'FinanceTracker',
    version: 6,
    backedUpAt: new Date().toISOString(),
    googleAccount: state.googleAccount,
    firstOpenedYear: state.firstOpenedYear,
    firstOpenedMonth: state.firstOpenedMonth,
    currency: state.currency,
    language: state.language,
    theme: state.theme,
    transactions: state.transactions,
    budgets: state.budgets,
    customCategories: state.customCategories,
    wallets: state.wallets
  };
}

/**
 * Menjalankan sinkronisasi cadangan transaksi ke folder Google Drive di belakang layar (Background Sync)
 */
function runBackgroundDriveBackup(isSilentAuto = false) {
  if (!state.googleAccount || !state.googleAccount.email) return;
  if (state.isSyncingBackground) return;

  state.isSyncingBackground = true;
  const syncBox = document.getElementById('backgroundSyncStatusBox');
  const statusText = document.getElementById('bgSyncStatusText');
  const pctText = document.getElementById('bgSyncPercentText');
  const barEl = document.getElementById('bgSyncProgressBar');

  if (syncBox) syncBox.classList.remove('hidden');
  if (statusText) {
    statusText.textContent = t('bg_sync_connecting');
  }
  if (pctText) pctText.textContent = '25%';
  if (barEl) barEl.style.width = '25%';

  setTimeout(() => {
    if (statusText) {
      statusText.textContent = t('bg_sync_uploading');
    }
    if (pctText) pctText.textContent = '70%';
    if (barEl) barEl.style.width = '70%';
  }, 450);

  setTimeout(async () => {
    const payload = buildFullTransactionBackupPayload();
    saveCloudSnapshotForEmail(state.googleAccount.email, payload);

    const todayISO = getTodayLocalISO(); // YYYY-MM-DD
    const monthFolder = todayISO.slice(0, 7); // YYYY-MM
    const folderPath = `${DRIVE_MAIN_FOLDER_NAME} / ${monthFolder}`;
    const fileName = `Cadangan_Transaksi_${todayISO}.json`;

    const activeToken =
      latestGoogleAccessToken || (state.googleAccount && state.googleAccount.accessToken) || '';
    let driveResult = null;
    if (activeToken) {
      driveResult = await uploadBackupToRealGoogleDrive(activeToken, fileName, payload, monthFolder);
      if (driveResult && driveResult.error === 'TOKEN_EXPIRED') {
        latestGoogleAccessToken = '';
        if (state.googleAccount) {
          state.googleAccount.accessToken = '';
          state.googleAccount.accessTokenExpiresAt = 0;
          saveGoogleAccountToStorage();
        }
        state.isSyncingBackground = false;
        if (syncBox) syncBox.classList.add('hidden');
        if (!isSilentAuto) {
          showToast('Sesi Google Drive kedaluwarsa. Klik "Cadangkan Transaksi Anda" sekali lagi untuk menyambung ulang.');
        }
        return;
      }

      if (driveResult && driveResult.mainFolderId && state.googleAccount) {
        state.googleAccount.driveFolderId = driveResult.mainFolderId;
        saveGoogleAccountToStorage();
      }
    }

    const nowFormatted = new Date().toLocaleString(getActiveLocale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const driveFolderUrl =
      driveResult && (driveResult.monthFolderId || driveResult.mainFolderId)
        ? `https://drive.google.com/drive/folders/${driveResult.monthFolderId || driveResult.mainFolderId}`
        : state.googleAccount && state.googleAccount.driveFolderId
        ? `https://drive.google.com/drive/folders/${state.googleAccount.driveFolderId}`
        : 'https://drive.google.com/drive/my-drive';

    const newEntry = {
      id: 'bk_' + Date.now(),
      folderPath,
      driveFolderUrl,
      fileName,
      email: state.googleAccount.email,
      createdAt: nowFormatted,
      txCount: state.transactions.length,
      walletCount: state.wallets.length,
      payload
    };

    // Jika sudah ada cadangan di hari & akun yang sama, perbarui entri tersebut agar rapi (1 hari = 1 file dalam folder bulan)
    const existingSameDayIdx = state.driveBackups.findIndex(
      (b) =>
        b.fileName === fileName &&
        b.email &&
        b.email.toLowerCase() === state.googleAccount.email.toLowerCase()
    );

    if (existingSameDayIdx !== -1) {
      state.driveBackups[existingSameDayIdx] = newEntry;
    } else if (
      isSilentAuto &&
      state.driveBackups.length > 0 &&
      state.driveBackups[0].email === state.googleAccount.email
    ) {
      state.driveBackups[0] = newEntry;
    } else {
      state.driveBackups.unshift(newEntry);
    }

    saveDriveBackupsToStorage();

    if (statusText) {
      statusText.textContent = t('bg_sync_done');
    }
    if (pctText) pctText.textContent = '100%';
    if (barEl) barEl.style.width = '100%';

    setTimeout(() => {
      state.isSyncingBackground = false;
      if (syncBox) syncBox.classList.add('hidden');
      if (barEl) barEl.style.width = '0%';
      renderSettingsSection();
      if (window.lucide) window.lucide.createIcons();

      if (!isSilentAuto) {
        showToast(`${t('bg_sync_done')} (${folderPath})`);
      }
    }, 600);
  }, 1050);
}

let autoBackupDebounceTimer = null;
function triggerSilentAutoBackupIfConnected() {
  if (!state.googleAccount || !state.googleAccount.email) return;
  if (autoBackupDebounceTimer) clearTimeout(autoBackupDebounceTimer);
  autoBackupDebounceTimer = setTimeout(() => {
    runBackgroundDriveBackup(true);
  }, 400);
}

function restoreFromSnapshotObject(snapshot) {
  if (!snapshot) return;
  if (Array.isArray(snapshot.transactions)) {
    state.transactions = snapshot.transactions;
  }
  if (snapshot.budgets && typeof snapshot.budgets === 'object') {
    state.budgets = snapshot.budgets;
  }
  if (snapshot.customCategories && typeof snapshot.customCategories === 'object') {
    state.customCategories = {
      Income: [],
      Expense: [],
      Savings: [],
      ...snapshot.customCategories
    };
  }
  if (Array.isArray(snapshot.wallets)) {
    state.wallets = snapshot.wallets;
  }
  if (typeof snapshot.firstOpenedYear === 'number') {
    state.firstOpenedYear = snapshot.firstOpenedYear;
  }
  if (typeof snapshot.firstOpenedMonth === 'number') {
    state.firstOpenedMonth = snapshot.firstOpenedMonth;
  }

  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(state.budgets));
  localStorage.setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, JSON.stringify(state.customCategories));
  localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(state.wallets));

  refreshDashboard();
  showToast(
    `${t('btn_restore_transactions')}: ${state.transactions.length} ${t('tx_count_suffix')} & ${state.wallets.length} ${t('nav_wallets')}!`
  );
}

function handleRestoreTransactionsFromDrive() {
  if (!state.googleAccount || !state.googleAccount.email) {
    showToast(t('modal_google_sub'), 'error');
    openGoogleAuthModal();
    return;
  }

  const cloudMap = getCloudSnapshotsMap();
  const snapshot = cloudMap[state.googleAccount.email.toLowerCase()];
  if (snapshot) {
    restoreFromSnapshotObject(snapshot);
    return;
  }

  const latestBackup = state.driveBackups.find(
    (b) => b.email.toLowerCase() === state.googleAccount.email.toLowerCase() && b.payload
  );
  if (latestBackup && latestBackup.payload) {
    restoreFromSnapshotObject(latestBackup.payload);
    return;
  }

  showToast(`${t('drive_empty_backups')} (${state.googleAccount.email})`, 'error');
}

function downloadBackupSnapshotJson(backupId) {
  const item = state.driveBackups.find((b) => b.id === backupId);
  const payload = item && item.payload ? item.payload : buildFullTransactionBackupPayload();
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const a = document.createElement('a');
  a.setAttribute('href', dataStr);
  a.setAttribute('download', item ? item.fileName : `FinanceTracker_Backup_${getTodayLocalISO()}.json`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(`${t('btn_backup_transactions')} (.json)!`);
}

function triggerImportBackupFile() {
  const fileInput = document.getElementById('importBackupFileInput');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function handleImportBackupFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!parsed || (!Array.isArray(parsed.transactions) && !Array.isArray(parsed.wallets))) {
        showToast('Invalid JSON format', 'error');
        return;
      }
      restoreFromSnapshotObject(parsed);
    } catch (err) {
      showToast('Invalid JSON file', 'error');
    }
  };
  reader.readAsText(file);
}

function deleteBackupHistoryItem(backupId) {
  state.driveBackups = state.driveBackups.filter((b) => b.id !== backupId);
  saveDriveBackupsToStorage();
  renderSettingsSection();
  if (window.lucide) window.lucide.createIcons();
  showToast(t('btn_reset'));
}

// ================= DOWNLOAD LAPORAN PDF LANGSUNG OTOMATIS (TANPA LOGIN GOOGLE) =================

function generateFinancialReportPDFDoc() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library loading...', 'error');
    return null;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const filteredTx = getFilteredTransactions();
  const metrics = calculateSummaryMetrics(filteredTx);
  const schema = getActiveSchema();
  const wallets = getCalculatedWallets();
  const totalWalletBalance = wallets.reduce((s, w) => s + w.currentBalance, 0);
  const monthsList = getMonthNames();
  const cur = getActiveCurrencyObj();

  const periodLabel =
    state.selectedMonth === -1
      ? `${t('all_months_1_year')} ${state.selectedYear}`
      : `${monthsList[state.selectedMonth]} ${state.selectedYear}`;

  const printedAt = new Date().toLocaleString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Header Banner PDF
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, 'F');

  doc.setTextColor(16, 185, 129);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FINANCE TRACKER — PDF REPORT', 14, 15);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${t('modal_budget_period')} ${periodLabel}  |  ${t('settings_currency_label')}: ${cur.code} (${cur.symbol})`, 14, 22);
  doc.text(`${printedAt}`, 14, 28);

  let currentY = 42;

  // 1. Tabel Ringkasan Eksekutif
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`1. ${t('nav_dashboard')}`, 14, currentY);

  doc.autoTable({
    startY: currentY + 3,
    head: [[t('th_category'), `${t('th_amount')} (${cur.symbol})`, t('modal_tx_note_label')]],
    body: [
      [t('card_total_income'), formatRp(metrics.totalIncome), t('nav_income')],
      [t('card_total_expense'), formatRp(metrics.totalExpense), `${t('th_budget')}: ${formatRp(metrics.totalExpenseBudget)}`],
      [t('card_total_savings'), formatRp(metrics.totalSavings), t('nav_savings')],
      [t('card_total_balance'), formatRp(metrics.sisaDana), `${t('nav_income')} - ${t('nav_expense')} - ${t('nav_savings')}`],
      [t('wallet_total_title'), formatRp(totalWalletBalance), t('nav_wallets')]
    ],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: [15, 23, 42], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2.5 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // 2. Tabel Sumber Dana Masuk (Income)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`2. ${t('income_tab_title')}`, 14, currentY);

  const incomeRows = [];
  schema.Income.groups.forEach((g) => {
    g.items.forEach((item) => {
      const val = metrics.trackedByCategory[item.name] || 0;
      const pct = metrics.totalIncome > 0 ? ((val / metrics.totalIncome) * 100).toFixed(1) + '%' : '0%';
      incomeRows.push([translateCategoryName(item.name), pct, formatRp(val)]);
    });
  });

  doc.autoTable({
    startY: currentY + 3,
    head: [[t('th_income_source'), t('th_income_share'), `${t('th_income_total')} (${cur.symbol})`]],
    body: incomeRows,
    theme: 'striped',
    headStyles: { fillColor: [5, 150, 105], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2.2 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // 3. Tabel Pengeluaran (Expenses)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`3. ${t('expense_tab_title')}`, 14, currentY);

  const expenseRows = [];
  schema.Expense.groups.forEach((g) => {
    g.items.forEach((item) => {
      const tracked = metrics.trackedByCategory[item.name] || 0;
      const budget = getCategoryBudget(item.name);
      const { pct, budgetLeft, excess } = getProgressStyles(tracked, budget, 'Expense');
      expenseRows.push([
        translateCategoryName(item.name),
        formatRp(tracked),
        formatRp(budget),
        `${pct.toFixed(1)}%`,
        formatRp(budgetLeft),
        excess > 0 ? '+' + formatRp(excess) : formatRp(0)
      ]);
    });
  });

  doc.autoTable({
    startY: currentY + 3,
    head: [[t('th_category'), t('th_tracked'), t('th_budget'), t('th_usage_pct'), t('th_budget_left'), t('th_excess')]],
    body: expenseRows,
    theme: 'striped',
    headStyles: { fillColor: [225, 29, 72], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2.2 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // 4. Tabel Tabungan (Savings) & Wallet
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`4. ${t('savings_tab_title')} & ${t('nav_wallets')}`, 14, currentY);

  const savingsAndWalletRows = [];
  schema.Savings.groups.forEach((g) => {
    g.items.forEach((item) => {
      const tracked = metrics.cumulativeSavingsByCategory[item.name] || 0;
      const ket = item.noBudget
        ? t('badge_flexible_no_min')
        : `${t('th_budget')}: ${formatRp(getCategoryBudget(item.name))}`;
      savingsAndWalletRows.push([`${t('nav_savings')}: ${translateCategoryName(item.name)}`, formatRp(tracked), ket]);
    });
  });
  wallets.forEach((w) => {
    savingsAndWalletRows.push([`${t('nav_wallets')}: ${w.name} (${w.type})`, formatRp(w.currentBalance), t('wallet_stored_balance')]);
  });

  doc.autoTable({
    startY: currentY + 3,
    head: [[t('th_category'), `${t('wallet_stored_balance')} (${cur.symbol})`, t('modal_tx_note_label')]],
    body: savingsAndWalletRows,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2.2 }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // 5. Daftar Riwayat Transaksi Periode Ini
  if (filteredTx.length > 0) {
    if (currentY > 235) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`5. ${t('history_title')} (${filteredTx.length} ${t('tx_count_suffix')})`, 14, currentY);

    const txRows = [...filteredTx]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((tx) => [
        tx.date,
        translateTxType(tx.type),
        translateCategoryName(tx.category),
        tx.account || '-',
        tx.note || '-',
        formatRp(tx.amount)
      ]);

    doc.autoTable({
      startY: currentY + 3,
      head: [[t('th_date'), t('th_type'), t('th_category'), t('th_wallet'), t('modal_tx_note_label'), `${t('th_amount')} (${cur.symbol})`]],
      body: txRows,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 8, cellPadding: 2 }
    });
  }

  const mSlug =
    state.selectedMonth === -1 ? 'AllYear' : MONTHS_ID[state.selectedMonth];
  const fileName = `FinanceTracker_Report_${mSlug}_${state.selectedYear}.pdf`;

  return { doc, fileName, periodLabel, metrics };
}

/**
 * Langsung otomatis mengunduh Laporan dalam bentuk PDF tanpa perlu login Google!
 */
function handleDownloadPdfReport() {
  const result = generateFinancialReportPDFDoc();
  if (!result) return;
  result.doc.save(result.fileName);
  showToast(`Laporan PDF "${result.fileName}" berhasil di-download!`);
}

/// ================= PENGATURAN KATA SANDI & KEAMANAN (PIN, POLA 3x3, SIDIK JARI HARDWARE PERANGKAT) =================

let secSetupState = {
  activeTab: 'pin', // 'pin' | 'pattern' | 'fingerprint'
  pinBuffer: '',
  patternSequence: [],
  isDrawingPattern: false
};

let lockVerifyState = {
  pinBuffer: '',
  patternSequence: [],
  isDrawingPattern: false,
  fpHoldTimer: null
};

async function checkDeviceFingerprintHardware() {
  let available = false;
  try {
    if (
      window.PublicKeyCredential &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
      window.isSecureContext
    ) {
      available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch (err) {
    available = false;
  }

  state.deviceHasFingerprintSensor = Boolean(available);

  const fpTabBtn = document.getElementById('tabSecSetupFingerprint');
  if (fpTabBtn) {
    fpTabBtn.classList.toggle('opacity-45', !state.deviceHasFingerprintSensor);
  }

  renderSecuritySettingsArea();
}

function getSecurityMethodLabel(method) {
  if (method === 'pin') return t('sec_pin_title');
  if (method === 'pattern') return t('sec_pattern_title');
  if (method === 'fingerprint') return t('sec_fp_title');
  return t('sec_status_inactive');
}

function renderSecuritySettingsArea() {
  const badgeEl = document.getElementById('securityStatusBadge');
  const activeControlsEl = document.getElementById('securityActiveControlsArea');
  const pinBtn = document.getElementById('btnSecMethodPin');
  const patternBtn = document.getElementById('btnSecMethodPattern');
  const fpBtn = document.getElementById('btnSecMethodFingerprint');

  const isEnabled = Boolean(state.security && state.security.enabled);
  const method = state.security ? state.security.method : null;

  if (badgeEl) {
    if (isEnabled) {
      badgeEl.textContent = `${t('sec_status_active')}: ${getSecurityMethodLabel(method)}`;
      badgeEl.className =
        'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shrink-0';
    } else {
      badgeEl.textContent = t('sec_status_inactive');
      badgeEl.className =
        'px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700 shrink-0';
    }
  }

  const baseCardClass =
    'py-2.5 px-3 rounded-xl bg-slate-900/55 hover:bg-slate-800/70 border border-slate-800/80 transition-all flex items-center justify-center gap-2 text-center';
  const activeCardClass =
    'py-2.5 px-3 rounded-xl bg-emerald-500/15 border-2 border-emerald-500/55 transition-all flex items-center justify-center gap-2 text-center shadow-sm';
  const disabledFpClass =
    'py-2.5 px-3 rounded-xl bg-slate-900/35 border border-slate-800/50 opacity-45 cursor-not-allowed transition-all flex items-center justify-center gap-2 text-center';

  if (pinBtn) pinBtn.className = isEnabled && method === 'pin' ? activeCardClass : baseCardClass;
  if (patternBtn) patternBtn.className = isEnabled && method === 'pattern' ? activeCardClass : baseCardClass;
  if (fpBtn) {
    if (!state.deviceHasFingerprintSensor) {
      fpBtn.className = disabledFpClass;
      fpBtn.title = t('fp_not_supported_desc');
    } else {
      fpBtn.className = isEnabled && method === 'fingerprint' ? activeCardClass : baseCardClass;
      fpBtn.title = t('sec_fp_title');
    }
  }

  if (activeControlsEl) {
    if (!isEnabled) {
      activeControlsEl.innerHTML = '';
    } else {
      activeControlsEl.innerHTML = `
        <div class="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs">
              <span class="text-slate-400">${t('sec_active_method')}</span>
              <strong class="text-emerald-300 ml-1">${getSecurityMethodLabel(method)}</strong>
            </div>
            <span class="text-[10px] text-slate-400">${state.security.updatedAt || ''}</span>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              type="button"
              onclick="lockAppNow()"
              class="py-2 px-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-1.5 transition-all"
            >
              <i data-lucide="lock" class="w-3.5 h-3.5"></i>
              <span class="truncate">${t('sec_btn_lock_now')}</span>
            </button>
            <button
              type="button"
              onclick="openSecuritySetupModal('${method}')"
              class="py-2 px-2.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
            >
              <i data-lucide="settings-2" class="w-3.5 h-3.5 text-purple-400"></i>
              <span class="truncate">${t('sec_btn_change')}</span>
            </button>
            <button
              type="button"
              onclick="disableSecurityLock()"
              class="py-2 px-2.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 flex items-center justify-center gap-1.5 transition-all"
            >
              <i data-lucide="unlock" class="w-3.5 h-3.5"></i>
              <span class="truncate">${t('sec_btn_disable')}</span>
            </button>
          </div>
        </div>
      `;
    }
  }
}

function openSecuritySetupModal(method = 'pin') {
  if (method === 'fingerprint' && !state.deviceHasFingerprintSensor) {
    showToast(t('fp_not_supported_toast'), 'error');
    return;
  }

  secSetupState.activeTab = ['pin', 'pattern', 'fingerprint'].includes(method) ? method : 'pin';
  secSetupState.pinBuffer = '';
  secSetupState.patternSequence = [];

  const modal = document.getElementById('modalSecuritySetup');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
  });

  switchSecuritySetupTab(secSetupState.activeTab);
}

function closeSecuritySetupModal() {
  const modal = document.getElementById('modalSecuritySetup');
  if (!modal) return;
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function switchSecuritySetupTab(tab) {
  if (tab === 'fingerprint' && !state.deviceHasFingerprintSensor) {
    showToast(t('fp_not_supported_toast'), 'error');
  }

  secSetupState.activeTab = tab;
  secSetupState.pinBuffer = '';
  secSetupState.patternSequence = [];

  document.querySelectorAll('.sec-setup-tab-btn').forEach((btn) => {
    const tName = btn.getAttribute('data-sec-tab');
    const isFpUnsupported = tName === 'fingerprint' && !state.deviceHasFingerprintSensor;
    if (tName === tab) {
      btn.className = `sec-setup-tab-btn py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 ${
        isFpUnsupported ? 'opacity-50' : ''
      }`;
    } else {
      btn.className = `sec-setup-tab-btn py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-slate-400 hover:text-slate-200 border border-transparent ${
        isFpUnsupported ? 'opacity-45' : ''
      }`;
    }
  });

  const bodyEl = document.getElementById('securitySetupBody');
  if (!bodyEl) return;

  if (tab === 'pin') {
    bodyEl.innerHTML = `
      <div class="space-y-4 text-center">
        <div>
          <div class="text-xs font-bold text-slate-200">${t('modal_sec_pin_heading')}</div>
          <p id="setupPinHint" class="text-[11px] text-slate-400 mt-0.5">${t('modal_sec_pin_sub')}</p>
        </div>

        <div id="setupPinDots" class="flex items-center justify-center gap-3 py-2">
          ${[0, 1, 2, 3, 4, 5].map((i) => `<span class="pin-dot" data-pin-idx="${i}"></span>`).join('')}
        </div>

        <div class="grid grid-cols-3 gap-2.5 max-w-[260px] mx-auto">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map(
              (n) =>
                `<button type="button" onclick="handleSetupPinKey('${n}')" class="pin-key-btn">${n}</button>`
            )
            .join('')}
          <button type="button" onclick="handleSetupPinKey('CLEAR')" class="pin-key-btn text-xs text-rose-400">${t('btn_reset')}</button>
          <button type="button" onclick="handleSetupPinKey('0')" class="pin-key-btn">0</button>
          <button type="button" onclick="handleSetupPinKey('BACK')" class="pin-key-btn text-slate-300">
            <i data-lucide="delete" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="pt-2">
          <button
            type="button"
            onclick="saveNewPinSecurity()"
            class="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg"
          >
            ${t('modal_sec_pin_save')}
          </button>
        </div>
      </div>
    `;
  } else if (tab === 'pattern') {
    bodyEl.innerHTML = `
      <div class="space-y-4 text-center">
        <div>
          <div class="text-xs font-bold text-slate-200">${t('modal_sec_pattern_heading')}</div>
          <p id="setupPatternHint" class="text-[11px] text-slate-400 mt-0.5">${t('modal_sec_pattern_sub')}</p>
        </div>

        <div id="setupPatternBoard" class="pattern-board bg-slate-950/60 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
          <svg id="setupPatternSvg" class="absolute inset-0 w-full h-full pointer-events-none" style="z-index:1;"></svg>
          ${[0, 1, 2]
            .map(
              (row) => `
              <div class="flex items-center justify-between">
                ${[0, 1, 2]
                  .map((col) => {
                    const idx = row * 3 + col;
                    return `
                      <div class="pattern-node" data-pattern-node="${idx}">
                        <div class="pattern-node-dot"></div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
            )
            .join('')}
        </div>

        <div class="flex items-center gap-2 pt-1">
          <button
            type="button"
            onclick="resetSetupPatternBoard()"
            class="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-300"
          >
            ${t('modal_sec_pattern_reset')}
          </button>
          <button
            type="button"
            onclick="saveNewPatternSecurity()"
            class="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white keep-white shadow-lg"
          >
            ${t('modal_sec_pattern_save')}
          </button>
        </div>
      </div>
    `;
    initInteractivePatternBoard('setupPatternBoard', 'setupPatternSvg', false);
  } else {
    if (!state.deviceHasFingerprintSensor) {
      bodyEl.innerHTML = `
        <div class="space-y-3 text-center py-4">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <i data-lucide="fingerprint" class="w-8 h-8"></i>
          </div>
          <div class="space-y-1">
            <div class="text-xs font-bold text-rose-300">${t('fp_not_supported_title')}</div>
            <p class="text-[11px] text-slate-400 leading-relaxed max-w-xs mx-auto">
              ${t('fp_not_supported_desc')}
            </p>
          </div>
        </div>
      `;
    } else {
      bodyEl.innerHTML = `
        <div class="space-y-4 text-center py-2">
          <div>
            <div class="text-xs font-bold text-slate-200">${t('modal_sec_fp_heading')}</div>
            <p id="setupFpHint" class="text-[11px] text-slate-400 mt-1">
              ${t('modal_sec_fp_sub')}
            </p>
          </div>

          <div class="py-4 flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              id="btnEnrollFingerprint"
              onclick="handleEnrollFingerprint()"
              class="w-24 h-24 rounded-3xl bg-blue-500/15 hover:bg-blue-500/25 border-2 border-blue-500/40 flex items-center justify-center text-blue-400 transition-all shadow-lg"
            >
              <i data-lucide="fingerprint" class="w-12 h-12"></i>
            </button>
            <span id="setupFpStatusLabel" class="text-xs font-semibold text-emerald-400">${t('modal_sec_fp_status')}</span>
          </div>
        </div>
      `;
    }
  }

  if (window.lucide) window.lucide.createIcons({ nodes: [bodyEl] });
}

function handleSetupPinKey(key) {
  if (key === 'CLEAR') {
    secSetupState.pinBuffer = '';
  } else if (key === 'BACK') {
    secSetupState.pinBuffer = secSetupState.pinBuffer.slice(0, -1);
  } else if (secSetupState.pinBuffer.length < 6) {
    secSetupState.pinBuffer += key;
  }

  document.querySelectorAll('#setupPinDots .pin-dot').forEach((dot, idx) => {
    dot.classList.toggle('filled', idx < secSetupState.pinBuffer.length);
  });
}

function saveNewPinSecurity() {
  if (secSetupState.pinBuffer.length < 6) {
    showToast(t('modal_sec_pin_heading'), 'error');
    return;
  }
  state.security = {
    enabled: true,
    method: 'pin',
    secret: secSetupState.pinBuffer,
    updatedAt: new Date().toLocaleDateString(getActiveLocale())
  };
  saveSecurityToStorage();
  closeSecuritySetupModal();
  renderSettingsSection();
  if (window.lucide) window.lucide.createIcons();
  showToast(`${t('sec_pin_title')} ${t('sec_status_active')}!`);
}

function initInteractivePatternBoard(boardId, svgId, isVerifyMode = false) {
  const board = document.getElementById(boardId);
  const svg = document.getElementById(svgId);
  if (!board || !svg) return;

  const targetState = isVerifyMode ? lockVerifyState : secSetupState;
  targetState.patternSequence = [];
  targetState.isDrawingPattern = false;

  function getNodeCenter(nodeEl) {
    const boardRect = board.getBoundingClientRect();
    const rect = nodeEl.getBoundingClientRect();
    return {
      x: rect.left - boardRect.left + rect.width / 2,
      y: rect.top - boardRect.top + rect.height / 2
    };
  }

  function renderPatternLines(cursorPoint = null, isError = false) {
    const nodes = board.querySelectorAll('.pattern-node');
    nodes.forEach((n) => {
      const idx = parseInt(n.getAttribute('data-pattern-node'), 10);
      const isActive = targetState.patternSequence.includes(idx);
      n.classList.toggle('active', isActive && !isError);
      n.classList.toggle('error', isActive && isError);
    });

    const points = targetState.patternSequence.map((idx) => {
      const nodeEl = board.querySelector(`[data-pattern-node="${idx}"]`);
      return getNodeCenter(nodeEl);
    });
    if (cursorPoint && points.length > 0) {
      points.push(cursorPoint);
    }

    if (points.length < 2) {
      svg.innerHTML = '';
      return;
    }

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const strokeColor = isError ? '#f43f5e' : '#10b981';
    svg.innerHTML = `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  function checkPointerHit(clientX, clientY) {
    const nodes = board.querySelectorAll('.pattern-node');
    nodes.forEach((nodeEl) => {
      const rect = nodeEl.getBoundingClientRect();
      const dist = Math.hypot(
        clientX - (rect.left + rect.width / 2),
        clientY - (rect.top + rect.height / 2)
      );
      if (dist <= 28) {
        const idx = parseInt(nodeEl.getAttribute('data-pattern-node'), 10);
        if (!targetState.patternSequence.includes(idx)) {
          targetState.patternSequence.push(idx);
        }
      }
    });

    const boardRect = board.getBoundingClientRect();
    renderPatternLines({
      x: clientX - boardRect.left,
      y: clientY - boardRect.top
    });
  }

  function startDraw(clientX, clientY) {
    targetState.patternSequence = [];
    targetState.isDrawingPattern = true;
    checkPointerHit(clientX, clientY);
  }

  function moveDraw(clientX, clientY) {
    if (!targetState.isDrawingPattern) return;
    checkPointerHit(clientX, clientY);
  }

  function endDraw() {
    if (!targetState.isDrawingPattern) return;
    targetState.isDrawingPattern = false;
    renderPatternLines(null);

    if (isVerifyMode && targetState.patternSequence.length > 0) {
      verifyUnlockPattern(renderPatternLines);
    }
  }

  board.addEventListener('mousedown', (e) => startDraw(e.clientX, e.clientY));
  board.addEventListener('mousemove', (e) => moveDraw(e.clientX, e.clientY));
  window.addEventListener('mouseup', endDraw);

  board.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      const tTouch = e.touches[0];
      if (tTouch) startDraw(tTouch.clientX, tTouch.clientY);
    },
    { passive: false }
  );
  board.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const tTouch = e.touches[0];
      if (tTouch) moveDraw(tTouch.clientX, tTouch.clientY);
    },
    { passive: false }
  );
  board.addEventListener('touchend', endDraw);
}

function resetSetupPatternBoard() {
  secSetupState.patternSequence = [];
  const board = document.getElementById('setupPatternBoard');
  const svg = document.getElementById('setupPatternSvg');
  if (board) {
    board.querySelectorAll('.pattern-node').forEach((n) => n.classList.remove('active', 'error'));
  }
  if (svg) svg.innerHTML = '';
}

function saveNewPatternSecurity() {
  if (secSetupState.patternSequence.length < 4) {
    showToast(t('modal_sec_pattern_heading'), 'error');
    return;
  }
  state.security = {
    enabled: true,
    method: 'pattern',
    secret: secSetupState.patternSequence.join('-'),
    updatedAt: new Date().toLocaleDateString(getActiveLocale())
  };
  saveSecurityToStorage();
  closeSecuritySetupModal();
  renderSettingsSection();
  if (window.lucide) window.lucide.createIcons();
  showToast(`${t('sec_pattern_title')} ${t('sec_status_active')}!`);
}

async function handleEnrollFingerprint() {
  if (
    !state.deviceHasFingerprintSensor ||
    !window.PublicKeyCredential ||
    !navigator.credentials ||
    !window.isSecureContext
  ) {
    showToast(t('fp_not_supported_toast'), 'error');
    return;
  }

  const btn = document.getElementById('btnEnrollFingerprint');
  const statusLabel = document.getElementById('setupFpStatusLabel');
  if (btn) btn.classList.add('fp-sensor-scanning');
  if (statusLabel) statusLabel.textContent = t('modal_sec_fp_status');

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    window.crypto.getRandomValues(userId);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'FinanceTracker' },
        user: {
          id: userId,
          name: 'user@financetracker.local',
          displayName: 'FinanceTracker User'
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required'
        },
        timeout: 30000
      }
    });

    if (btn) btn.classList.remove('fp-sensor-scanning');

    if (!cred || !cred.id) {
      showToast(t('fp_not_supported_toast'), 'error');
      return;
    }

    state.security = {
      enabled: true,
      method: 'fingerprint',
      secret: cred.id,
      updatedAt: new Date().toLocaleDateString(getActiveLocale())
    };
    saveSecurityToStorage();
    closeSecuritySetupModal();
    renderSettingsSection();
    if (window.lucide) window.lucide.createIcons();
    showToast(`${t('sec_fp_title')} ${t('sec_status_active')}!`);
  } catch (err) {
    if (btn) btn.classList.remove('fp-sensor-scanning');
    showToast(t('fp_not_supported_toast'), 'error');
  }
}

function disableSecurityLock() {
  state.security = {
    enabled: false,
    method: null,
    secret: '',
    updatedAt: null
  };
  state.isAppLocked = false;
  saveSecurityToStorage();
  renderSettingsSection();
  if (window.lucide) window.lucide.createIcons();
  showToast(t('sec_status_inactive'));
}

// ================= LAYAR KUNCI APLIKASI (APP LOCK OVERLAY) =================

function lockAppNow() {
  if (!state.security || !state.security.enabled) {
    showToast(t('sec_status_inactive'), 'error');
    return;
  }
  state.isAppLocked = true;
  renderAppLockOverlay();
}

function renderAppLockOverlay() {
  const overlay = document.getElementById('appLockOverlay');
  if (!overlay) return;

  if (!state.isAppLocked || !state.security || !state.security.enabled) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');
  const area = document.getElementById('appLockInteractiveArea');
  const promptEl = document.getElementById('appLockPromptText');
  const methodLabel = document.getElementById('appLockMethodLabel');
  const method = state.security.method;

  lockVerifyState.pinBuffer = '';
  lockVerifyState.patternSequence = [];

  if (methodLabel) {
    methodLabel.textContent = `${t('sec_active_method')} ${getSecurityMethodLabel(method)}`;
  }

  if (method === 'pin') {
    if (promptEl) promptEl.textContent = t('lock_prompt_pin');
    area.innerHTML = `
      <div class="space-y-4">
        <div id="lockPinDots" class="flex items-center justify-center gap-3 py-2">
          ${[0, 1, 2, 3, 4, 5].map((i) => `<span class="pin-dot" data-lock-pin="${i}"></span>`).join('')}
        </div>
        <div class="grid grid-cols-3 gap-2.5 max-w-[250px] mx-auto">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
            .map(
              (n) =>
                `<button type="button" onclick="handleLockPinKey('${n}')" class="pin-key-btn">${n}</button>`
            )
            .join('')}
          <button type="button" onclick="handleLockPinKey('CLEAR')" class="pin-key-btn text-xs text-rose-400">${t('btn_reset')}</button>
          <button type="button" onclick="handleLockPinKey('0')" class="pin-key-btn">0</button>
          <button type="button" onclick="handleLockPinKey('BACK')" class="pin-key-btn text-slate-300">
            <i data-lucide="delete" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  } else if (method === 'pattern') {
    if (promptEl) promptEl.textContent = t('lock_prompt_pattern');
    area.innerHTML = `
      <div id="lockPatternBoard" class="pattern-board bg-slate-900/75 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
        <svg id="lockPatternSvg" class="absolute inset-0 w-full h-full pointer-events-none" style="z-index:1;"></svg>
        ${[0, 1, 2]
          .map(
            (row) => `
            <div class="flex items-center justify-between">
              ${[0, 1, 2]
                .map((col) => {
                  const idx = row * 3 + col;
                  return `
                    <div class="pattern-node" data-pattern-node="${idx}">
                      <div class="pattern-node-dot"></div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `
          )
          .join('')}
      </div>
    `;
    initInteractivePatternBoard('lockPatternBoard', 'lockPatternSvg', true);
  } else {
    if (promptEl) promptEl.textContent = t('lock_prompt_fp');
    area.innerHTML = `
      <div class="py-5 flex flex-col items-center justify-center gap-3">
        <button
          type="button"
          id="btnUnlockFingerprint"
          onclick="handleVerifyFingerprintUnlock()"
          class="w-24 h-24 rounded-3xl bg-emerald-500/15 hover:bg-emerald-500/25 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 transition-all shadow-lg"
        >
          <i data-lucide="fingerprint" class="w-12 h-12"></i>
        </button>
        <span id="unlockFpHint" class="text-xs font-semibold text-emerald-400">${t('lock_fp_tap')}</span>
      </div>
    `;
  }

  if (window.lucide) window.lucide.createIcons({ nodes: [overlay] });
}

function handleLockPinKey(key) {
  if (key === 'CLEAR') {
    lockVerifyState.pinBuffer = '';
  } else if (key === 'BACK') {
    lockVerifyState.pinBuffer = lockVerifyState.pinBuffer.slice(0, -1);
  } else if (lockVerifyState.pinBuffer.length < 6) {
    lockVerifyState.pinBuffer += key;
  }

  const dots = document.querySelectorAll('#lockPinDots .pin-dot');
  dots.forEach((dot, idx) => {
    dot.classList.remove('error');
    dot.classList.toggle('filled', idx < lockVerifyState.pinBuffer.length);
  });

  if (lockVerifyState.pinBuffer.length === 6) {
    if (lockVerifyState.pinBuffer === state.security.secret) {
      unlockAppSuccess();
    } else {
      dots.forEach((d) => d.classList.add('error'));
      showToast('PIN invalid!', 'error');
      setTimeout(() => {
        lockVerifyState.pinBuffer = '';
        dots.forEach((d) => d.classList.remove('filled', 'error'));
      }, 500);
    }
  }
}

function verifyUnlockPattern(renderPatternLinesFn) {
  const entered = lockVerifyState.patternSequence.join('-');
  if (entered === state.security.secret) {
    unlockAppSuccess();
  } else {
    renderPatternLinesFn(null, true);
    showToast('Pattern invalid!', 'error');
    setTimeout(() => {
      lockVerifyState.patternSequence = [];
      renderPatternLinesFn(null, false);
    }, 600);
  }
}

async function handleVerifyFingerprintUnlock() {
  if (
    !state.deviceHasFingerprintSensor ||
    !window.PublicKeyCredential ||
    !navigator.credentials ||
    !window.isSecureContext
  ) {
    showToast(t('fp_not_supported_toast'), 'error');
    return;
  }

  const btn = document.getElementById('btnUnlockFingerprint');
  const hint = document.getElementById('unlockFpHint');
  if (btn) btn.classList.add('fp-sensor-scanning');
  if (hint) hint.textContent = t('modal_sec_fp_status');

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 30000,
        userVerification: 'required'
      }
    });

    if (btn) btn.classList.remove('fp-sensor-scanning');
    if (assertion) {
      unlockAppSuccess();
    }
  } catch (e) {
    if (btn) btn.classList.remove('fp-sensor-scanning');
    if (hint) hint.textContent = t('lock_fp_tap');
    showToast(t('fp_not_supported_toast'), 'error');
  }
}

function unlockAppSuccess() {
  state.isAppLocked = false;
  const overlay = document.getElementById('appLockOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function handleEmergencyResetLock() {
  disableSecurityLock();
  const overlay = document.getElementById('appLockOverlay');
  if (overlay) overlay.classList.add('hidden');
}

// ================= CUSTOM IN-APP FIELD VALIDATION =================

function showFieldValidationError(inputId, errorHintId, message) {
  const inputEl = document.getElementById(inputId);
  const errorEl = document.getElementById(errorHintId);

  if (inputEl) {
    inputEl.classList.remove('input-invalid');
    void inputEl.offsetWidth;
    inputEl.classList.add('input-invalid');
    inputEl.focus();
  }

  if (errorEl) {
    errorEl.innerHTML = `
      <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-400 shrink-0"></i>
      <span>${message}</span>
    `;
    errorEl.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }
}

function clearFieldValidationError(inputId, errorHintId) {
  const inputEl = document.getElementById(inputId);
  const errorEl = document.getElementById(errorHintId);
  if (inputEl) inputEl.classList.remove('input-invalid');
  if (errorEl) {
    errorEl.classList.add('hidden');
    errorEl.innerHTML = '';
  }
}

// ================= MODERN CUSTOM DROPDOWN & 2-COLUMN MONTH PICKER =================

let activeSelectPortal = null;
let activeSelectEl = null;

function getOptionIconName(selectId, optionValue) {
  if (selectId === 'txCategory') {
    const found = getAllCategoriesFlat().find((c) => c.name === optionValue);
    return found ? found.icon || 'folder' : 'tag';
  }
  if (selectId === 'txAccount') {
    const foundWallet = state.wallets.find((w) => w.name === optionValue);
    return foundWallet ? foundWallet.icon || 'wallet' : 'wallet';
  }
  if (selectId === 'customCatType') {
    if (optionValue === 'Income') return 'trending-up';
    if (optionValue === 'Expense') return 'trending-down';
    return 'piggy-bank';
  }
  if (selectId === 'newWalletType') {
    if (optionValue === 'Bank') return 'landmark';
    if (optionValue === 'E-Wallet') return 'smartphone';
    return 'banknote';
  }
  if (selectId === 'txTypeFilterSelect') {
    if (optionValue === 'Income') return 'trending-up';
    if (optionValue === 'Expense') return 'trending-down';
    if (optionValue === 'Savings') return 'piggy-bank';
    return 'filter';
  }
  if (selectId === 'settingsCurrencySelect') {
    return 'coins';
  }
  if (selectId === 'settingsLanguageSelect') {
    return 'globe';
  }
  if (selectId === 'filterYear') {
    return 'calendar';
  }
  return null;
}

function closeCustomSelectPortal() {
  if (activeSelectPortal) {
    activeSelectPortal.remove();
    activeSelectPortal = null;
  }
  if (activeSelectEl && activeSelectEl._customTrigger) {
    activeSelectEl._customTrigger.classList.remove('is-open');
  }
  activeSelectEl = null;
}

function isPeriodSelectLockedSingle(selectEl) {
  if (!selectEl) return false;
  if (selectEl.id === 'filterMonth' || selectEl.id === 'filterYear') {
    return selectEl.options.length <= 1;
  }
  return false;
}

function syncCustomSelectTrigger(selectEl) {
  if (!selectEl || !selectEl._customTrigger) return;
  const trigger = selectEl._customTrigger;
  const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
  const labelText = selectedOpt ? selectedOpt.textContent : '';
  const val = selectedOpt ? selectedOpt.value : '';
  const mode = selectEl.getAttribute('data-custom-select') || 'field';

  const isLockedSingle = isPeriodSelectLockedSingle(selectEl);
  const clickTarget =
    mode === 'month-grid' || mode === 'compact' ? trigger.parentElement : trigger;

  if (clickTarget) {
    clickTarget.style.cursor = isLockedSingle ? 'default' : 'pointer';
  }
  trigger.style.cursor = isLockedSingle ? 'default' : 'pointer';

  if (mode === 'month-grid' || mode === 'compact') {
    trigger.innerHTML = `
      <span class="truncate">${labelText}</span>
      ${
        isLockedSingle
          ? ''
          : '<i data-lucide="chevron-down" class="w-3.5 h-3.5 custom-select-chevron"></i>'
      }
    `;
  } else {
    const iconName = getOptionIconName(selectEl.id, val);
    trigger.innerHTML = `
      <span class="flex items-center gap-2.5 min-w-0 truncate">
        ${
          iconName
            ? `<span class="w-6 h-6 rounded-lg bg-slate-800/90 border border-slate-700/70 flex items-center justify-center text-emerald-400 shrink-0">
                 <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i>
               </span>`
            : ''
        }
        <span class="truncate font-medium text-slate-100">${labelText}</span>
      </span>
      <i data-lucide="chevron-down" class="w-4 h-4 custom-select-chevron"></i>
    `;
  }

  if (window.lucide) {
    window.lucide.createIcons({ nodes: [trigger] });
  }
}

function syncAllCustomSelects() {
  document.querySelectorAll('select[data-custom-select]').forEach((selectEl) => {
    if (!selectEl._customTrigger) {
      setupSingleCustomSelect(selectEl);
    } else {
      syncCustomSelectTrigger(selectEl);
    }
  });
}

function selectCustomOption(selectEl, value) {
  selectEl.value = value;
  syncCustomSelectTrigger(selectEl);
  closeCustomSelectPortal();
  selectEl.dispatchEvent(new Event('change', { bubbles: true }));
}

function openCustomSelectPortal(selectEl) {
  if (isPeriodSelectLockedSingle(selectEl)) {
    return;
  }

  if (activeSelectEl === selectEl) {
    closeCustomSelectPortal();
    return;
  }
  closeCustomSelectPortal();

  const trigger = selectEl._customTrigger;
  if (!trigger) return;

  activeSelectEl = selectEl;
  trigger.classList.add('is-open');

  const mode = selectEl.getAttribute('data-custom-select') || 'field';
  const portal = document.createElement('div');
  portal.className = 'custom-select-portal';

  const currentVal = selectEl.value;
  const nowInfo = getCurrentDateInfo(state.language);
  const monthsList = getMonthNames();

  if (mode === 'month-grid') {
    const fullYearUnlocked = isFullYearUnlocked();
    const availableMonths = getAvailableMonthsForYear(state.selectedYear);
    const isAllYear = currentVal === '-1';

    let monthGridHTML = `
      <div class="px-1.5 py-1 mb-1 flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${t('month_picker_title')}</span>
        <span class="text-[10px] font-mono-num text-emerald-400 font-semibold">${state.selectedYear}</span>
      </div>
    `;

    if (fullYearUnlocked) {
      monthGridHTML += `
        <button
          type="button"
          data-opt-val="-1"
          class="custom-select-option ${isAllYear ? 'is-selected' : ''}"
        >
          <span class="flex items-center gap-2">
            <i data-lucide="calendar-range" class="w-3.5 h-3.5 ${isAllYear ? 'text-emerald-400' : 'text-slate-400'}"></i>
            <span>${t('month_picker_all_year')}</span>
          </span>
          ${isAllYear ? '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>' : ''}
        </button>
      `;
    }

    monthGridHTML += `<div class="${availableMonths.length === 1 ? 'grid grid-cols-1 gap-1 mt-1' : 'month-grid-container'}">`;

    availableMonths.forEach((idx) => {
      const mName = monthsList[idx];
      const valStr = String(idx);
      const isSelected = currentVal === valStr;
      const isCurrentRealMonth =
        idx === nowInfo.month && state.selectedYear === nowInfo.year;
      const numBadge = String(idx + 1).padStart(2, '0');

      monthGridHTML += `
        <button
          type="button"
          data-opt-val="${valStr}"
          class="month-grid-item ${isSelected ? 'is-selected' : ''}"
        >
          <span class="flex items-center gap-1.5 truncate">
            <span class="text-[10px] font-mono-num px-1.5 py-0.5 rounded ${
              isSelected
                ? 'bg-emerald-500/30 text-emerald-200'
                : 'bg-slate-800 text-slate-400'
            }">${numBadge}</span>
            <span class="truncate">${mName}</span>
          </span>
          ${
            isSelected
              ? '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400 shrink-0"></i>'
              : isCurrentRealMonth
              ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>'
              : ''
          }
        </button>
      `;
    });

    monthGridHTML += `</div>`;
    portal.innerHTML = monthGridHTML;
  } else {
    const options = Array.from(selectEl.options);
    portal.innerHTML = `
      <div class="space-y-1">
        ${options
          .map((opt) => {
            const isSelected = opt.value === currentVal;
            const iconName = getOptionIconName(selectEl.id, opt.value);
            return `
              <button
                type="button"
                data-opt-val="${opt.value.replace(/"/g, '&quot;')}"
                class="custom-select-option ${isSelected ? 'is-selected' : ''}"
              >
                <span class="flex items-center gap-2.5 truncate">
                  ${
                    iconName
                      ? `<span class="w-6 h-6 rounded-lg ${
                          isSelected
                            ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                            : 'bg-slate-800/90 text-slate-400 border border-slate-700/60'
                        } flex items-center justify-center shrink-0">
                           <i data-lucide="${iconName}" class="w-3.5 h-3.5"></i>
                         </span>`
                      : ''
                  }
                  <span class="truncate">${opt.textContent}</span>
                </span>
                ${
                  isSelected
                    ? '<i data-lucide="check" class="w-4 h-4 text-emerald-400 shrink-0"></i>'
                    : ''
                }
              </button>
            `;
          })
          .join('')}
      </div>
    `;
  }

  document.body.appendChild(portal);
  activeSelectPortal = portal;

  if (window.lucide) {
    window.lucide.createIcons({ nodes: [portal] });
  }

  const anchorEl =
    mode === 'month-grid' || mode === 'compact' ? trigger.parentElement : trigger;
  const rect = anchorEl.getBoundingClientRect();
  const desiredWidth =
    mode === 'month-grid'
      ? Math.min(280, window.innerWidth - 20)
      : Math.max(rect.width, mode === 'compact' ? 140 : rect.width);

  portal.style.width = `${desiredWidth}px`;

  let leftPos = rect.left;
  if (leftPos + desiredWidth > window.innerWidth - 10) {
    leftPos = window.innerWidth - desiredWidth - 10;
  }
  if (leftPos < 10) leftPos = 10;

  const portalHeight = portal.offsetHeight || 240;
  let topPos = rect.bottom + 6;
  if (topPos + portalHeight > window.innerHeight - 12 && rect.top > portalHeight + 12) {
    topPos = rect.top - portalHeight - 6;
  }

  portal.style.left = `${leftPos}px`;
  portal.style.top = `${topPos}px`;

  portal.querySelectorAll('[data-opt-val]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = btn.getAttribute('data-opt-val');
      selectCustomOption(selectEl, val);
    });
  });
}

function setupSingleCustomSelect(selectEl) {
  if (!selectEl || selectEl._customTrigger) return;
  const mode = selectEl.getAttribute('data-custom-select') || 'field';

  selectEl.classList.add('native-select-hidden');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = `custom-select-trigger ${
    mode === 'month-grid' || mode === 'compact' ? 'trigger-compact' : 'trigger-field'
  }`;

  selectEl.parentNode.insertBefore(trigger, selectEl.nextSibling);
  selectEl._customTrigger = trigger;

  syncCustomSelectTrigger(selectEl);

  const clickTarget =
    mode === 'month-grid' || mode === 'compact' ? trigger.parentElement : trigger;
  clickTarget.addEventListener('click', (e) => {
    e.stopPropagation();
    openCustomSelectPortal(selectEl);
  });
}

// ================= MASTER RENDER DASHBOARD =================

function refreshDashboard() {
  applyThemeToDOM();
  applyTranslationsToDOM();
  syncCurrencySymbolsInDOM();
  syncFilterDropdowns();

  const filteredTx = getFilteredTransactions();
  const metrics = calculateSummaryMetrics(filteredTx);

  renderHeaderCards(metrics);
  renderWalletsSection();
  renderBreakdownTables(metrics);
  renderAnalyticsCharts(metrics);
  renderTransactionHistory(filteredTx);
  renderSettingsSection();
  syncAllCustomSelects();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ================= MODAL TAMBAH / EDIT TRANSAKSI =================

function populateCategorySelect(selectedType, selectedCategoryName = '') {
  const selectEl = document.getElementById('txCategory');
  const schema = getActiveSchema();
  const schemaType = schema[selectedType];
  if (!schemaType) return;

  let html = '';
  schemaType.groups.forEach((group) => {
    group.items.forEach((item) => {
      const isSelected = item.name === selectedCategoryName ? 'selected' : '';
      html += `<option value="${item.name}" ${isSelected}>${translateCategoryName(item.name)}</option>`;
    });
  });

  selectEl.innerHTML = html;
  syncCustomSelectTrigger(selectEl);

  const addCatBtn = document.getElementById('btnModalAddCustomCat');
  if (addCatBtn) {
    addCatBtn.onclick = () => openAddCategoryModal(selectedType);
  }
}

function populatePaymentMethodsSelect(selectedAccount = '') {
  const selectEl = document.getElementById('txAccount');
  const walletNames = state.wallets.map((w) => w.name);
  if (selectedAccount && selectedAccount !== '-' && !walletNames.includes(selectedAccount)) {
    walletNames.push(selectedAccount);
  }

  if (walletNames.length === 0) {
    selectEl.innerHTML = `<option value="-" selected>${t('tx_without_wallet')}</option>`;
    syncCustomSelectTrigger(selectEl);
    return;
  }

  selectEl.innerHTML = walletNames
    .map((acc) => {
      const isSelected = acc === selectedAccount ? 'selected' : '';
      return `<option value="${acc}" ${isSelected}>${acc}</option>`;
    })
    .join('');
  syncCustomSelectTrigger(selectEl);
}

function setModalTypeUI(type) {
  document.getElementById('txType').value = type;
  document.querySelectorAll('.tx-type-btn').forEach((btn) => {
    const btnType = btn.getAttribute('data-type');
    if (btnType === type) {
      if (type === 'Income') {
        btn.className =
          'tx-type-btn flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm';
      } else if (type === 'Expense') {
        btn.className =
          'tx-type-btn flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all bg-rose-500/20 border-rose-500 text-rose-300 shadow-sm';
      } else {
        btn.className =
          'tx-type-btn flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all bg-blue-500/20 border-blue-500 text-blue-300 shadow-sm';
      }
    } else {
      btn.className =
        'tx-type-btn flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-all';
    }
  });
}

function setLockedTransactionDate(isoDateString) {
  const dateInput = document.getElementById('txDate');
  const dateDisplay = document.getElementById('txDateLockedDisplay');
  dateInput.value = isoDateString;

  const formatted = new Date(isoDateString + 'T00:00:00').toLocaleDateString(getActiveLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  if (dateDisplay) {
    dateDisplay.value = formatted;
  }
}

function openTransactionModal(defaultTypeOverride = null) {
  state.editingTxId = null;
  document.getElementById('modalTxTitle').textContent = t('btn_add_tx');
  document.getElementById('btnSubmitTxText').textContent = t('modal_tx_submit');

  let initialType = defaultTypeOverride || 'Expense';
  if (!defaultTypeOverride) {
    if (state.activeTab === 'income') initialType = 'Income';
    else if (state.activeTab === 'savings') initialType = 'Savings';
  }

  setModalTypeUI(initialType);
  populateCategorySelect(initialType);
  const firstWallet = state.wallets[0] ? state.wallets[0].name : '-';
  populatePaymentMethodsSelect(firstWallet);

  setLockedTransactionDate(getTodayLocalISO());

  document.getElementById('txAmount').value = '';
  document.getElementById('txAmountPreview').textContent = formatRp(0);
  document.getElementById('txNote').value = '';
  clearFieldValidationError('txAmount', 'txAmountError');

  const modal = document.getElementById('modalTransaction');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
    document.getElementById('txAmount').focus();
  });
}

function openQuickAddModal(type, categoryName) {
  openTransactionModal(type);
  setModalTypeUI(type);
  populateCategorySelect(type, categoryName);
}

function openEditTransactionModal(txId) {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;

  state.editingTxId = tx.id;
  document.getElementById('modalTxTitle').textContent = t('modal_tx_edit_title');
  document.getElementById('btnSubmitTxText').textContent = t('modal_tx_update');

  setModalTypeUI(tx.type);
  populateCategorySelect(tx.type, tx.category);
  populatePaymentMethodsSelect(tx.account);
  setLockedTransactionDate(tx.date);

  document.getElementById('txAmount').value = formatNumberWithDots(tx.amount);
  document.getElementById('txAmountPreview').textContent = formatRp(tx.amount);
  document.getElementById('txNote').value = tx.note || '';
  clearFieldValidationError('txAmount', 'txAmountError');

  const modal = document.getElementById('modalTransaction');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
  });
}

function closeTransactionModal() {
  closeCustomSelectPortal();
  clearFieldValidationError('txAmount', 'txAmountError');
  const modal = document.getElementById('modalTransaction');
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function addQuickAmount(valueToAdd) {
  const input = document.getElementById('txAmount');
  const current = parseFormattedNumber(input.value);
  const nextVal = current + valueToAdd;
  input.value = formatNumberWithDots(nextVal);
  document.getElementById('txAmountPreview').textContent = formatRp(nextVal);
  clearFieldValidationError('txAmount', 'txAmountError');
}

function handleTransactionFormSubmit(e) {
  e.preventDefault();
  const existingTx = state.editingTxId
    ? state.transactions.find((t) => t.id === state.editingTxId)
    : null;
  const date = existingTx ? existingTx.date : getTodayLocalISO();

  const type = document.getElementById('txType').value;
  const category = document.getElementById('txCategory').value;
  const amount = parseFormattedNumber(document.getElementById('txAmount').value);
  const account = document.getElementById('txAccount').value;
  const note = document.getElementById('txNote').value.trim();

  if (!amount || amount <= 0) {
    showFieldValidationError('txAmount', 'txAmountError', `> ${formatRp(0)}`);
    return;
  }

  clearFieldValidationError('txAmount', 'txAmountError');

  if (state.editingTxId && existingTx) {
    const idx = state.transactions.findIndex((t) => t.id === state.editingTxId);
    if (idx !== -1) {
      state.transactions[idx] = {
        ...state.transactions[idx],
        date,
        type,
        category,
        amount,
        account,
        note
      };
      showToast(`${translateCategoryName(category)} — ${t('modal_tx_update')}!`);
    }
  } else {
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date,
      type,
      category,
      amount,
      account,
      note
    };
    state.transactions.push(newTx);
    showToast(`${formatRp(amount)} • ${translateCategoryName(category)} (${account})!`);
  }

  const [txYear, txMonth] = date.split('-').map(Number);
  state.selectedYear = txYear;
  if (state.selectedMonth !== -1) {
    state.selectedMonth = txMonth - 1;
  }
  saveTransactionsToStorage();
  closeTransactionModal();
  refreshDashboard();
}

function deleteTransaction(txId) {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) return;

  state.transactions = state.transactions.filter((t) => t.id !== txId);
  saveTransactionsToStorage();
  refreshDashboard();
  showToast(`${translateCategoryName(tx.category)} — ${t('btn_reset')}.`);
}

// ================= MODAL TAMBAH KATEGORI SENDIRI =================

function openAddCategoryModal(defaultType = 'Savings') {
  const typeSelect = document.getElementById('customCatType');
  typeSelect.value = defaultType;
  syncCustomSelectTrigger(typeSelect);
  document.getElementById('customCatName').value = '';
  clearFieldValidationError('customCatName', 'customCatNameError');

  const modal = document.getElementById('modalAddCategory');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
    document.getElementById('customCatName').focus();
  });
}

function closeAddCategoryModal() {
  closeCustomSelectPortal();
  clearFieldValidationError('customCatName', 'customCatNameError');
  const modal = document.getElementById('modalAddCategory');
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function handleAddCategorySubmit(e) {
  e.preventDefault();
  const type = document.getElementById('customCatType').value || 'Savings';
  const name = document.getElementById('customCatName').value.trim();

  if (!name) {
    showFieldValidationError('customCatName', 'customCatNameError', t('modal_cat_name_label'));
    return;
  }

  const allExisting = getAllCategoriesFlat().some(
    (c) => c.type === type && c.name.toLowerCase() === name.toLowerCase()
  );
  if (allExisting) {
    showFieldValidationError('customCatName', 'customCatNameError', `"${name}"`);
    return;
  }

  clearFieldValidationError('customCatName', 'customCatNameError');

  if (!state.customCategories[type]) state.customCategories[type] = [];
  state.customCategories[type].push({
    id: 'cat_' + Date.now(),
    name,
    icon: type === 'Savings' ? 'piggy-bank' : type === 'Income' ? 'coins' : 'shopping-bag'
  });

  saveCustomCategoriesToStorage();
  closeAddCategoryModal();
  refreshDashboard();

  const txModal = document.getElementById('modalTransaction');
  if (txModal && !txModal.classList.contains('hidden')) {
    setModalTypeUI(type);
    populateCategorySelect(type, name);
  }

  showToast(`"${name}" (${translateTxType(type)})!`);
}

function deleteCustomCategory(type, id, name) {
  if (!state.customCategories[type]) return;
  state.customCategories[type] = state.customCategories[type].filter((c) => c.id !== id);
  saveCustomCategoriesToStorage();
  refreshDashboard();
  showToast(`"${name}" — ${t('btn_reset')}.`);
}

// ================= MODAL KELOLA WALLET =================

function openSetWalletBalanceModal(walletId) {
  const calculated = getCalculatedWallets();
  const wallet = calculated.find((w) => w.id === walletId);
  if (!wallet) return;

  state.editingWalletId = walletId;
  document.getElementById('walletBalanceModalTitle').textContent = `${t('wallet_btn_set_balance')} ${wallet.name}`;
  document.getElementById('walletBalanceInput').value =
    wallet.currentBalance > 0 ? formatNumberWithDots(wallet.currentBalance) : '';
  document.getElementById('walletBalancePreview').textContent = formatRp(wallet.currentBalance);

  const modal = document.getElementById('modalWalletBalance');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
    document.getElementById('walletBalanceInput').focus();
    document.getElementById('walletBalanceInput').select();
  });
}

function closeWalletBalanceModal() {
  closeCustomSelectPortal();
  const modal = document.getElementById('modalWalletBalance');
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function handleSaveWalletBalance(e) {
  e.preventDefault();
  const targetBalance = parseFormattedNumber(document.getElementById('walletBalanceInput').value);
  const idx = state.wallets.findIndex((w) => w.id === state.editingWalletId);
  if (idx === -1) return;

  const wallet = state.wallets[idx];
  const netDelta = getWalletNetTxDelta(wallet.name);
  state.wallets[idx].initialBalance = targetBalance - netDelta;

  saveWalletsToStorage();
  closeWalletBalanceModal();
  refreshDashboard();
  showToast(`${wallet.name}: ${formatRp(targetBalance)}!`);
}

function openAddWalletModal(defaultType = 'Bank') {
  const validType = ['Bank', 'E-Wallet', 'Tunai'].includes(defaultType) ? defaultType : 'Bank';
  const nameInput = document.getElementById('newWalletName');
  nameInput.value = '';
  const typeSelect = document.getElementById('newWalletType');
  typeSelect.value = validType;
  syncCustomSelectTrigger(typeSelect);
  document.getElementById('newWalletInitial').value = '';
  document.getElementById('newWalletPreview').textContent = formatRp(0);
  clearFieldValidationError('newWalletName', 'newWalletNameError');

  const modal = document.getElementById('modalAddWallet');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
    nameInput.focus();
  });
}

function applyWalletPreset(presetName, presetType) {
  const nameInput = document.getElementById('newWalletName');
  const typeSelect = document.getElementById('newWalletType');
  if (nameInput) {
    nameInput.value = presetName;
    clearFieldValidationError('newWalletName', 'newWalletNameError');
  }
  if (typeSelect && ['Bank', 'E-Wallet', 'Tunai'].includes(presetType)) {
    typeSelect.value = presetType;
    syncCustomSelectTrigger(typeSelect);
  }
  const initialInput = document.getElementById('newWalletInitial');
  if (initialInput) initialInput.focus();
}

function addQuickWalletBalance(inputId, previewId, valueToAdd) {
  const inputEl = document.getElementById(inputId);
  const previewEl = document.getElementById(previewId);
  if (!inputEl) return;
  const current = parseFormattedNumber(inputEl.value);
  const nextVal = current + valueToAdd;
  inputEl.value = formatNumberWithDots(nextVal);
  if (previewEl) previewEl.textContent = formatRp(nextVal);
}

function closeAddWalletModal() {
  closeCustomSelectPortal();
  clearFieldValidationError('newWalletName', 'newWalletNameError');
  const modal = document.getElementById('modalAddWallet');
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function handleAddWalletSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('newWalletName').value.trim();
  const type = document.getElementById('newWalletType').value;
  const initialBalance = parseFormattedNumber(document.getElementById('newWalletInitial').value);

  if (!name) {
    showFieldValidationError('newWalletName', 'newWalletNameError', t('modal_addwal_name_label'));
    return;
  }

  const exists = state.wallets.some((w) => w.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    showFieldValidationError('newWalletName', 'newWalletNameError', `"${name}"`);
    return;
  }

  clearFieldValidationError('newWalletName', 'newWalletNameError');

  let icon = 'landmark';
  if (type === 'E-Wallet') icon = 'smartphone';
  else if (type === 'Tunai') icon = 'banknote';

  state.wallets.push({
    id: 'wal_' + Date.now(),
    name,
    type,
    icon,
    initialBalance
  });

  saveWalletsToStorage();
  closeAddWalletModal();
  refreshDashboard();
  showToast(`${name} (${formatRp(initialBalance)})!`);
}

function deleteWallet(walletId) {
  const target = state.wallets.find((w) => w.id === walletId);
  state.wallets = state.wallets.filter((w) => w.id !== walletId);
  saveWalletsToStorage();
  refreshDashboard();
  if (target) showToast(`"${target.name}" — ${t('btn_reset')}.`);
}

// ================= MODAL MONTHLY BUDGET =================

function openBudgetModal() {
  const schema = getActiveSchema();
  const container = document.getElementById('budgetFormContainer');
  const monthsList = getMonthNames();
  const cur = getActiveCurrencyObj();
  const m = state.selectedMonth === -1 ? getCurrentDateInfo(state.language).month : state.selectedMonth;
  const periodTitle = `${monthsList[m]} ${state.selectedYear}`;
  document.getElementById('budgetModalPeriodLabel').textContent = `${t('modal_budget_period_prefix')} ${periodTitle}`;

  let html = `
    <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 text-[11px] text-slate-400 leading-relaxed">
      ${t('modal_budget_note')}
    </div>
  `;

  Object.entries(schema).forEach(([type, typeObj]) => {
    if (type === 'Income' || typeObj.noBudget) return;

    const budgetableItems = [];
    typeObj.groups.forEach((group) => {
      group.items.forEach((item) => {
        if (!item.noBudget) {
          budgetableItems.push(item);
        }
      });
    });

    if (budgetableItems.length === 0) return;

    let accent = 'text-rose-400 border-rose-500/30';
    if (type === 'Savings') accent = 'text-blue-400 border-blue-500/30';
    const sectionHeading = type === 'Savings' ? t('nav_savings') : t('nav_expense');

    html += `
      <div class="mb-6 last:mb-0">
        <h4 class="text-xs font-bold uppercase tracking-wider pb-2 mb-3 border-b ${accent}">
          ${sectionHeading}
        </h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    `;

    budgetableItems.forEach((item) => {
      const key = makeBudgetKey(item.name, state.selectedYear, m);
      const currentVal = state.budgets[key] ?? 0;
      const formattedVal = currentVal > 0 ? formatNumberWithDots(currentVal) : '';
      html += `
        <div class="bg-slate-900/65 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1">
          <label class="text-xs text-slate-300 font-medium">${translateCategoryName(item.name)}</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono-num">${cur.symbol}</span>
            <input
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="0"
              data-budget-category="${item.name}"
              value="${formattedVal}"
              class="budget-input w-full pl-10 pr-3 py-1.5 rounded-lg text-sm font-mono-num input-dark"
            />
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.budget-input').forEach((inputEl) => {
    attachThousandSeparatorInput(inputEl);
  });

  const modal = document.getElementById('modalBudget');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
  });
}

function closeBudgetModal() {
  const modal = document.getElementById('modalBudget');
  modal.classList.remove('modal-open');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 180);
}

function handleSaveBudgets(e) {
  e.preventDefault();
  const monthsList = getMonthNames();
  const m = state.selectedMonth === -1 ? getCurrentDateInfo(state.language).month : state.selectedMonth;
  const inputs = document.querySelectorAll('.budget-input');

  inputs.forEach((input) => {
    const cat = input.getAttribute('data-budget-category');
    const val = Math.max(0, parseFormattedNumber(input.value));
    const key = makeBudgetKey(cat, state.selectedYear, m);
    if (val > 0) {
      state.budgets[key] = val;
    } else {
      delete state.budgets[key];
    }
  });

  saveBudgetsToStorage();
  closeBudgetModal();
  refreshDashboard();
  showToast(`${t('modal_budget_title')} (${monthsList[m]} ${state.selectedYear})!`);
}

function openSingleBudgetPrompt(categoryName) {
  if (isCategoryNoBudget(categoryName)) return;
  openBudgetModal();
  setTimeout(() => {
    const targetInput = document.querySelector(`input[data-budget-category="${categoryName}"]`);
    if (targetInput) {
      targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetInput.focus();
      targetInput.select();
    }
  }, 220);
}

// ================= UTILITAS: KOSONGKAN DATA & EXPORT CSV =================

function clearAllFinanceData() {
  state.transactions = [];
  state.budgets = {};
  state.wallets = JSON.parse(JSON.stringify(DEFAULT_WALLETS));
  const now = getCurrentDateInfo(state.language);
  state.firstOpenedYear = now.year;
  state.firstOpenedMonth = now.month;
  state.selectedMonth = now.month;
  state.selectedYear = now.year;

  localStorage.setItem(
    STORAGE_KEYS.META,
    JSON.stringify({
      firstOpenedYear: state.firstOpenedYear,
      firstOpenedMonth: state.firstOpenedMonth,
      firstOpenedAt: now.isoDate
    })
  );

  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(state.budgets));
  localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(state.wallets));
  syncFilterDropdowns();
  refreshDashboard();
  showToast(`${t('btn_reset')} (${formatRp(0)})!`);
}

function exportFilteredToCSV() {
  const filteredTx = getFilteredTransactions();
  if (filteredTx.length === 0) {
    showToast(`${t('tx_empty_period')} (${formatRp(0)}).`, 'error');
    return;
  }

  const cur = getActiveCurrencyObj();
  const headers = [
    t('th_tx_date'),
    t('th_tx_type'),
    t('th_tx_category'),
    `${t('th_tx_amount')} (${cur.symbol})`,
    t('th_tx_wallet'),
    t('modal_tx_note_label')
  ];
  const rows = filteredTx.map((tx) => [
    tx.date,
    translateTxType(tx.type),
    `"${translateCategoryName(tx.category || '').replace(/"/g, '""')}"`,
    tx.amount,
    `"${(tx.account || '').replace(/"/g, '""')}"`,
    `"${(tx.note || '').replace(/"/g, '""')}"`
  ]);

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  const mLabel = state.selectedMonth === -1 ? 'AllYear' : MONTHS_ID[state.selectedMonth];
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Finance_Tracker_${mLabel}_${state.selectedYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV downloaded!');
}

function showToast(message, variant = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  const isError = variant === 'error';

  toast.className = `flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl border text-xs sm:text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 ${
    isError
      ? 'bg-rose-950/90 border-rose-500/50 text-rose-200 keep-white'
      : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 keep-white'
  }`;

  toast.innerHTML = `
    <i data-lucide="${isError ? 'alert-circle' : 'check-circle-2'}" class="w-4 h-4 shrink-0 ${
    isError ? 'text-rose-400' : 'text-emerald-400'
  }"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ================= DROPDOWN SYNC & INIT =================

function populateYearDropdown() {
  const filterYearEl = document.getElementById('filterYear');
  if (!filterYearEl) return;
  const years = getAvailableYears();
  if (!years.includes(state.selectedYear)) {
    state.selectedYear = years[years.length - 1];
  }
  filterYearEl.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join('');
  filterYearEl.value = String(state.selectedYear);
  syncCustomSelectTrigger(filterYearEl);
}

function populateMonthDropdown() {
  const filterMonthEl = document.getElementById('filterMonth');
  if (!filterMonthEl) return;

  const fullYearUnlocked = isFullYearUnlocked();
  const availMonths = getAvailableMonthsForYear(state.selectedYear);
  const monthsList = getMonthNames();

  let monthOptions = '';
  if (fullYearUnlocked) {
    monthOptions += `<option value="-1">${t('month_picker_all_year')}</option>`;
  }
  availMonths.forEach((idx) => {
    monthOptions += `<option value="${idx}">${monthsList[idx]}</option>`;
  });

  filterMonthEl.innerHTML = monthOptions;

  if (state.selectedMonth === -1 && !fullYearUnlocked) {
    state.selectedMonth = availMonths[availMonths.length - 1];
  } else if (state.selectedMonth !== -1 && !availMonths.includes(state.selectedMonth)) {
    state.selectedMonth = availMonths[availMonths.length - 1];
  }

  filterMonthEl.value = String(state.selectedMonth);
  syncCustomSelectTrigger(filterMonthEl);
}

function syncFilterDropdowns() {
  populateYearDropdown();
  populateMonthDropdown();

  const years = getAvailableYears();
  const availMonths = getAvailableMonthsForYear(state.selectedYear);
  const hasMultiplePeriods = years.length > 1 || availMonths.length > 1;

  const prevBtn = document.getElementById('btnPrevPeriod');
  const nextBtn = document.getElementById('btnNextPeriod');
  if (prevBtn) {
    prevBtn.classList.toggle('hidden', !hasMultiplePeriods);
  }
  if (nextBtn) {
    nextBtn.classList.toggle('hidden', !hasMultiplePeriods);
  }
}

function initApp() {
  loadStateFromStorage();
  applyThemeToDOM();
  applyTranslationsToDOM();
  syncCurrencySymbolsInDOM();
  checkDeviceFingerprintHardware();

  syncFilterDropdowns();
  populateSettingsPreferencesDropdowns();
  syncAllCustomSelects();

  // Event Listener Pengaturan Mata Uang & Bahasa
  const curSelect = document.getElementById('settingsCurrencySelect');
  if (curSelect) {
    curSelect.addEventListener('change', (e) => {
      setCurrencyFormat(e.target.value);
    });
  }

  const langSelect = document.getElementById('settingsLanguageSelect');
  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      setAppLanguage(e.target.value);
    });
  }

  const importFileInput = document.getElementById('importBackupFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportBackupFileChange);
  }

  const filterMonthEl = document.getElementById('filterMonth');
  filterMonthEl.addEventListener('change', (e) => {
    state.selectedMonth = parseInt(e.target.value, 10);
    refreshDashboard();
  });

  document.getElementById('filterYear').addEventListener('change', (e) => {
    state.selectedYear = parseInt(e.target.value, 10);
    populateMonthDropdown();
    refreshDashboard();
  });

  document.querySelectorAll('.tx-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selectedType = btn.getAttribute('data-type');
      setModalTypeUI(selectedType);
      populateCategorySelect(selectedType);
    });
  });

  attachThousandSeparatorInput(
    document.getElementById('txAmount'),
    document.getElementById('txAmountPreview')
  );
  attachThousandSeparatorInput(
    document.getElementById('walletBalanceInput'),
    document.getElementById('walletBalancePreview')
  );
  attachThousandSeparatorInput(
    document.getElementById('newWalletInitial'),
    document.getElementById('newWalletPreview')
  );

  document.getElementById('txAmount').addEventListener('input', () => {
    clearFieldValidationError('txAmount', 'txAmountError');
  });
  document.getElementById('customCatName').addEventListener('input', () => {
    clearFieldValidationError('customCatName', 'customCatNameError');
  });
  document.getElementById('newWalletName').addEventListener('input', () => {
    clearFieldValidationError('newWalletName', 'newWalletNameError');
  });

  document.addEventListener('click', () => {
    closeCustomSelectPortal();
  });
  window.addEventListener(
    'scroll',
    (e) => {
      if (activeSelectPortal && activeSelectPortal.contains(e.target)) return;
      closeCustomSelectPortal();
    },
    true
  );
  window.addEventListener('resize', () => {
    closeCustomSelectPortal();
  });

  document.getElementById('formTransaction').addEventListener('submit', handleTransactionFormSubmit);
  document.getElementById('formBudget').addEventListener('submit', handleSaveBudgets);
  document.getElementById('formAddCategory').addEventListener('submit', handleAddCategorySubmit);
  document.getElementById('formWalletBalance').addEventListener('submit', handleSaveWalletBalance);
  document.getElementById('formAddWallet').addEventListener('submit', handleAddWalletSubmit);

  document.getElementById('txSearchInput').addEventListener('input', (e) => {
    state.txSearchQuery = e.target.value;
    renderTransactionHistory(getFilteredTransactions());
    if (window.lucide) window.lucide.createIcons();
  });

  document.getElementById('txTypeFilterSelect').addEventListener('change', (e) => {
    state.txTypeFilter = e.target.value;
    renderTransactionHistory(getFilteredTransactions());
    if (window.lucide) window.lucide.createIcons();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCustomSelectPortal();
      closeTransactionModal();
      closeBudgetModal();
      closeAddCategoryModal();
      closeWalletBalanceModal();
      closeAddWalletModal();
      closeGoogleAuthModal();
      closeSecuritySetupModal();
    }
  });

  refreshDashboard();
  const urlParams = new URLSearchParams(window.location.search || '');
  if (urlParams.get('tab') === 'settings') {
    switchTab('settings');
  } else {
    switchTab('dashboard');
  }

  // Tampilkan layar kunci (Lock Screen) jika fitur Kata Sandi diaktifkan
  if (state.isAppLocked && state.security && state.security.enabled) {
    renderAppLockOverlay();
  }

  initPwaInstallButton();
}

// ================= INSTALL APP (PWA / WEBAPK) =================

let deferredPwaPrompt = null;

function isRunningStandaloneApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function updatePwaInstallButtonsVisibility(show) {
  document.querySelectorAll('.btn-install-pwa').forEach((btn) => {
    if (show && !isRunningStandaloneApp()) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });
}

function initPwaInstallButton() {
  if (isRunningStandaloneApp()) {
    updatePwaInstallButtonsVisibility(false);
    return;
  }
  // Tampilkan tombol Install App selama dibuka di tab browser biasa
  updatePwaInstallButtonsVisibility(true);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  updatePwaInstallButtonsVisibility(true);
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  updatePwaInstallButtonsVisibility(false);
  if (typeof showToast === 'function') {
    showToast('Aplikasi FinanceTracker berhasil di-install di perangkat Anda!', 'emerald');
  }
});

async function installPwaApp() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choiceResult = await deferredPwaPrompt.userChoice;
    deferredPwaPrompt = null;
    if (choiceResult && choiceResult.outcome === 'accepted') {
      updatePwaInstallButtonsVisibility(false);
    }
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIOS) {
    showToast(
      'Untuk install di iPhone/iPad: Ketuk ikon Share (kotak panah atas) di bawah Safari lalu pilih "Add to Home Screen / Tambah ke Layar Utama".',
      'emerald'
    );
  } else {
    showToast(
      'Untuk meng-install aplikasi: Ketuk ikon Titik Tiga (⋮) di pojok kanan atas Chrome lalu pilih "Instal aplikasi / Tambahkan ke Layar Utama".',
      'emerald'
    );
  }
}

document.addEventListener('DOMContentLoaded', initApp);

