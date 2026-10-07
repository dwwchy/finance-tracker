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
  SECURITY: 'finance_tracker_security_v6',
  SETTINGS: 'finance_tracker_settings_v6',
  EVALUATIONS: 'finance_tracker_evaluations_v6',
  DELETED_CATEGORIES: 'finance_tracker_deleted_cats_v1'
};

let state = {
  deletedCategories: [],
  activeTab: 'dashboard', // 'dashboard' | 'wallets' | 'income' | 'expense' | 'savings' | 'history' | 'settings'
  theme: 'dark', // 'dark' | 'light'
  currency: 'IDR', // key in CURRENCIES
  language: 'id', // key in I18N_TRANSLATIONS
  firstOpenedYear: new Date().getFullYear(),
  firstOpenedMonth: new Date().getMonth(),
  selectedMonth: new Date().getMonth(),
  selectedYear: new Date().getFullYear(),
  settings: {
    paydayConfig: {
      dayOfMonth: 25,
      salaryAmount: 5000000,
      lastUpdated: null // String "YYYY-MM"
    },
    reminderEnabled: true,
    reminderTime: "20:00"
  },
  transactions: [],
  budgets: {},
  customCategories: {
    Income: [],
    Expense: [],
    Savings: []
  },
  wallets: [],
  walletTypeFilter: 'ALL',
  evaluations: [],
  quotes: (typeof defaultFinancialData !== 'undefined' && defaultFinancialData.quotes && defaultFinancialData.quotes.length > 0)
    ? [...defaultFinancialData.quotes]
    : ((typeof billionaireQuotes !== 'undefined' && billionaireQuotes.length > 0) ? [...billionaireQuotes] : []),
  currentQuoteIndex: 0,
  incomeQuadrantFilter: 'ALL', // 'ALL' | 1 | 2 | 3 | 4
  expenseQuadrantFilter: 'ALL', // 'ALL' | 1 | 2 | 3 | 4
  savingsQuadrantFilter: 'ALL', // 'ALL' | 1 | 2 | 3 | 4
  expenseTypeFilter: 'ALL', // 'ALL' | 'needs' | 'wants'
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
  const deleted = state.deletedCategories || [];

  ['Income', 'Expense', 'Savings'].forEach((type) => {
    schema[type].groups.forEach((group) => {
      group.items = group.items.filter((item) => !deleted.includes(item.name));
    });

    const customs = state.customCategories[type] || [];
    customs.forEach((customItem) => {
      if (deleted.includes(customItem.name)) return;
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
    const rawTx = savedTx ? JSON.parse(savedTx) : getInitialTransactions();
    state.transactions = rawTx.map((tx) => ({
      ...tx,
      quadrant: tx.quadrant ? Number(tx.quadrant) : 2,
      expenseType: tx.expenseType || (tx.type === 'Expense' ? 'needs' : undefined)
    }));

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

    const savedDeletedCats = localStorage.getItem(STORAGE_KEYS.DELETED_CATEGORIES);
    if (savedDeletedCats) {
      try {
        state.deletedCategories = JSON.parse(savedDeletedCats);
      } catch (e) {
        state.deletedCategories = [];
      }
    } else {
      state.deletedCategories = [];
    }

    const savedWallets = localStorage.getItem(STORAGE_KEYS.WALLETS);
    if (savedWallets) {
      state.wallets = JSON.parse(savedWallets);
    } else {
      state.wallets = JSON.parse(JSON.stringify(DEFAULT_WALLETS));
      saveWalletsToStorage();
    }

    // Settings & Siklus Gaji
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (savedSettings) {
      state.settings = {
        paydayConfig: { dayOfMonth: 25, salaryAmount: 5000000, lastUpdated: null },
        reminderEnabled: true,
        reminderTime: "20:00",
        ...JSON.parse(savedSettings)
      };
    } else {
      state.settings = {
        paydayConfig: { dayOfMonth: 25, salaryAmount: 5000000, lastUpdated: null },
        reminderEnabled: true,
        reminderTime: "20:00"
      };
    }
    const lastSalUpdate = localStorage.getItem('lastSalaryConfigUpdate');
    if (lastSalUpdate && state.settings.paydayConfig) {
      state.settings.paydayConfig.lastUpdated = lastSalUpdate;
    }

    // Evaluations
    const savedEvaluations = localStorage.getItem(STORAGE_KEYS.EVALUATIONS);
    state.evaluations = savedEvaluations ? JSON.parse(savedEvaluations) : [];

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

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
  if (state.settings && state.settings.paydayConfig && state.settings.paydayConfig.lastUpdated) {
    localStorage.setItem('lastSalaryConfigUpdate', state.settings.paydayConfig.lastUpdated);
  }
}

function saveEvaluationsToStorage() {
  localStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(state.evaluations));
}

const PENDING_DRIVE_SYNC_KEY = 'ft_pending_drive_sync_v1';

function hasPendingDriveSync() {
  return localStorage.getItem(PENDING_DRIVE_SYNC_KEY) === 'true';
}

function setPendingDriveSync(pending) {
  if (pending) {
    localStorage.setItem(PENDING_DRIVE_SYNC_KEY, 'true');
  } else {
    localStorage.removeItem(PENDING_DRIVE_SYNC_KEY);
  }
}

function saveTransactionsToStorage() {
  localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(state.transactions));
  setPendingDriveSync(true);
  triggerSilentAutoBackupIfConnected();
}

function saveBudgetsToStorage() {
  localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(state.budgets));
  setPendingDriveSync(true);
  triggerSilentAutoBackupIfConnected();
}

function saveCustomCategoriesToStorage() {
  localStorage.setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, JSON.stringify(state.customCategories));
  setPendingDriveSync(true);
  triggerSilentAutoBackupIfConnected();
}

function saveDeletedCategoriesToStorage() {
  localStorage.setItem(STORAGE_KEYS.DELETED_CATEGORIES, JSON.stringify(state.deletedCategories || []));
  setPendingDriveSync(true);
  triggerSilentAutoBackupIfConnected();
}

function saveWalletsToStorage() {
  localStorage.setItem(STORAGE_KEYS.WALLETS, JSON.stringify(state.wallets));
  setPendingDriveSync(true);
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

function getCurrentCycleDateRange(year = state.selectedYear, month = state.selectedMonth) {
  const paydayDay = (state.settings && state.settings.paydayConfig && state.settings.paydayConfig.dayOfMonth)
    ? Number(state.settings.paydayConfig.dayOfMonth)
    : 1;

  if (month === -1) {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59),
      label: `${t('all_months_1_year')} ${year}`
    };
  }

  if (paydayDay <= 1) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0, 23, 59, 59);
    return {
      start: firstDay,
      end: lastDay,
      label: `${firstDay.toLocaleDateString(getActiveLocale(), { day: 'numeric', month: 'short' })} – ${lastDay.toLocaleDateString(getActiveLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`
    };
  }

  const cycleStart = new Date(year, month, paydayDay, 0, 0, 0, 0);
  const nextPayday = new Date(year, month + 1, paydayDay, 0, 0, 0, 0);
  const cycleEnd = new Date(nextPayday.getTime() - 1);

  return {
    start: cycleStart,
    end: cycleEnd,
    label: `${cycleStart.toLocaleDateString(getActiveLocale(), { day: 'numeric', month: 'short' })} – ${cycleEnd.toLocaleDateString(getActiveLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}`
  };
}

function isTransactionInSelectedPeriod(tx) {
  if (!tx.date) return false;
  const parts = tx.date.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (state.selectedMonth === -1) {
    return year === state.selectedYear;
  }

  const paydayDay = (state.settings && state.settings.paydayConfig && state.settings.paydayConfig.dayOfMonth)
    ? Number(state.settings.paydayConfig.dayOfMonth)
    : 1;

  if (paydayDay <= 1) {
    return year === state.selectedYear && month === state.selectedMonth;
  }

  // Siklus keuangan bulanan: dari tanggal gajian ini s/d H-1 gajian bulan berikutnya
  const cycle = getCurrentCycleDateRange(state.selectedYear, state.selectedMonth);
  const txDateObj = new Date(year, month, day, 12, 0, 0, 0);
  return txDateObj >= cycle.start && txDateObj <= cycle.end;
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
        btn.className = `mobile-tab-btn tab-btn-active ${activeColor} font-bold`;
      } else {
        btn.className =
          'mobile-tab-btn text-slate-400 hover:text-slate-200 font-semibold';
      }
    }
  });

  if (tabName === 'dashboard') {
    setTimeout(() => {
      Object.values(charts).forEach((c) => {
        if (c) c.resize();
      });
    }, 50);
  } else if (tabName === 'wallets') {
    renderQuotesCard();
    requestAnimationFrame(() => {
      if (typeof updateWalletFilterGlider === 'function') {
        updateWalletFilterGlider(true);
        setTimeout(() => updateWalletFilterGlider(true), 60);
      }
    });
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

const WALLET_FILTER_TABS = ['ALL', 'Bank', 'Tunai', 'E-Wallet'];

function updateWalletFilterGlider(immediate = false) {
  const container = document.getElementById('walletFilterContainer');
  const glider = document.getElementById('walletFilterGlider');
  if (!container || !glider) return;

  const walletTab = document.getElementById('tabSection-wallets');
  if (walletTab && walletTab.classList.contains('hidden')) return;

  const activeBtn = container.querySelector(`[data-wallet-filter="${state.walletTypeFilter || 'ALL'}"]`);
  if (!activeBtn) return;

  const containerRect = container.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();

  if (btnRect.width === 0) {
    requestAnimationFrame(() => updateWalletFilterGlider(immediate));
    return;
  }

  const left = btnRect.left - containerRect.left;
  const width = btnRect.width;

  if (immediate) {
    glider.style.transition = 'none';
    glider.style.transform = `translateX(${left}px)`;
    glider.style.width = `${width}px`;
    glider.style.opacity = '1';
    void glider.offsetWidth;
    glider.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1), width 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease';
  } else {
    glider.style.transform = `translateX(${left}px)`;
    glider.style.width = `${width}px`;
    glider.style.opacity = '1';
  }
}

function setWalletTypeFilter(filterType) {
  state.walletTypeFilter = filterType || 'ALL';
  renderWalletsSection();
  updateWalletFilterGlider(false);
  if (window.lucide) window.lucide.createIcons();
}

function initWalletSwipeGestures() {
  const container = document.getElementById('walletsGridContainer');
  if (!container || container._swipeInitialized) return;
  container._swipeInitialized = true;

  let startX = 0;
  let startY = 0;
  let isSwiping = false;

  container.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = true;
    },
    { passive: true }
  );

  container.addEventListener(
    'touchend',
    (e) => {
      if (!isSwiping) return;
      isSwiping = false;
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = endX - startX;
      const diffY = endY - startY;

      // Minimum swipe threshold 38px and horizontal dominant
      if (Math.abs(diffX) > 38 && Math.abs(diffX) > Math.abs(diffY) * 1.3) {
        const currentIndex = WALLET_FILTER_TABS.indexOf(state.walletTypeFilter || 'ALL');
        if (diffX < 0) {
          // Swiped LEFT -> Next tab
          if (currentIndex < WALLET_FILTER_TABS.length - 1) {
            container.classList.remove('wallet-slide-from-right', 'wallet-slide-from-left');
            void container.offsetWidth;
            container.classList.add('wallet-slide-from-right');
            setWalletTypeFilter(WALLET_FILTER_TABS[currentIndex + 1]);
          }
        } else {
          // Swiped RIGHT -> Previous tab
          if (currentIndex > 0) {
            container.classList.remove('wallet-slide-from-right', 'wallet-slide-from-left');
            void container.offsetWidth;
            container.classList.add('wallet-slide-from-left');
            setWalletTypeFilter(WALLET_FILTER_TABS[currentIndex - 1]);
          }
        }
      }
    },
    { passive: true }
  );
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
        'wallet-filter-btn px-2.5 sm:px-4 py-1.5 rounded-xl text-xs font-bold text-white transition-all text-center whitespace-nowrap focus:outline-none';
    } else {
      btn.className =
        'wallet-filter-btn px-2.5 sm:px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all text-center whitespace-nowrap focus:outline-none';
    }
  });

  updateWalletFilterGlider();

  // === DASHBOARD TOTAL SELURUH SALDO (DI ATAS TOTAL INCOME & TOTAL EXPENSES) ===
  const dashTotalAllEl = document.getElementById('dashboardTotalAllBalance');
  if (dashTotalAllEl) dashTotalAllEl.textContent = formatRp(totalFunds);

  const dashWalletTotalEl = document.getElementById('dashboardWalletTotal');
  if (dashWalletTotalEl) {
    dashWalletTotalEl.textContent = formatRp(totalFunds);
  }

  const dashCountBadgeEl = document.getElementById('dashboardWalletCountBadge');
  if (dashCountBadgeEl) dashCountBadgeEl.textContent = `${calculated.length} ${t('nav_wallets')}`;

  const dashSumBankEl = document.getElementById('dashboardWalletSumBank');
  if (dashSumBankEl) dashSumBankEl.textContent = formatRp(totalBank);
  const dashSumCashEl = document.getElementById('dashboardWalletSumCash');
  if (dashSumCashEl) dashSumCashEl.textContent = formatRp(totalCash);
  const dashSumEwalletEl = document.getElementById('dashboardWalletSumEwallet');
  if (dashSumEwalletEl) dashSumEwalletEl.textContent = formatRp(totalEwallet);

  const dashCountBankEl = document.getElementById('dashboardWalletCountBank');
  if (dashCountBankEl) dashCountBankEl.textContent = `${countBank} ${t('wallet_accounts_suffix')}`;
  const dashCountCashEl = document.getElementById('dashboardWalletCountCash');
  if (dashCountCashEl) dashCountCashEl.textContent = `${countCash} ${t('wallet_accounts_suffix')}`;
  const dashCountEwalletEl = document.getElementById('dashboardWalletCountEwallet');
  if (dashCountEwalletEl) dashCountEwalletEl.textContent = `${countEwallet} ${t('wallet_accounts_suffix')}`;

  const dashPctBankEl = document.getElementById('dashboardWalletPctBank');
  if (dashPctBankEl) dashPctBankEl.textContent = `${pctBank}%`;
  const dashPctCashEl = document.getElementById('dashboardWalletPctCash');
  if (dashPctCashEl) dashPctCashEl.textContent = `${pctCash}%`;
  const dashPctEwalletEl = document.getElementById('dashboardWalletPctEwallet');
  if (dashPctEwalletEl) dashPctEwalletEl.textContent = `${pctEwallet}%`;

  const dashBarBankEl = document.getElementById('dashboardWalletBarBank');
  if (dashBarBankEl) dashBarBankEl.style.width = `${pctBank}%`;
  const dashBarCashEl = document.getElementById('dashboardWalletBarCash');
  if (dashBarCashEl) dashBarCashEl.style.width = `${pctCash}%`;
  const dashBarEwalletEl = document.getElementById('dashboardWalletBarEwallet');
  if (dashBarEwalletEl) dashBarEwalletEl.style.width = `${pctEwallet}%`;

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
              title="${(item.name === 'Tabungan Pendidikan' || item.isCustom) ? 'Hapus' : t('btn_reset')} ${displayCatName}"
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
            title="${(item.name === 'Tabungan Pendidikan' || item.isCustom) ? 'Hapus' : t('btn_reset')} ${displayCatName}"
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
  const filteredTx = getFilteredTransactions();

  // 1. INCOME dengan Filter Kuadran
  let incomeDesktopHTML = '';
  let incomeMobileHTML = '';
  let incTotalTracked = 0;

  const incTxFiltered = filteredTx.filter((tx) => {
    if (tx.type !== 'Income') return false;
    if (state.incomeQuadrantFilter !== 'ALL' && Number(tx.quadrant || 2) !== Number(state.incomeQuadrantFilter)) {
      return false;
    }
    return true;
  });

  const incTrackedByCat = {};
  incTxFiltered.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    incTrackedByCat[tx.category] = (incTrackedByCat[tx.category] || 0) + amt;
  });

  const totalFilteredIncome = incTxFiltered.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  schema.Income.groups.forEach((group) => {
    group.items.forEach((item) => {
      const tracked = incTrackedByCat[item.name] || 0;
      incTotalTracked += tracked;
      incomeDesktopHTML += buildIncomeDesktopRowHTML(item, tracked, totalFilteredIncome || metrics.totalIncome);
      incomeMobileHTML += buildIncomeMobileCardHTML(item, tracked, totalFilteredIncome || metrics.totalIncome);
    });
  });
  incomeDesktopHTML += buildIncomeTableFooterHTML(incTotalTracked);
  document.getElementById('tbodyIncome').innerHTML = incomeDesktopHTML;
  document.getElementById('mobileCardsIncome').innerHTML = incomeMobileHTML;

  // 2. EXPENSES dengan Filter Kuadran & Needs vs Wants
  let expenseDesktopHTML = '';
  let expenseMobileHTML = '';
  let expTotalTracked = 0;
  let expTotalBudget = 0;

  const expTxFiltered = filteredTx.filter((tx) => {
    if (tx.type !== 'Expense') return false;
    if (state.expenseQuadrantFilter !== 'ALL' && Number(tx.quadrant || 2) !== Number(state.expenseQuadrantFilter)) {
      return false;
    }
    if (state.expenseTypeFilter !== 'ALL' && (tx.expenseType || 'needs') !== state.expenseTypeFilter) {
      return false;
    }
    return true;
  });

  const expTrackedByCat = {};
  expTxFiltered.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    expTrackedByCat[tx.category] = (expTrackedByCat[tx.category] || 0) + amt;
  });

  schema.Expense.groups.forEach((group) => {
    group.items.forEach((item) => {
      const tracked = expTrackedByCat[item.name] || 0;
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

  // 3. SAVINGS dengan Filter Kuadran
  let savingsDesktopHTML = '';
  let savingsMobileHTML = '';
  let savTotalTracked = 0;
  let savTotalBudget = 0;

  const savTrackedByCat = {};
  state.transactions.forEach((tx) => {
    if (tx.type !== 'Savings' || !tx.date) return;
    if (state.savingsQuadrantFilter !== 'ALL' && Number(tx.quadrant || 2) !== Number(state.savingsQuadrantFilter)) {
      return false;
    }
    const parts = tx.date.split('-');
    const txYear = parseInt(parts[0], 10);
    const txMonth = parseInt(parts[1], 10) - 1;
    const isUpToPeriod =
      state.selectedMonth === -1
        ? txYear <= state.selectedYear
        : txYear < state.selectedYear ||
          (txYear === state.selectedYear && txMonth <= state.selectedMonth);

    if (isUpToPeriod) {
      const amt = Number(tx.amount) || 0;
      savTrackedByCat[tx.category] = (savTrackedByCat[tx.category] || 0) + amt;
    }
  });

  schema.Savings.groups.forEach((group) => {
    group.items.forEach((item) => {
      const tracked = savTrackedByCat[item.name] || 0;
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

function deleteCategoryCompletely(type, categoryName, customId = null) {
  if (!state.deletedCategories) state.deletedCategories = [];
  if (!state.deletedCategories.includes(categoryName)) {
    state.deletedCategories.push(categoryName);
  }
  saveDeletedCategoriesToStorage();

  if (customId && state.customCategories && state.customCategories[type]) {
    state.customCategories[type] = state.customCategories[type].filter(
      (c) => c.id !== customId && c.name !== categoryName
    );
    saveCustomCategoriesToStorage();
  }

  // Bersihkan semua transaksi terkait kategori ini
  state.transactions = state.transactions.filter((tx) => tx.category !== categoryName);
  saveTransactionsToStorage();

  // Bersihkan budget terkait kategori ini
  Object.keys(state.budgets).forEach((k) => {
    if (k.endsWith(`::${categoryName}`)) {
      delete state.budgets[k];
    }
  });
  saveBudgetsToStorage();

  refreshDashboard();
  showToast(`Kategori "${categoryName}" berhasil dihapus.`, 'emerald');
}

function clearCategoryNominal(type, categoryName, customId = null) {
  // Tabungan Pendidikan dibuat dapat dihapus sepenuhnya sesuai permintaan pengguna
  if (categoryName === 'Tabungan Pendidikan' || categoryName.toLowerCase().includes('tabungan pendidikan')) {
    deleteCategoryCompletely(type, categoryName, customId);
    return;
  }

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
    deleteCategoryCompletely(type, categoryName, customId);
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

  const qNum = Number(tx.quadrant) || 2;
  const qDotColors = { 1: 'bg-rose-500', 2: 'bg-amber-500', 3: 'bg-slate-400', 4: 'bg-blue-500' };
  const qLabel = t('quadrant_' + qNum);
  const qBadgeHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border badge-q${qNum}" title="${qLabel}"><span class="w-1.5 h-1.5 rounded-full ${qDotColors[qNum] || 'bg-amber-500'}"></span>${qLabel}</span>`;

  let expenseTypeHTML = '';
  if (tx.type === 'Expense') {
    const isWants = tx.expenseType === 'wants';
    const etLabel = t(isWants ? 'badge_wants' : 'badge_needs');
    expenseTypeHTML = `<span class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${isWants ? 'badge-wants' : 'badge-needs'}">${etLabel}</span>`;
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
        <div class="flex items-center gap-1.5 mb-1 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}">${displayType}</span>
          ${qBadgeHTML}
          ${expenseTypeHTML}
          <span class="text-[11px] font-mono-num text-slate-400 ml-auto sm:ml-0">${formattedDate}</span>
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

      const qNum = Number(tx.quadrant) || 2;
      const qDotColors = { 1: 'bg-rose-500', 2: 'bg-amber-500', 3: 'bg-slate-400', 4: 'bg-blue-500' };
      const qLabel = t('quadrant_' + qNum);
      const qBadgeHTML = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border badge-q${qNum}" title="${qLabel}"><span class="w-1.5 h-1.5 rounded-full ${qDotColors[qNum] || 'bg-amber-500'}"></span>${qLabel}</span>`;

      let expenseTypeHTML = '';
      if (tx.type === 'Expense') {
        const isWants = tx.expenseType === 'wants';
        const etLabel = t(isWants ? 'badge_wants' : 'badge_needs');
        expenseTypeHTML = `<span class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${isWants ? 'badge-wants' : 'badge-needs'}">${etLabel}</span>`;
      }

      const formattedDate = new Date(tx.date + 'T00:00:00').toLocaleDateString(getActiveLocale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });

      return `
        <tr class="hover:bg-slate-800/35 transition-colors">
          <td class="py-3 pl-4 pr-3 whitespace-nowrap text-xs font-mono-num text-slate-300">${formattedDate}</td>
          <td class="py-3 px-3 whitespace-nowrap">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${badgeHTML}
              ${qBadgeHTML}
              ${expenseTypeHTML}
            </div>
          </td>
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

function buildSafeDriveFolderUrl(folderId, email) {
  const cleanEmail = (email || (state.googleAccount && state.googleAccount.email) || '').trim();
  const targetUrl = folderId
    ? `https://drive.google.com/drive/folders/${folderId}`
    : 'https://drive.google.com/drive/my-drive';
  if (cleanEmail) {
    return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(
      cleanEmail
    )}&continue=${encodeURIComponent(targetUrl)}`;
  }
  return targetUrl;
}

function buildSafeDriveSearchUrl(email) {
  const cleanEmail = (email || (state.googleAccount && state.googleAccount.email) || '').trim();
  const searchUrl = 'https://drive.google.com/drive/search?q=' + encodeURIComponent('Finance Tracker');
  if (cleanEmail) {
    return `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(
      cleanEmail
    )}&continue=${encodeURIComponent(searchUrl)}`;
  }
  return searchUrl;
}

/**
 * Membuka Folder Google Drive dengan memastikan folder benar-benar ada & memiliki file cadangan
 * Bebas error "File tidak ditemukan" / 404 meskipun diakses dari HP atau beda akun.
 */
async function handleOpenGoogleDriveFolder(event, preferredFolderId, email) {
  if (event) event.preventDefault();
  const cleanEmail = (email || (state.googleAccount && state.googleAccount.email) || '').trim();

  // Buka tab baru secara sinkron saat klik agar tidak diblokir oleh popup blocker browser HP
  const driveWin = window.open('about:blank', '_blank');
  if (driveWin && driveWin.document) {
    driveWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Membuka Google Drive - FinanceTracker</title>
        <style>
          body { margin: 0; background: #090d16; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; text-align: center; padding: 20px; box-sizing: border-box; }
          .box { padding: 28px 24px; border-radius: 18px; background: #111827; border: 1px solid rgba(16,185,129,0.3); max-width: 390px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
          .spinner { width: 36px; height: 36px; border: 3px solid rgba(16,185,129,0.2); border-top-color: #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          h3 { margin: 0 0 6px; font-size: 16px; color: #10b981; }
          p { margin: 0 0 16px; font-size: 12px; color: #94a3b8; line-height: 1.5; }
          .btn-open { display: inline-block; padding: 10px 18px; border-radius: 12px; background: #059669; color: #fff; text-decoration: none; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="spinner"></div>
          <h3>Menyiapkan Google Drive...</h3>
          <p id="statusMsg">Memverifikasi berkas cadangan untuk <b>${cleanEmail || 'Google Anda'}</b>...</p>
          <a id="fallbackBtn" class="btn-open" style="display:none;" href="#">Buka Langsung ke Google Drive</a>
        </div>
      </body>
      </html>
    `);
    driveWin.document.close();
  }

  const navigateDriveTab = (url) => {
    try {
      if (driveWin && !driveWin.closed) {
        if (driveWin.document) {
          const btn = driveWin.document.getElementById('fallbackBtn');
          if (btn) {
            btn.href = url;
            btn.style.display = 'inline-block';
          }
          const msg = driveWin.document.getElementById('statusMsg');
          if (msg) msg.textContent = 'Mengarahkan ke Google Drive...';
        }
        driveWin.location.href = url;
        return;
      }
    } catch (_) {}
    window.open(url, '_blank');
  };

  let activeToken =
    latestGoogleAccessToken || (state.googleAccount && state.googleAccount.accessToken) || '';
  const now = Date.now();
  if (
    activeToken &&
    state.googleAccount &&
    state.googleAccount.accessTokenExpiresAt &&
    now > state.googleAccount.accessTokenExpiresAt
  ) {
    activeToken = '';
  }

  const clientId = getGoogleClientId();
  const isHttpOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  // Jika token belum ada dan ada GIS, coba minta token secara otomatis
  if (
    !activeToken &&
    navigator.onLine !== false &&
    clientId &&
    isHttpOrigin &&
    window.google &&
    window.google.accounts &&
    window.google.accounts.oauth2
  ) {
    try {
      await new Promise((resolve) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPES,
          hint: cleanEmail,
          prompt: '',
          callback: (res) => {
            if (res && res.access_token) {
              latestGoogleAccessToken = res.access_token;
              activeToken = res.access_token;
              if (state.googleAccount) {
                state.googleAccount.accessToken = res.access_token;
                state.googleAccount.accessTokenExpiresAt = Date.now() + 3300 * 1000;
                saveGoogleAccountToStorage();
              }
            }
            resolve();
          },
          error_callback: () => resolve()
        });
        tokenClient.requestAccessToken({ prompt: '' });
      });
    } catch (e) {
      console.warn('Token acquisition error in handleOpenGoogleDriveFolder:', e);
    }
  }

  // Jika memiliki token aktif: cari atau buat folder di Google Drive
  if (activeToken && navigator.onLine !== false) {
    try {
      let verifiedFolderId = '';

      // 1. Cek apakah folder "Finance Tracker" sudah ada di Google Drive
      const q = `mimeType = 'application/vnd.google-apps.folder' and (name = 'Finance Tracker' or name = 'FinanceTracker - Cadangan Transaksi') and trashed = false`;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
        { headers: { Authorization: `Bearer ${activeToken}` } }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.files && searchData.files.length > 0) {
          verifiedFolderId = searchData.files[0].id;
        }
      }

      // 2. Jika belum ada folder atau folder baru, langsung buatkan folder "Finance Tracker" & cadangkan data transaksi
      if (!verifiedFolderId) {
        const todayISO = getTodayLocalISO();
        const fileName = `Cadangan_Transaksi_${todayISO}.json`;
        const payload = buildFullTransactionBackupPayload();
        const driveResult = await uploadBackupToRealGoogleDrive(
          activeToken,
          fileName,
          payload
        );
        if (driveResult && driveResult.mainFolderId) {
          verifiedFolderId = driveResult.mainFolderId;
        }
      }

      if (verifiedFolderId) {
        await ensureDriveFolderLinkPermission(activeToken, verifiedFolderId);
        if (state.googleAccount) {
          state.googleAccount.driveFolderId = verifiedFolderId;
          state.googleAccount.folderOwnerEmail = cleanEmail;
          state.googleAccount.driveFolderPublic = true;
          saveGoogleAccountToStorage();
        }

        let targetId = verifiedFolderId;
        if (preferredFolderId && preferredFolderId !== verifiedFolderId) {
          try {
            const checkSub = await fetch(
              `https://www.googleapis.com/drive/v3/files/${preferredFolderId}?fields=id,trashed`,
              { headers: { Authorization: `Bearer ${activeToken}` } }
            );
            if (checkSub.ok) {
              const subData = await checkSub.json();
              if (subData && subData.id && !subData.trashed) {
                targetId = preferredFolderId;
              }
            }
          } catch (_) {}
        }

        const directFolderUrl = buildSafeDriveFolderUrl(targetId, cleanEmail);
        navigateDriveTab(directFolderUrl);
        return;
      }
    } catch (err) {
      console.warn('Error in Drive folder verification:', err);
    }
  }

  // Jika folder ID yang disimpan sebelumnya valid dan publik:
  const storedFolderId = (
    preferredFolderId ||
    (state.googleAccount && state.googleAccount.driveFolderId) ||
    ''
  ).trim();

  if (storedFolderId && state.googleAccount && state.googleAccount.driveFolderPublic) {
    navigateDriveTab(buildSafeDriveFolderUrl(storedFolderId, cleanEmail));
    return;
  }

  // Fallback 100% bebas "File tidak ditemukan": Buka pencarian Google Drive 'FinanceTracker' via AccountChooser
  navigateDriveTab(buildSafeDriveSearchUrl(cleanEmail));
}

function renderSettingsSection() {
  applyThemeToDOM();
  populateSettingsPreferencesDropdowns();
  renderSecuritySettingsArea();

  // Pastikan driveFolderId hanya direset jika jelas milik email yang berbeda
  if (
    state.googleAccount &&
    state.googleAccount.driveFolderId &&
    state.googleAccount.folderOwnerEmail &&
    state.googleAccount.folderOwnerEmail.toLowerCase() !==
      (state.googleAccount.email || '').toLowerCase()
  ) {
    state.googleAccount.driveFolderId = '';
    state.googleAccount.driveFolderPublic = false;
    saveGoogleAccountToStorage();
  }

  // Jika driveFolderId kosong tetapi ada riwayat cadangan milik akun yang sedang login, pulihkan folderId-nya
  if (
    state.googleAccount &&
    state.googleAccount.email &&
    !state.googleAccount.driveFolderId &&
    Array.isArray(state.driveBackups)
  ) {
    const existingForAcc = state.driveBackups.find(
      (b) =>
        b.folderId &&
        (!b.email || b.email.toLowerCase() === state.googleAccount.email.toLowerCase())
    );
    if (existingForAcc && existingForAcc.folderId) {
      state.googleAccount.driveFolderId = existingForAcc.folderId;
      state.googleAccount.folderOwnerEmail = state.googleAccount.email;
      saveGoogleAccountToStorage();
    }
  }

  const accountAreaEl = document.getElementById('googleAccountCardArea');
  const authBadgeEl = document.getElementById('driveAuthBadge');
  const backupCountBadgeEl = document.getElementById('driveBackupCountBadge');
  const historyListEl = document.getElementById('driveBackupHistoryList');
  const autoSyncBannerEl = document.getElementById('autoSyncLiveStatusBanner');
  const autoSyncTextEl = document.getElementById('autoSyncLiveStatusText');

  const isConnected = Boolean(state.googleAccount && state.googleAccount.email);
  const isOnline = navigator.onLine !== false;
  const isPendingSync = hasPendingDriveSync();

  const visibleBackups = Array.isArray(state.driveBackups)
    ? isConnected
      ? state.driveBackups.filter(
          (b) =>
            !b.email ||
            b.email.toLowerCase() === state.googleAccount.email.toLowerCase()
        )
      : state.driveBackups
    : [];

  if (authBadgeEl) {
    if (isConnected) {
      if (!isOnline) {
        authBadgeEl.textContent = 'Menunggu Internet';
        authBadgeEl.className =
          'px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/35 shrink-0';
      } else {
        authBadgeEl.textContent = state.googleAccount.autoBackup
          ? t('drive_status_autosync')
          : t('drive_status_connected');
        authBadgeEl.className =
          'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 shrink-0';
      }
    } else {
      authBadgeEl.textContent = t('drive_status_unconnected');
      authBadgeEl.className =
        'px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700 shrink-0';
    }
  }

  if (autoSyncBannerEl && autoSyncTextEl) {
    if (!isConnected) {
      autoSyncBannerEl.className =
        'p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400';
      autoSyncTextEl.innerHTML =
        '<span class="font-bold text-slate-200">Cadangan Otomatis:</span> Login dengan akun Google di atas agar setiap transaksi otomatis dicadangkan ke Google Drive.';
    } else if (!isOnline) {
      autoSyncBannerEl.className =
        'p-3 rounded-xl bg-amber-950/25 border border-amber-500/35 flex items-start gap-2.5 text-[11px] text-amber-200';
      autoSyncTextEl.innerHTML =
        '<span class="font-bold text-amber-300">⏳ Mode Offline (Menunggu Internet):</span> Transaksi tersimpan aman di perangkat &amp; akan otomatis dicadangkan ke Google Drive begitu internet kembali terhubung.';
    } else if (isPendingSync) {
      autoSyncBannerEl.className =
        'p-3 rounded-xl bg-blue-950/25 border border-blue-500/35 flex items-start gap-2.5 text-[11px] text-blue-200';
      autoSyncTextEl.innerHTML =
        '<span class="font-bold text-blue-300">🔄 Sinkronisasi Otomatis:</span> Menyiapkan pencadangan transaksi terbaru ke folder Google Drive Anda...';
    } else {
      autoSyncBannerEl.className =
        'p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30 flex items-start gap-2.5 text-[11px] text-slate-300';
      autoSyncTextEl.innerHTML =
        '<span class="font-bold text-emerald-300">✅ Cadangan Otomatis Aktif:</span> Setiap transaksi otomatis dicadangkan ke folder Google Drive Anda saat terhubung ke internet.';
    }
  }

  if (backupCountBadgeEl) {
    const count = visibleBackups.length;
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

      const validFolderId =
        !state.googleAccount.folderOwnerEmail ||
        state.googleAccount.folderOwnerEmail.toLowerCase() ===
          state.googleAccount.email.toLowerCase()
          ? state.googleAccount.driveFolderId || ''
          : '';
      const safeAccEmail = (state.googleAccount.email || '').replace(/'/g, "\\'");

      accountAreaEl.innerHTML = `
        <div class="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2.5">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 text-slate-950 font-extrabold text-sm flex items-center justify-center shrink-0">
                ${initials || 'G'}
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs sm:text-sm font-bold text-white truncate">${state.googleAccount.name}</div>
                <div class="text-[11px] text-emerald-400 truncate">${state.googleAccount.email}</div>
                <div class="text-[10px] text-slate-400 truncate">${t('drive_detected_on')} ${state.googleAccount.deviceLabel || getDetectedDeviceName()}</div>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                onclick="handleOpenGoogleDriveFolder(event, '${validFolderId}', '${safeAccEmail}')"
                class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <i data-lucide="folder-open" class="w-3.5 h-3.5"></i>
                <span>Buka Folder Drive</span>
              </button>
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
    if (!visibleBackups || visibleBackups.length === 0) {
      historyListEl.innerHTML = `
        <div class="py-4 px-3 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center text-xs text-slate-400">
          ${t('drive_empty_backups')}
        </div>
      `;
    } else {
      historyListEl.innerHTML = visibleBackups
        .slice(0, 6)
        .map((b) => {
          const compactFolderLabel = 'Finance Tracker';
          const validItemFolderId =
            b.folderId ||
            (state.googleAccount &&
            (!state.googleAccount.folderOwnerEmail ||
              !b.email ||
              state.googleAccount.folderOwnerEmail.toLowerCase() === b.email.toLowerCase())
              ? state.googleAccount.driveFolderId || ''
              : '');
          const safeItemEmail = (b.email || (state.googleAccount && state.googleAccount.email) || '').replace(/'/g, "\\'");
          return `
          <div class="p-3 rounded-xl bg-slate-900/65 border border-slate-800/90 space-y-2">
            <!-- Baris Atas: Info File + Tombol Aksi (Tidak Bertabrakan) -->
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-start gap-2.5 min-w-0 flex-1 overflow-hidden">
                <div class="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <i data-lucide="folder-kanban" class="w-4 h-4"></i>
                </div>
                <div class="min-w-0 flex-1 overflow-hidden">
                  <button
                    type="button"
                    onclick="handleOpenGoogleDriveFolder(event, '${validItemFolderId}', '${safeItemEmail}')"
                    class="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors cursor-pointer"
                  >
                    <i data-lucide="folder" class="w-3 h-3 shrink-0 text-blue-400"></i>
                    <span class="truncate">${compactFolderLabel}</span>
                  </button>
                  <div class="text-xs font-bold text-white truncate mt-1" title="${b.fileName}">${b.fileName}</div>
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onclick="handleOpenGoogleDriveFolder(event, '${validItemFolderId}', '${safeItemEmail}')"
                  class="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
                  title="Buka Folder di Google Drive"
                >
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </button>
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

            <!-- Baris Bawah: Statistik, Email Akun & Waktu Cadangan -->
            <div class="pt-1.5 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-slate-400">
              <div class="flex items-center gap-1.5 min-w-0 truncate">
                <span class="font-semibold text-slate-300">${b.txCount || 0} ${t('tx_count_suffix')} • ${b.walletCount || 0} ${t('nav_wallets')}</span>
                <span>•</span>
                <span class="text-emerald-400 font-medium truncate">${b.email || ''}</span>
              </div>
              <span class="text-slate-500 font-mono-num shrink-0">${b.createdAt || ''}</span>
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
        } else if (tokenResponse && tokenResponse.error) {
          console.error('Google OAuth token error:', tokenResponse);
          if (tokenResponse.error === 'access_denied') {
            showToast('Akses Google ditolak. Pastikan aplikasi berstatus "In production" di Google Cloud Console & izinkan akses di HP.');
          } else {
            showToast('Gagal terhubung ke Google: ' + (tokenResponse.error_description || tokenResponse.error));
          }
        }
      },
      error_callback: (err) => {
        console.warn('Google OAuth popup closed or error:', err);
        if (err && err.type === 'popup_blocked') {
          showToast('Pop-up Google diblokir browser HP Anda. Silakan izinkan pop-up di pengaturan browser.');
        } else if (err && err.type === 'access_denied') {
          showToast('Akses ditolak oleh Google. Buka aplikasi langsung di Chrome/Safari (bukan dari browser internal WhatsApp).');
        }
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

    const defaultName = profile.name || profile.given_name || (profile.email ? profile.email.split('@')[0] : 'User');
    const email = profile.email || '';
    const picture = profile.picture || '';
    const deviceLabel = getDetectedDeviceName();

    const isSameOwner =
      state.googleAccount &&
      state.googleAccount.folderOwnerEmail &&
      state.googleAccount.folderOwnerEmail.toLowerCase() === email.toLowerCase();

    // Langsung simpan akun Google & Token Drive begitu OAuth berhasil agar folder Drive langsung terbuat otomatis
    state.googleAccount = {
      name: defaultName,
      email,
      picture,
      accessToken: accessToken || '',
      accessTokenExpiresAt: Date.now() + 3300 * 1000,
      driveFolderId: isSameOwner ? state.googleAccount.driveFolderId || '' : '',
      folderOwnerEmail: isSameOwner ? email : '',
      deviceLabel,
      autoBackup: true,
      connectedAt: new Date().toLocaleString(getActiveLocale())
    };

    const existsIdx = state.deviceGoogleAccounts.findIndex(
      (a) => a.email && a.email.toLowerCase() === email.toLowerCase()
    );
    if (existsIdx === -1) {
      state.deviceGoogleAccounts.unshift({ name: defaultName, email, picture, deviceLabel });
    } else {
      state.deviceGoogleAccounts[existsIdx] = { name: defaultName, email, picture, deviceLabel };
    }

    saveGoogleAccountToStorage();
    saveDeviceGoogleAccountsToStorage();
    setPendingDriveSync(true);
    renderSettingsSection();
    if (window.lucide) window.lucide.createIcons();

    // Langsung buat folder "Finance Tracker" & unggah cadangan otomatis di Google Drive begitu OAuth selesai
    (async () => {
      if (state.transactions.length === 0) {
        const driveSnapshot = await fetchLatestBackupFromRealGoogleDrive(accessToken);
        if (driveSnapshot && Array.isArray(driveSnapshot.transactions) && driveSnapshot.transactions.length > 0) {
          restoreFromSnapshotObject(driveSnapshot);
        }
      }
      const todayISO = getTodayLocalISO();
      const fileName = `Cadangan_Transaksi_${todayISO}.json`;
      const payload = buildFullTransactionBackupPayload();
      const uploadRes = await uploadBackupToRealGoogleDrive(accessToken, fileName, payload);
      if (uploadRes && uploadRes.mainFolderId && state.googleAccount) {
        state.googleAccount.driveFolderId = uploadRes.mainFolderId;
        state.googleAccount.folderOwnerEmail = state.googleAccount.email;
        state.googleAccount.driveFolderPublic = true;
        saveGoogleAccountToStorage();
        setPendingDriveSync(false);
      }
      await syncDriveBackupHistoryFromGoogle(accessToken);
      renderSettingsSection();
      if (window.lucide) window.lucide.createIcons();
    })();

    // Tampilkan Tahap 3: Konfirmasi Nama / Pop-Up Selamat Datang
    googleOAuthFlowState = {
      step: 3,
      selectedEmail: email,
      selectedDefaultName: defaultName,
      selectedPicture: picture,
      enteredName: defaultName,
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

  const isSameOwner =
    state.googleAccount &&
    state.googleAccount.folderOwnerEmail &&
    state.googleAccount.folderOwnerEmail.toLowerCase() === email.toLowerCase();

  // Simpan akun Google yang telah terhubung beserta nama yang dimasukkan
  state.googleAccount = {
    name: enteredName,
    email,
    picture,
    accessToken: latestGoogleAccessToken || (state.googleAccount && state.googleAccount.accessToken) || '',
    accessTokenExpiresAt: latestGoogleAccessToken ? Date.now() + 3300 * 1000 : (state.googleAccount && state.googleAccount.accessTokenExpiresAt) || 0,
    driveFolderId: isSameOwner ? state.googleAccount.driveFolderId || '' : '',
    folderOwnerEmail: isSameOwner ? email : '',
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
    if (driveSnapshot && Array.isArray(driveSnapshot.transactions) && driveSnapshot.transactions.length > 0) {
      pendingAutoBackupAfterLogin = false;
      restoreFromSnapshotObject(driveSnapshot);
      await syncDriveBackupHistoryFromGoogle(latestGoogleAccessToken);
      showToast(`${t('google_welcome_prefix')}, ${name}! Data berhasil dipulihkan dari Google Drive.`);
      return;
    }
  }

  // Cek juga cadangan lokal browser
  const cloudMap = getCloudSnapshotsMap();
  const existingSnapshot = email ? cloudMap[email.toLowerCase()] : null;
  if (
    existingSnapshot &&
    state.transactions.length === 0 &&
    Array.isArray(existingSnapshot.transactions) &&
    existingSnapshot.transactions.length > 0
  ) {
    pendingAutoBackupAfterLogin = false;
    restoreFromSnapshotObject(existingSnapshot);
    showToast(`${t('google_welcome_prefix')}, ${name}! Data dipulihkan.`);
    return;
  }

  // Sinkronkan riwayat Google Drive jika ada token
  if (latestGoogleAccessToken) {
    await syncDriveBackupHistoryFromGoogle(latestGoogleAccessToken);
  }

  // Langsung buat folder & cadangan pertama di Google Drive begitu selesai login
  pendingAutoBackupAfterLogin = false;
  showToast(`${t('google_welcome_prefix')}, ${name}!`);
  runBackgroundDriveBackup(false);
}

const DRIVE_MAIN_FOLDER_NAME = 'Finance Tracker';
const driveFolderPermCache = new Set();

/**
 * Memberikan izin baca via tautan (Anyone with the link) pada folder cadangan Google Drive
 * agar saat folder dibuka di browser/HP tidak pernah muncul error 404 / File Tidak Ditemukan.
 */
async function ensureDriveFolderLinkPermission(accessToken, folderId) {
  if (!accessToken || !folderId) return false;
  if (driveFolderPermCache.has(folderId)) return true;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone'
        })
      }
    );
    if (res.ok) {
      driveFolderPermCache.add(folderId);
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Error ensureDriveFolderLinkPermission:', e);
    return false;
  }
}

/**
 * Mencari atau membuat folder "Finance Tracker" di root Google Drive.
 */
async function getOrCreateGoogleDriveFolder(accessToken, folderName = DRIVE_MAIN_FOLDER_NAME) {
  if (!accessToken) return null;
  try {
    // 1. Cari folder "Finance Tracker"
    const escapedName = folderName.replace(/'/g, "\\'");
    let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`;

    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (searchRes.status === 401) return 'TOKEN_EXPIRED';
    if (searchRes.status === 403) {
      const errData = await searchRes.json().catch(() => ({}));
      const errMsg = (errData && errData.error && errData.error.message) || '';
      if (errMsg.includes('has not been used in project') || errMsg.includes('is disabled')) {
        return 'DRIVE_API_DISABLED';
      }
      return 'DRIVE_PERMISSION_DENIED';
    }

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const existingId = searchData.files[0].id;
        await ensureDriveFolderLinkPermission(accessToken, existingId);
        return existingId;
      }
    }

    // 2. Cek apakah ada folder lama "FinanceTracker - Cadangan Transaksi", jika ada rename ke "Finance Tracker"
    const oldQ = `mimeType = 'application/vnd.google-apps.folder' and name = 'FinanceTracker - Cadangan Transaksi' and trashed = false`;
    const oldSearchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(oldQ)}&fields=files(id,name)&pageSize=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (oldSearchRes.ok) {
      const oldData = await oldSearchRes.json();
      if (oldData.files && oldData.files.length > 0) {
        const oldFolderId = oldData.files[0].id;
        await fetch(`https://www.googleapis.com/drive/v3/files/${oldFolderId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: JSON.stringify({ name: 'Finance Tracker' })
        });
        await ensureDriveFolderLinkPermission(accessToken, oldFolderId);
        return oldFolderId;
      }
    }

    // 3. Jika belum ada folder sama sekali, buat folder baru "Finance Tracker" di root My Drive
    const folderMetadata = {
      name: 'Finance Tracker',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Folder Otomatis Cadangan Transaksi Finance Tracker'
    };

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify(folderMetadata)
    });

    if (createRes.status === 401) return 'TOKEN_EXPIRED';
    if (createRes.status === 403) {
      const errData = await createRes.json().catch(() => ({}));
      const errMsg = (errData && errData.error && errData.error.message) || '';
      if (errMsg.includes('has not been used in project') || errMsg.includes('is disabled')) {
        return 'DRIVE_API_DISABLED';
      }
      return 'DRIVE_PERMISSION_DENIED';
    }

    if (!createRes.ok) return null;
    const createdFolder = await createRes.json();
    if (createdFolder && createdFolder.id) {
      await ensureDriveFolderLinkPermission(accessToken, createdFolder.id);
      return createdFolder.id;
    }
    return null;
  } catch (e) {
    console.warn('Error getOrCreateGoogleDriveFolder:', e);
    return null;
  }
}

/**
 * Menyimpan atau memperbarui file JSON di dalam folder Google Drive tertentu
 * Menggunakan media upload yang 100% andal di seluruh browser & perangkat HP.
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

    const jsonContent = JSON.stringify(payloadObj, null, 2);

    // Jika file sudah ada, perbarui isinya langsung via uploadType=media
    if (existingFileId) {
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: jsonContent
        }
      );
      if (updateRes.ok) {
        return await updateRes.json();
      }
    }

    // Jika file belum ada, buat file baru di dalam folder "Finance Tracker"
    const createMetaRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({
        name: fileName,
        mimeType: 'application/json',
        description: descriptionText || 'Finance Tracker Automatic Backup',
        parents: folderId ? [folderId] : []
      })
    });

    if (!createMetaRes.ok) {
      const errTxt = await createMetaRes.text().catch(() => '');
      console.warn('Drive create metadata failed:', createMetaRes.status, errTxt);
      return null;
    }

    const createdMeta = await createMetaRes.json();
    const newFileId = createdMeta.id;

    // Unggah isi konten JSON ke file baru tersebut
    const uploadRes = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${newFileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: jsonContent
      }
    );

    if (!uploadRes.ok) {
      const errTxt = await uploadRes.text().catch(() => '');
      console.warn('Drive upload content failed:', uploadRes.status, errTxt);
      return createdMeta;
    }

    return await uploadRes.json();
  } catch (e) {
    console.warn('Error upsertJsonFileInDriveFolder:', e);
    return null;
  }
}

/**
 * Mengunggah cadangan langsung ke dalam folder "Finance Tracker":
 * 📁 Finance Tracker
 *    ├── 📄 Cadangan_Transaksi_YYYY-MM-DD.json
 *    └── 📄 FinanceTracker_Master_Sync.json
 */
async function uploadBackupToRealGoogleDrive(accessToken, fileName, payloadObj) {
  if (!accessToken) return null;
  try {
    // 1. Pastikan Folder "Finance Tracker" ada di Google Drive
    const mainFolderId = await getOrCreateGoogleDriveFolder(accessToken, DRIVE_MAIN_FOLDER_NAME);

    if (
      mainFolderId === 'TOKEN_EXPIRED' ||
      mainFolderId === 'DRIVE_API_DISABLED' ||
      mainFolderId === 'DRIVE_PERMISSION_DENIED'
    ) {
      return { error: mainFolderId };
    }

    if (!mainFolderId) return null;

    // 2. Simpan file cadangan harian langsung di dalam folder "Finance Tracker"
    const dailyFile = await upsertJsonFileInDriveFolder(
      accessToken,
      mainFolderId,
      fileName,
      payloadObj,
      'Cadangan Transaksi Finance Tracker'
    );

    // 3. Simpan juga file Master Sync di dalam folder "Finance Tracker" untuk pemulihan instan
    let masterFile = null;
    const hasTransactions = Array.isArray(payloadObj.transactions) && payloadObj.transactions.length > 0;
    if (hasTransactions) {
      masterFile = await upsertJsonFileInDriveFolder(
        accessToken,
        mainFolderId,
        'FinanceTracker_Master_Sync.json',
        payloadObj,
        'Master Sync Terbaru Finance Tracker (Digunakan saat ganti perangkat)'
      );
    }

    return {
      dailyFile: dailyFile || masterFile,
      mainFolderId: mainFolderId,
      monthFolderId: mainFolderId
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
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=5&fields=files(id,name,modifiedTime,parents)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!listRes.ok) return null;
    const listData = await listRes.json();
    if (!listData.files || listData.files.length === 0) return null;

    let bestSnapshot = null;
    for (const file of listData.files) {
      try {
        const fileRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        if (fileRes.ok) {
          const snapshot = await fileRes.json();
          if (snapshot && Array.isArray(snapshot.transactions) && snapshot.transactions.length > 0) {
            return snapshot;
          }
          if (!bestSnapshot && snapshot) {
            bestSnapshot = snapshot;
          }
        }
      } catch (_) {}
    }
    return bestSnapshot;
  } catch (e) {
    console.warn('Real Google Drive restore error:', e);
    return null;
  }
}

async function syncDriveBackupHistoryFromGoogle(accessToken) {
  if (!accessToken || !state.googleAccount || !state.googleAccount.email) return;
  try {
    const query = encodeURIComponent(
      "(name contains 'Cadangan_Transaksi_' or name = 'FinanceTracker_Master_Sync.json') and trashed = false"
    );
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=10&fields=files(id,name,modifiedTime,parents)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    if (!listRes.ok) return;
    const data = await listRes.json();
    if (!data.files || data.files.length === 0) return;

    const email = state.googleAccount.email;
    const fetchedEntries = data.files.map((f) => {
      const parentFolderId = Array.isArray(f.parents) && f.parents.length > 0 ? f.parents[0] : '';
      const modDate = f.modifiedTime ? new Date(f.modifiedTime) : new Date();
      const createdAt = modDate.toLocaleString(getActiveLocale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return {
        id: 'drive_' + f.id,
        driveFileId: f.id,
        folderId: parentFolderId || state.googleAccount.driveFolderId || '',
        folderPath: DRIVE_MAIN_FOLDER_NAME,
        driveFolderUrl: buildSafeDriveFolderUrl(parentFolderId || state.googleAccount.driveFolderId, email),
        fileName: f.name,
        email: email,
        createdAt: createdAt,
        txCount: state.transactions.length,
        walletCount: state.wallets.length
      };
    });

    if (fetchedEntries.length > 0) {
      const nonDriveEntries = state.driveBackups.filter(
        (b) => !b.email || b.email.toLowerCase() !== email.toLowerCase()
      );
      state.driveBackups = [...fetchedEntries, ...nonDriveEntries];
      saveDriveBackupsToStorage();
      renderSettingsSection();
      if (window.lucide) window.lucide.createIcons();
    }
  } catch (e) {
    console.warn('Error syncDriveBackupHistoryFromGoogle:', e);
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
  setPendingDriveSync(false);
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
    version: 7,
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
    wallets: state.wallets,
    settings: state.settings,
    evaluations: state.evaluations
  };
}

/**
 * Menjalankan sinkronisasi cadangan transaksi ke folder Google Drive di belakang layar (Background Sync)
 * Jika sedang offline, maka menandai antrean (pending sync) dan otomatis mencadangkan saat internet kembali menyala.
 */
function runBackgroundDriveBackup(isSilentAuto = false) {
  if (!state.googleAccount || !state.googleAccount.email) return;

  // Lindungi agar data lokal kosong (0 transaksi) tidak menimpa cadangan cloud jika ada
  if (state.transactions.length === 0) {
    const cloudMap = getCloudSnapshotsMap();
    const existing = cloudMap[state.googleAccount.email.toLowerCase()];
    if (existing && Array.isArray(existing.transactions) && existing.transactions.length > 0) {
      console.log('Skipping backup: Local transactions empty but cloud snapshot exists.');
      return;
    }
  }

  const payload = buildFullTransactionBackupPayload();
  saveCloudSnapshotForEmail(state.googleAccount.email, payload);

  // Jika sedang tidak terhubung ke internet (Offline), simpan antrean agar otomatis dicadangkan saat kembali Online
  if (navigator.onLine === false) {
    setPendingDriveSync(true);
    renderSettingsSection();
    if (window.lucide) window.lucide.createIcons();
    if (!isSilentAuto) {
      showToast('Perangkat sedang offline. Cadangan akan otomatis diunggah ke Google Drive saat internet terhubung.');
    }
    return;
  }

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
  }, 350);

  setTimeout(async () => {
    const todayISO = getTodayLocalISO(); // YYYY-MM-DD
    const folderPath = DRIVE_MAIN_FOLDER_NAME;
    const fileName = `Cadangan_Transaksi_${todayISO}.json`;

    const activeToken =
      latestGoogleAccessToken || (state.googleAccount && state.googleAccount.accessToken) || '';
    let driveResult = null;
    if (activeToken) {
      driveResult = await uploadBackupToRealGoogleDrive(activeToken, fileName, payload);

      if (driveResult && driveResult.error === 'TOKEN_EXPIRED') {
        latestGoogleAccessToken = '';
        if (state.googleAccount) {
          state.googleAccount.accessToken = '';
          state.googleAccount.accessTokenExpiresAt = 0;
          saveGoogleAccountToStorage();
        }
        setPendingDriveSync(true);
        state.isSyncingBackground = false;
        if (syncBox) syncBox.classList.add('hidden');
        renderSettingsSection();
        return;
      }

      if (driveResult && driveResult.error === 'DRIVE_API_DISABLED') {
        setPendingDriveSync(true);
        state.isSyncingBackground = false;
        if (syncBox) syncBox.classList.add('hidden');
        showToast(
          'Google Drive API belum diaktifkan di Google Cloud Console Anda (APIs & Services -> Enable Google Drive API).',
          'error'
        );
        return;
      }

      if (driveResult && driveResult.error === 'DRIVE_PERMISSION_DENIED') {
        setPendingDriveSync(true);
        state.isSyncingBackground = false;
        if (syncBox) syncBox.classList.add('hidden');
        showToast(
          'Izin akses Google Drive belum dicentang saat login. Silakan klik Ganti Akun lalu centang kotak izin Google Drive.',
          'error'
        );
        return;
      }

      if (driveResult && driveResult.mainFolderId && state.googleAccount) {
        state.googleAccount.driveFolderId = driveResult.mainFolderId;
        state.googleAccount.folderOwnerEmail = state.googleAccount.email;
        state.googleAccount.driveFolderPublic = true;
        saveGoogleAccountToStorage();
      }
      if (driveResult && driveResult.dailyFile) {
        setPendingDriveSync(false);
      }
    } else {
      setPendingDriveSync(true);
    }

    const nowFormatted = new Date().toLocaleString(getActiveLocale(), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const resolvedFolderId =
      driveResult && (driveResult.monthFolderId || driveResult.mainFolderId)
        ? driveResult.monthFolderId || driveResult.mainFolderId
        : state.googleAccount &&
          state.googleAccount.folderOwnerEmail &&
          state.googleAccount.folderOwnerEmail.toLowerCase() ===
            state.googleAccount.email.toLowerCase()
        ? state.googleAccount.driveFolderId
        : '';

    const driveFolderUrl = buildSafeDriveFolderUrl(resolvedFolderId, state.googleAccount.email);

    const newEntry = {
      id: 'bk_' + Date.now(),
      folderId: resolvedFolderId,
      folderPath,
      driveFolderUrl,
      fileName,
      email: state.googleAccount.email,
      createdAt: nowFormatted,
      txCount: state.transactions.length,
      walletCount: state.wallets.length,
      payload
    };

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
    }, 500);
  }, 650);
}

let autoBackupDebounceTimer = null;
function triggerSilentAutoBackupIfConnected() {
  if (!state.googleAccount || !state.googleAccount.email) return;
  if (navigator.onLine === false) {
    setPendingDriveSync(true);
    renderSettingsSection();
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  if (autoBackupDebounceTimer) clearTimeout(autoBackupDebounceTimer);
  autoBackupDebounceTimer = setTimeout(() => {
    runBackgroundDriveBackup(true);
  }, 350);
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
  if (snapshot.settings && typeof snapshot.settings === 'object') {
    state.settings = { ...state.settings, ...snapshot.settings };
    saveSettingsToStorage();
  }
  if (Array.isArray(snapshot.evaluations)) {
    state.evaluations = snapshot.evaluations;
    saveEvaluationsToStorage();
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

async function handleRestoreTransactionsFromDrive() {
  if (!state.googleAccount || !state.googleAccount.email) {
    showToast(t('modal_google_sub'), 'error');
    openGoogleAuthModal();
    return;
  }

  showToast('Memeriksa cadangan di Google Drive...', 'info');

  let activeToken =
    latestGoogleAccessToken || (state.googleAccount && state.googleAccount.accessToken) || '';
  const now = Date.now();
  const tokenExpired =
    !activeToken ||
    Boolean(state.googleAccount.accessTokenExpiresAt && now > state.googleAccount.accessTokenExpiresAt);

  const clientId = getGoogleClientId();
  const isHttpOrigin = window.location.protocol === 'http:' || window.location.protocol === 'https:';

  // Jika token belum ada/expired dan GIS tersedia, minta token baru
  if (
    tokenExpired &&
    clientId &&
    isHttpOrigin &&
    window.google &&
    window.google.accounts &&
    window.google.accounts.oauth2
  ) {
    try {
      await new Promise((resolve) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_DRIVE_SCOPES,
          hint: state.googleAccount.email,
          prompt: '',
          callback: (res) => {
            if (res && res.access_token) {
              latestGoogleAccessToken = res.access_token;
              activeToken = res.access_token;
              state.googleAccount.accessToken = res.access_token;
              state.googleAccount.accessTokenExpiresAt = Date.now() + 3300 * 1000;
              saveGoogleAccountToStorage();
            }
            resolve();
          },
          error_callback: () => resolve()
        });
        tokenClient.requestAccessToken({ prompt: '' });
      });
    } catch (e) {
      console.warn('Silent token error in restore:', e);
    }
  }

  // 1. Coba ambil dari Google Drive API langsung jika token tersedia
  if (activeToken && navigator.onLine !== false) {
    const driveSnapshot = await fetchLatestBackupFromRealGoogleDrive(activeToken);
    if (driveSnapshot && (Array.isArray(driveSnapshot.transactions) || Array.isArray(driveSnapshot.wallets))) {
      restoreFromSnapshotObject(driveSnapshot);
      await syncDriveBackupHistoryFromGoogle(activeToken);
      return;
    }
  }

  // 2. Cek cadangan lokal di browser (cloudMap)
  const cloudMap = getCloudSnapshotsMap();
  const snapshot = cloudMap[state.googleAccount.email.toLowerCase()];
  if (snapshot && (Array.isArray(snapshot.transactions) || Array.isArray(snapshot.wallets))) {
    restoreFromSnapshotObject(snapshot);
    return;
  }

  // 3. Cek riwayat lokal state.driveBackups
  const latestBackup = state.driveBackups.find(
    (b) => b.email && b.email.toLowerCase() === state.googleAccount.email.toLowerCase() && b.payload
  );
  if (latestBackup && latestBackup.payload) {
    restoreFromSnapshotObject(latestBackup.payload);
    return;
  }

  // 4. Jika benar-benar belum ada berkas cadangan sama sekali
  showToast(
    `Belum ada berkas cadangan transaksi di Google Drive untuk ${state.googleAccount.email}.`,
    'error'
  );
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

// ================= WIDGET: SAVING VS EXPENSE GAUGE =================

function renderSavingVsExpenseGauge(metrics) {
  const totalSavings = metrics.totalSavings || 0;
  const totalExpense = metrics.totalExpense || 0;

  let ratio = 0;
  if (totalExpense > 0) {
    ratio = Math.round((totalSavings / totalExpense) * 100);
  } else if (totalSavings > 0) {
    ratio = 100;
  }

  const clampedCircle = Math.min(100, Math.max(0, ratio));
  const circleEl = document.getElementById('gaugeSavingCircle');
  if (circleEl) {
    circleEl.setAttribute('stroke-dasharray', `${clampedCircle}, 100`);
    if (ratio >= 50) {
      circleEl.setAttribute('class', 'gauge-ring-circle text-teal-400');
    } else if (ratio >= 20) {
      circleEl.setAttribute('class', 'gauge-ring-circle text-emerald-400');
    } else {
      circleEl.setAttribute('class', 'gauge-ring-circle text-amber-400');
    }
  }

  const pctEl = document.getElementById('gaugeSavingPct');
  if (pctEl) pctEl.textContent = `${ratio}%`;

  const totalSavEl = document.getElementById('gaugeTotalSavings');
  if (totalSavEl) totalSavEl.textContent = formatRp(totalSavings);

  const totalExpEl = document.getElementById('gaugeTotalExpense');
  if (totalExpEl) totalExpEl.textContent = formatRp(totalExpense);

  const statusTextEl = document.getElementById('gaugeStatusText');
  const badgeStatusEl = document.getElementById('gaugeBadgeStatus');
  const adviceEl = document.getElementById('gaugeAdviceText');

  if (ratio >= 50) {
    if (statusTextEl) statusTextEl.textContent = t('gauge_healthy') || 'Sangat Sehat';
    if (badgeStatusEl) badgeStatusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 w-fit';
    if (adviceEl) adviceEl.textContent = t('gauge_advice_healthy') || 'Luar biasa! Rasio tabungan Anda berada di atas 50%, disiplin keuangan sangat prima.';
  } else if (ratio >= 20) {
    if (statusTextEl) statusTextEl.textContent = t('gauge_good') || 'Cukup Baik';
    if (badgeStatusEl) badgeStatusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 w-fit';
    if (adviceEl) adviceEl.textContent = t('gauge_advice_standard') || 'Rasio tabungan ideal minimal 20% dari total penghasilan/pengeluaran Anda.';
  } else {
    if (statusTextEl) statusTextEl.textContent = t('gauge_warning') || 'Perlu Perhatian';
    if (badgeStatusEl) badgeStatusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 w-fit';
    if (adviceEl) adviceEl.textContent = t('gauge_advice_low') || 'Tingkatkan alokasi tabungan dan pangkas pos pengeluaran sekunder (Wants).';
  }
}

// ================= FORM SIKLUS GAJI & PENGHASILAN BULANAN =================

function renderPaydayConfigUI() {
  const config = (state.settings && state.settings.paydayConfig)
    ? state.settings.paydayConfig
    : { dayOfMonth: 25, salaryAmount: 5000000, lastUpdated: null };

  const dayInput = document.getElementById('paydayDateInput');
  const amountInput = document.getElementById('paydayAmountInput');
  const lockedNotice = document.getElementById('paydayLockedNotice');
  const badgeEl = document.getElementById('salaryCycleStatusBadge');
  const badgeText = document.getElementById('salaryCycleStatusText');
  const submitBtn = document.getElementById('btnSavePaydayConfig');
  const submitText = document.getElementById('btnSavePaydayText');
  const cycleLabel = document.getElementById('paydayCurrentCycleLabel');

  if (dayInput && !dayInput.matches(':focus')) dayInput.value = config.dayOfMonth || 25;
  if (amountInput && !amountInput.matches(':focus')) amountInput.value = formatNumberWithDots(config.salaryAmount || 5000000);

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastUpdated = config.lastUpdated || localStorage.getItem('lastSalaryConfigUpdate');
  const isLocked = lastUpdated === currentYM;

  if (cycleLabel) {
    const cycleRange = getCurrentCycleDateRange(now.getFullYear(), now.getMonth());
    cycleLabel.textContent = `Siklus Periode: ${cycleRange.label}`;
  }

  if (isLocked) {
    if (dayInput) dayInput.disabled = true;
    if (amountInput) amountInput.disabled = true;
    if (lockedNotice) lockedNotice.classList.remove('hidden');
    if (badgeEl) {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 w-fit';
    }
    if (badgeText) badgeText.textContent = t('salary_cycle_locked') || 'Terkunci';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.className = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-80';
    }
    if (submitText) submitText.textContent = t('salary_locked_btn') || 'Terkunci Bulan Ini';
    const icon = document.getElementById('btnSavePaydayIcon');
    if (icon) icon.setAttribute('data-lucide', 'lock');
  } else {
    if (dayInput) dayInput.disabled = false;
    if (amountInput) amountInput.disabled = false;
    if (lockedNotice) lockedNotice.classList.add('hidden');
    if (badgeEl) {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 w-fit';
    }
    if (badgeText) badgeText.textContent = t('salary_cycle_unlocked') || 'Dapat Diubah';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.className = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all focus:outline-none';
    }
    if (submitText) submitText.textContent = t('salary_save_btn') || 'Simpan Siklus Gaji';
    const icon = document.getElementById('btnSavePaydayIcon');
    if (icon) icon.setAttribute('data-lucide', 'save');
  }
}

function handlePaydayConfigSubmit(e) {
  e.preventDefault();
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const config = state.settings.paydayConfig;
  const lastUpdated = config.lastUpdated || localStorage.getItem('lastSalaryConfigUpdate');

  if (lastUpdated === currentYM) {
    showToast(t('salary_locked_notice'), 'warning');
    return;
  }

  const dayInput = document.getElementById('paydayDateInput');
  const amountInput = document.getElementById('paydayAmountInput');
  const day = parseInt(dayInput.value, 10);
  const amount = parseFormattedNumber(amountInput.value);

  if (!day || day < 1 || day > 31) {
    showToast('Tanggal gajian harus antara 1 sampai 31.', 'error');
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Nominal gaji harus lebih dari 0.', 'error');
    return;
  }

  state.settings.paydayConfig = {
    dayOfMonth: day,
    salaryAmount: amount,
    lastUpdated: currentYM
  };
  localStorage.setItem('lastSalaryConfigUpdate', currentYM);
  saveSettingsToStorage();
  renderPaydayConfigUI();
  refreshDashboard();
  showToast(`${t('salary_cycle_title')} berhasil disimpan!`, 'success');
}

// ================= DYNAMIC QUOTES CARD =================

function getActiveQuotesList() {
  if (state.quotes && state.quotes.length > 0) return state.quotes;
  if (typeof defaultFinancialData !== 'undefined' && defaultFinancialData.quotes && defaultFinancialData.quotes.length > 0) return defaultFinancialData.quotes;
  if (typeof billionaireQuotes !== 'undefined' && billionaireQuotes.length > 0) return billionaireQuotes;
  return [];
}

let quotesIntervalTimer = null;

function renderQuotesCard() {
  const quotes = getActiveQuotesList();
  if (!quotes || quotes.length === 0) return;
  const quote = quotes[state.currentQuoteIndex % quotes.length];

  const textEls = document.querySelectorAll('.quote-text-el, #quoteText');
  const authorEls = document.querySelectorAll('.quote-author-el, #quoteAuthor');
  const wrappers = document.querySelectorAll('.quote-wrapper-el, #quoteContentWrapper');

  wrappers.forEach((wrapper) => {
    wrapper.classList.remove('quote-fade-in');
    void wrapper.offsetWidth;
    wrapper.classList.add('quote-fade-in');
  });

  textEls.forEach((el) => {
    el.textContent = `"${quote.text}"`;
  });
  authorEls.forEach((el) => {
    el.textContent = `— ${quote.author}`;
  });
}

function initQuotesRotation() {
  const quotes = getActiveQuotesList();
  if (!quotes || quotes.length === 0) return;
  state.currentQuoteIndex = Math.floor(Math.random() * quotes.length);
  renderQuotesCard();

  if (quotesIntervalTimer) {
    clearInterval(quotesIntervalTimer);
  }
  // Auto-rotasi mengalir otomatis setiap 12 detik
  quotesIntervalTimer = setInterval(() => {
    if (document.hidden) return;
    nextQuote();
  }, 12000);
}

function nextQuote() {
  const quotes = getActiveQuotesList();
  if (!quotes || quotes.length === 0) return;
  state.currentQuoteIndex = (state.currentQuoteIndex + 1) % quotes.length;
  renderQuotesCard();
}

if (typeof window !== 'undefined') {
  window.nextQuote = nextQuote;
  window.renderQuotesCard = renderQuotesCard;
}

// ================= FILTER KUADRAN EISENHOWER & NEEDS/WANTS =================

function setIncomeQuadrantFilter(q) {
  state.incomeQuadrantFilter = q;
  document.querySelectorAll('#incomeQuadrantFilterGroup button').forEach((btn) => {
    const bq = btn.getAttribute('data-iq-filter');
    if (bq == q) {
      btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 transition-all flex items-center justify-center';
    } else {
      btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800 transition-all flex items-center justify-center';
    }
  });
  renderBreakdownTables(calculateSummaryMetrics(getFilteredTransactions()));
  if (window.lucide) window.lucide.createIcons();
}

function setExpenseQuadrantFilter(q) {
  state.expenseQuadrantFilter = q;
  document.querySelectorAll('#expenseQuadrantFilterGroup button').forEach((btn) => {
    const bq = btn.getAttribute('data-eq-filter');
    if (bq == q) {
      btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-500 text-white transition-all flex items-center justify-center';
    } else {
      btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800 transition-all flex items-center justify-center';
    }
  });
  renderBreakdownTables(calculateSummaryMetrics(getFilteredTransactions()));
  if (window.lucide) window.lucide.createIcons();
}

function setExpenseTypeFilter(type) {
  state.expenseTypeFilter = type;
  document.querySelectorAll('#expenseTypeFilterGroup button').forEach((btn) => {
    const bt = btn.getAttribute('data-et-filter');
    if (bt === type) {
      btn.className = 'px-3 py-1 rounded-xl text-xs font-bold bg-rose-500 text-white transition-all';
    } else {
      btn.className = 'px-3 py-1 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800 transition-all';
    }
  });
  renderBreakdownTables(calculateSummaryMetrics(getFilteredTransactions()));
  if (window.lucide) window.lucide.createIcons();
}

function setSavingsQuadrantFilter(q) {
  state.savingsQuadrantFilter = q;
  document.querySelectorAll('#savingsQuadrantFilterGroup button').forEach((btn) => {
    const bq = btn.getAttribute('data-sq-filter');
    if (bq == q) {
      btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-500 text-white transition-all flex items-center justify-center';
    } else {
      btn.className = 'px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800 transition-all flex items-center justify-center';
    }
  });
  renderBreakdownTables(calculateSummaryMetrics(getFilteredTransactions()));
  if (window.lucide) window.lucide.createIcons();
}

// ================= MODAL EVALUASI KEUANGAN OTOMATIS =================

let activeEvaluationContext = null;

function checkAutoEvaluationTrigger() {
  const now = new Date();
  const todayDay = now.getDate();
  const paydayDay = Number(state.settings?.paydayConfig?.dayOfMonth || 25);

  if (todayDay !== 1 && todayDay !== paydayDay) {
    return;
  }

  const triggerKey = `finance_eval_prompted_${now.getFullYear()}_${now.getMonth() + 1}_day${todayDay}`;
  if (localStorage.getItem(triggerKey)) {
    return;
  }

  let prevYear = now.getFullYear();
  let prevMonth = now.getMonth() - 1;
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }

  const prevCycle = getCurrentCycleDateRange(prevYear, prevMonth);
  const prevTx = state.transactions.filter((tx) => {
    if (!tx.date) return false;
    const parts = tx.date.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const txObj = new Date(y, m - 1, d, 12, 0, 0, 0);
    return txObj >= prevCycle.start && txObj <= prevCycle.end;
  });

  let prevIncome = 0;
  let prevExpense = 0;
  let prevSavings = 0;

  prevTx.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'Income') prevIncome += amt;
    else if (tx.type === 'Expense') prevExpense += amt;
    else if (tx.type === 'Savings') prevSavings += amt;
  });

  let prevBudget = 0;
  const schema = getActiveSchema();
  schema.Expense.groups.forEach((g) =>
    g.items.forEach((i) => {
      if (!i.noBudget) {
        prevBudget += Number(state.budgets[makeBudgetKey(i.name, prevYear, prevMonth)]) || 0;
      }
    })
  );

  const isOverbudget = prevBudget > 0 && prevExpense > prevBudget;
  const diff = Math.abs(prevExpense - prevBudget);
  const savingRatio = prevIncome > 0
    ? Math.round((prevSavings / prevIncome) * 100)
    : (prevExpense > 0 ? Math.round((prevSavings / prevExpense) * 100) : 0);

  setTimeout(() => {
    openEvaluationModal({
      year: prevYear,
      month: prevMonth,
      cycleLabel: prevCycle.label,
      income: prevIncome,
      expense: prevExpense,
      budget: prevBudget,
      savings: prevSavings,
      isOverbudget,
      diff,
      savingRatio,
      triggerKey
    });
  }, 1200);
}

function openEvaluationModal(evalData) {
  activeEvaluationContext = evalData;

  const subtitle = document.getElementById('evalModalPeriodSubtitle');
  if (subtitle) subtitle.textContent = `Analisis Siklus: ${evalData.cycleLabel}`;

  const statusBadge = document.getElementById('evalStatusBadge');
  const statusText = document.getElementById('evalStatusText');
  const diffAmount = document.getElementById('evalDiffAmount');

  if (evalData.isOverbudget) {
    if (statusBadge) statusBadge.className = 'mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 w-fit';
    if (statusText) statusText.textContent = t('eval_status_overbudget') || 'Overbudget (Melebihi Anggaran)';
    if (diffAmount) diffAmount.textContent = `Defisit ${formatRp(evalData.diff)}`;
  } else {
    if (statusBadge) statusBadge.className = 'mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 w-fit';
    if (statusText) statusText.textContent = t('eval_status_underbudget') || 'Underbudget (Terkendali / Hemat)';
    if (diffAmount) diffAmount.textContent = `Hemat ${formatRp(evalData.diff)}`;
  }

  const ratioEl = document.getElementById('evalSavingRatio');
  if (ratioEl) ratioEl.textContent = `${evalData.savingRatio}%`;

  const incEl = document.getElementById('evalTotalIncome');
  if (incEl) incEl.textContent = formatRp(evalData.income);

  const expEl = document.getElementById('evalTotalExpense');
  if (expEl) expEl.textContent = formatRp(evalData.expense);

  const budEl = document.getElementById('evalTotalBudget');
  if (budEl) budEl.textContent = formatRp(evalData.budget);

  const savEl = document.getElementById('evalTotalSavings');
  if (savEl) savEl.textContent = formatRp(evalData.savings);

  const notesInput = document.getElementById('evalNotesInput');
  if (notesInput) notesInput.value = '';

  const modal = document.getElementById('evaluationModal');
  if (modal) {
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('modal-open'));
  }
  if (window.lucide) window.lucide.createIcons();
}

function closeEvaluationModal() {
  const modal = document.getElementById('evaluationModal');
  if (modal) {
    modal.classList.remove('modal-open');
    setTimeout(() => modal.classList.add('hidden'), 200);
  }
}

function handleEvaluationSubmit(e) {
  e.preventDefault();
  const notesInput = document.getElementById('evalNotesInput');
  const notes = notesInput ? notesInput.value.trim() : '';

  if (!notes || notes.length < 3) {
    showFieldValidationError('evalNotesInput', 'evalNotesError', t('eval_notes_error') || 'Catatan evaluasi wajib diisi minimal 3 karakter.');
    return;
  }
  clearFieldValidationError('evalNotesInput', 'evalNotesError');

  if (activeEvaluationContext) {
    const record = {
      id: 'eval_' + Date.now(),
      periodKey: `${activeEvaluationContext.year}-${String(activeEvaluationContext.month + 1).padStart(2, '0')}`,
      cycleLabel: activeEvaluationContext.cycleLabel || `${activeEvaluationContext.year}-${String(activeEvaluationContext.month + 1).padStart(2, '0')}`,
      totalIncome: activeEvaluationContext.income,
      totalExpense: activeEvaluationContext.expense,
      totalBudget: activeEvaluationContext.budget,
      totalSavings: activeEvaluationContext.savings,
      savingRatio: activeEvaluationContext.savingRatio,
      status: activeEvaluationContext.isOverbudget ? 'over' : 'under',
      diff: activeEvaluationContext.diff || 0,
      notes,
      createdAt: new Date().toISOString()
    };
    state.evaluations.unshift(record);
    saveEvaluationsToStorage();
    if (activeEvaluationContext.triggerKey) {
      localStorage.setItem(activeEvaluationContext.triggerKey, 'true');
    }
  }

  closeEvaluationModal();
  renderDashboardNotesSection();
  renderAllMonthlyNotesModal();
  showToast((t('eval_save_btn') || 'Evaluasi') + ' berhasil disimpan!', 'success');
}

// ================= SECTION CATATAN BULANAN (MONTHLY NOTES) =================

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateShort(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
  } catch (e) {
    return isoStr;
  }
}

function renderDashboardNotesSection() {
  const container = document.getElementById('dashboardNotesPreviewContainer');
  const countBadge = document.getElementById('dashboardNotesCountBadge');
  if (!container) return;

  const evals = Array.isArray(state.evaluations) ? state.evaluations : [];
  if (countBadge) {
    countBadge.textContent = `${evals.length} ${t('sec_monthly_notes') ? 'Catatan' : 'Notes'}`;
  }

  if (evals.length === 0) {
    container.innerHTML = `
      <div class="p-4 sm:p-5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center flex flex-col items-center justify-center gap-2.5">
        <div class="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
          <i data-lucide="calendar-check" class="w-5 h-5"></i>
        </div>
        <div>
          <h4 class="text-xs sm:text-sm font-bold text-slate-200">${t('no_notes_yet') || 'Belum ada catatan evaluasi bulanan tersimpan.'}</h4>
          <p class="text-[11px] text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            ${t('no_notes_yet_sub') || 'Catatan otomatis dibuat saat Anda mengisi evaluasi pada tanggal gajian atau tanggal 1 setiap bulan, atau Anda bisa menuliskannya secara manual kapan saja.'}
          </p>
        </div>

      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Ambil catatan evaluasi paling mutakhir untuk preview di dashboard
  const latest = evals[0];
  const isOver = latest.status === 'over';
  const statusBadge = isOver
    ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">🔴 Overbudget (${formatRp(latest.diff || 0)})</span>`
    : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🟢 Underbudget (${formatRp(latest.diff || 0)})</span>`;

  const dateStr = latest.createdAt ? formatDateShort(latest.createdAt) : '';

  container.innerHTML = `
    <div class="space-y-3">
      <div class="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-indigo-500/40 transition-all">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-800/80">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-indigo-300 border border-indigo-500/30 font-mono-num">
              🗓️ ${escapeHTML(latest.cycleLabel || latest.periodKey || 'Periode')}
            </span>
            ${statusBadge}
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono-num font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
              📈 Saving: ${latest.savingRatio || 0}%
            </span>
          </div>
          ${dateStr ? `<span class="text-[10px] text-slate-500 font-mono-num">Dibuat: ${dateStr}</span>` : ''}
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 text-[11px]">
          <div>
            <span class="text-slate-400 block text-[10px]">Pemasukan</span>
            <span class="font-bold text-emerald-400 font-mono-num">${formatRp(latest.totalIncome || 0)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Pengeluaran</span>
            <span class="font-bold text-rose-400 font-mono-num">${formatRp(latest.totalExpense || 0)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Budget</span>
            <span class="font-bold text-slate-200 font-mono-num">${formatRp(latest.totalBudget || 0)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Ditabung</span>
            <span class="font-bold text-blue-400 font-mono-num">${formatRp(latest.totalSavings || 0)}</span>
          </div>
        </div>

        <div class="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line">
          <div class="flex items-center gap-1.5 text-indigo-400 text-[11px] font-bold mb-1">
            <i data-lucide="message-square-text" class="w-3.5 h-3.5"></i>
            <span>Catatan Refleksi:</span>
          </div>
          ${escapeHTML(latest.notes)}
        </div>
      </div>

      ${evals.length > 1 ? `
        <div class="flex items-center justify-between pt-1 text-xs text-slate-400">
          <span>Menampilkan 1 dari ${evals.length} catatan bulanan tersimpan.</span>
          <button
            type="button"
            onclick="openAllMonthlyNotesModal()"
            class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 focus:outline-none"
          >
            <span>Lihat Semua Catatan (${evals.length})</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      ` : ''}
    </div>
  `;
  if (window.lucide) window.lucide.createIcons();
}

function openAllMonthlyNotesModal() {
  const modal = document.getElementById('modalAllMonthlyNotes');
  if (!modal) return;
  renderAllMonthlyNotesModal();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('modal-open'));
  if (window.lucide) window.lucide.createIcons();
}

function closeAllMonthlyNotesModal() {
  const modal = document.getElementById('modalAllMonthlyNotes');
  if (modal) {
    modal.classList.remove('modal-open');
    setTimeout(() => modal.classList.add('hidden'), 200);
  }
}

function renderAllMonthlyNotesModal() {
  const container = document.getElementById('allNotesListContainer');
  const badge = document.getElementById('allNotesModalBadge');
  if (!container) return;

  const evals = Array.isArray(state.evaluations) ? state.evaluations : [];
  if (badge) badge.textContent = String(evals.length);

  if (evals.length === 0) {
    container.innerHTML = `
      <div class="p-8 rounded-xl bg-slate-950/40 border border-slate-800/80 text-center flex flex-col items-center justify-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
          <i data-lucide="book-open" class="w-6 h-6"></i>
        </div>
        <div>
          <h4 class="text-sm font-bold text-white">${t('no_notes_yet') || 'Belum ada catatan evaluasi bulanan tersimpan.'}</h4>
          <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
            ${t('no_notes_yet_sub') || 'Catatan akan tersimpan otomatis saat Anda mengisi evaluasi bulanan pada tanggal gajian atau tanggal 1.'}
          </p>
        </div>

      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  let html = '';
  evals.forEach((ev) => {
    const isOver = ev.status === 'over';
    const statusBadge = isOver
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">🔴 Defisit ${formatRp(ev.diff || 0)}</span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🟢 Hemat ${formatRp(ev.diff || 0)}</span>`;

    const dateStr = ev.createdAt ? formatDateShort(ev.createdAt) : '';

    html += `
      <div class="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-indigo-500/40 transition-all space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-800/80">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-indigo-300 border border-indigo-500/30 font-mono-num">
              🗓️ ${escapeHTML(ev.cycleLabel || ev.periodKey || 'Periode')}
            </span>
            ${statusBadge}
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono-num font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
              📈 Saving: ${ev.savingRatio || 0}%
            </span>
          </div>
          ${dateStr ? `<span class="text-[10px] text-slate-500 font-mono-num">Dibuat: ${dateStr}</span>` : ''}
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-[11px]">
          <div>
            <span class="text-slate-400 block text-[10px]">Pemasukan</span>
            <span class="font-bold text-emerald-400 font-mono-num">${formatRp(ev.totalIncome || 0)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Pengeluaran</span>
            <span class="font-bold text-rose-400 font-mono-num">${formatRp(ev.totalExpense || 0)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Budget</span>
            <span class="font-bold text-slate-200 font-mono-num">${formatRp(ev.totalBudget || 0)}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Ditabung</span>
            <span class="font-bold text-blue-400 font-mono-num">${formatRp(ev.totalSavings || 0)}</span>
          </div>
        </div>

        <div class="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-line">
          <div class="flex items-center gap-1.5 text-indigo-400 text-[11px] font-bold mb-1">
            <i data-lucide="message-square-text" class="w-3.5 h-3.5"></i>
            <span>Catatan Refleksi:</span>
          </div>
          ${escapeHTML(ev.notes)}
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
          <button
            type="button"
            onclick="editMonthlyEvaluationNote('${ev.id}')"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-indigo-300 hover:bg-slate-800 transition-colors flex items-center gap-1"
            title="Edit Catatan"
          >
            <i data-lucide="edit-3" class="w-3 h-3"></i>
            <span>Edit</span>
          </button>
          <button
            type="button"
            onclick="deleteMonthlyEvaluationNote('${ev.id}')"
            class="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1"
            title="Hapus Catatan"
          >
            <i data-lucide="trash-2" class="w-3 h-3"></i>
            <span>Hapus</span>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

function openManualEvaluationModal() {
  const now = new Date();
  const evalYear = state.selectedYear;
  const evalMonth = state.selectedMonth === -1 ? now.getMonth() : state.selectedMonth;
  const cycle = getCurrentCycleDateRange(evalYear, evalMonth);

  const txInCycle = state.transactions.filter((tx) => {
    if (!tx.date) return false;
    const parts = tx.date.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    const txObj = new Date(y, m - 1, d, 12, 0, 0, 0);
    return txObj >= cycle.start && txObj <= cycle.end;
  });

  let inc = 0, exp = 0, sav = 0;
  txInCycle.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'Income') inc += amt;
    else if (tx.type === 'Expense') exp += amt;
    else if (tx.type === 'Savings') sav += amt;
  });

  let bud = 0;
  const schema = getActiveSchema();
  schema.Expense.groups.forEach((g) =>
    g.items.forEach((i) => {
      if (!i.noBudget) {
        bud += Number(state.budgets[makeBudgetKey(i.name, evalYear, evalMonth)]) || 0;
      }
    })
  );

  const isOver = bud > 0 && exp > bud;
  const diff = Math.abs(exp - bud);
  const savingRatio = inc > 0
    ? Math.round((sav / inc) * 100)
    : (exp > 0 ? Math.round((sav / exp) * 100) : 0);

  closeAllMonthlyNotesModal();

  openEvaluationModal({
    year: evalYear,
    month: evalMonth,
    cycleLabel: cycle.label,
    income: inc,
    expense: exp,
    budget: bud,
    savings: sav,
    isOverbudget: isOver,
    diff,
    savingRatio,
    triggerKey: null
  });
}

function editMonthlyEvaluationNote(evalId) {
  const note = state.evaluations.find((e) => e.id === evalId);
  if (!note) return;
  const newNotes = window.prompt('Ubah Catatan Evaluasi Bulanan:', note.notes);
  if (newNotes === null) return;
  const trimmed = newNotes.trim();
  if (trimmed.length < 3) {
    showToast('Catatan evaluasi minimal 3 karakter.', 'warning');
    return;
  }
  note.notes = trimmed;
  saveEvaluationsToStorage();
  renderDashboardNotesSection();
  renderAllMonthlyNotesModal();
  showToast('Catatan evaluasi berhasil diperbarui!', 'success');
}

function deleteMonthlyEvaluationNote(evalId) {
  if (!window.confirm('Apakah Anda yakin ingin menghapus catatan evaluasi ini?')) return;
  state.evaluations = state.evaluations.filter((e) => e.id !== evalId);
  saveEvaluationsToStorage();
  renderDashboardNotesSection();
  renderAllMonthlyNotesModal();
  showToast('Catatan evaluasi telah dihapus.', 'info');
}

// ================= REMINDER TRANSAKSI HARIAN =================

function checkDailyReminder() {
  if (!state.settings || !state.settings.reminderEnabled) return;
  const todayStr = getTodayLocalISO();
  const reminderKey = `ft_reminder_shown_${todayStr}`;
  if (localStorage.getItem(reminderKey)) return;

  const todayHasTx = state.transactions.some((tx) => tx.date === todayStr);
  if (!todayHasTx) {
    setTimeout(() => {
      showToast('🔔 Jangan lupa mencatat transaksi keuangan harianmu hari ini!', 'info');
      localStorage.setItem(reminderKey, 'true');
    }, 2500);
  }
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
  renderSavingVsExpenseGauge(metrics);
  renderPaydayConfigUI();
  renderQuotesCard();
  renderBreakdownTables(metrics);
  renderAnalyticsCharts(metrics);
  renderTransactionHistory(filteredTx);
  renderDashboardNotesSection();
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

  const expenseTypeWrap = document.getElementById('txExpenseTypeWrapper');
  if (expenseTypeWrap) {
    if (type === 'Expense') {
      expenseTypeWrap.classList.remove('hidden');
    } else {
      expenseTypeWrap.classList.add('hidden');
    }
  }
}

function setModalTxQuadrant(q) {
  const input = document.getElementById('txQuadrant');
  if (input) input.value = q;
  document.querySelectorAll('#txQuadrantContainer .tx-quadrant-btn').forEach((btn) => {
    const bq = parseInt(btn.getAttribute('data-quadrant'), 10);
    if (bq === q) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function setModalTxExpenseType(type) {
  const input = document.getElementById('txExpenseType');
  if (input) input.value = type;
  const btnNeeds = document.getElementById('btnModalTxNeeds');
  const btnWants = document.getElementById('btnModalTxWants');
  if (btnNeeds && btnWants) {
    if (type === 'needs') {
      btnNeeds.className =
        'py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 bg-emerald-500/20 border-emerald-500 text-emerald-300';
      btnWants.className =
        'py-2 px-3 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5';
    } else {
      btnWants.className =
        'py-2 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 bg-purple-500/20 border-purple-500 text-purple-300';
      btnNeeds.className =
        'py-2 px-3 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5';
    }
  }
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

  setModalTxQuadrant(2);
  setModalTxExpenseType('needs');

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

  setModalTxQuadrant(Number(tx.quadrant) || 2);
  setModalTxExpenseType(tx.expenseType || 'needs');

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
  const quadrant = parseInt(document.getElementById('txQuadrant').value, 10) || 2;
  const expenseType = document.getElementById('txExpenseType').value || 'needs';

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
        note,
        quadrant,
        expenseType: type === 'Expense' ? expenseType : undefined
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
      note,
      quadrant,
      expenseType: type === 'Expense' ? expenseType : undefined
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

// ================= MODAL TAMBAH KATEGORI SENDIRI & SMART ICON SELECTOR =================

const CATEGORY_ICON_CATALOG = [
  { icon: 'gamepad-2', label: 'Gaming' },
  { icon: 'shopping-bag', label: 'Shopping' },
  { icon: 'utensils', label: 'Kuliner' },
  { icon: 'coffee', label: 'Kopi' },
  { icon: 'car', label: 'Mobil' },
  { icon: 'fuel', label: 'Bensin' },
  { icon: 'plane', label: 'Liburan' },
  { icon: 'palmtree', label: 'Wisata' },
  { icon: 'graduation-cap', label: 'Edukasi' },
  { icon: 'book', label: 'Buku' },
  { icon: 'heart-pulse', label: 'Kesehatan' },
  { icon: 'dumbbell', label: 'Olahraga' },
  { icon: 'shirt', label: 'Pakaian' },
  { icon: 'film', label: 'Bioskop' },
  { icon: 'tv', label: 'Streaming' },
  { icon: 'music', label: 'Musik' },
  { icon: 'gift', label: 'Hadiah' },
  { icon: 'home', label: 'Rumah' },
  { icon: 'wifi', label: 'Internet' },
  { icon: 'zap', label: 'Listrik' },
  { icon: 'droplets', label: 'Air' },
  { icon: 'baby', label: 'Bayi' },
  { icon: 'dog', label: 'Hewan' },
  { icon: 'briefcase', label: 'Gaji' },
  { icon: 'wallet', label: 'Dompet' },
  { icon: 'piggy-bank', label: 'Tabungan' },
  { icon: 'coins', label: 'Receh' },
  { icon: 'trending-up', label: 'Investasi' },
  { icon: 'laptop', label: 'Gadget' },
  { icon: 'smartphone', label: 'HP / Pulsa' },
  { icon: 'landmark', label: 'Bank' },
  { icon: 'credit-card', label: 'Cicilan' },
  { icon: 'shield-check', label: 'Asuransi' },
  { icon: 'badge-percent', label: 'Diskon' },
  { icon: 'wrench', label: 'Servis' },
  { icon: 'scissors', label: 'Salon' },
  { icon: 'sparkles', label: 'Skincare' },
  { icon: 'award', label: 'Bonus' },
  { icon: 'receipt', label: 'Tagihan' },
  { icon: 'camera', label: 'Kamera' },
  { icon: 'bike', label: 'Sepeda' },
  { icon: 'bus', label: 'Transport' },
  { icon: 'shield-alert', label: 'Darurat' },
  { icon: 'layers', label: 'Lainnya' },
  { icon: 'tag', label: 'Kategori' },
  { icon: 'star', label: 'Favorit' },
  { icon: 'heart', label: 'Keluarga' },
  { icon: 'gem', label: 'Aset / Emas' }
];

const CATEGORY_KEYWORD_RULES = [
  // 1. Listrik & PLN
  { match: ['listrik', 'pln', 'token', 'energi', 'daya listrik', 'lampu'], icon: 'zap', label: 'Listrik' },
  // 2. Air & PDAM
  { match: ['pdam', 'tagihan air', 'air bersih'], icon: 'droplets', label: 'Air PDAM' },
  // 3. Bahan bakar & SPBU
  { match: ['bensin', 'bbm', 'pertalite', 'pertamax', 'solar', 'fuel', 'spbu', 'shell', 'bensin motor', 'bensin mobil'], icon: 'fuel', label: 'Bahan Bakar' },
  // 4. Gaming
  { match: ['gaming', 'game', 'ps5', 'ps4', 'xbox', 'steam', 'nintendo', 'valorant', 'mlbb', 'genshin', 'roblox', 'esport', 'mabar', 'gamepad', 'topup game'], icon: 'gamepad-2', label: 'Gaming' },
  // 5. Kesehatan & Medis
  { match: ['obat', 'dokter', 'sehat', 'kesehatan', 'medis', 'rumah sakit', 'vitamin', 'apotek', 'klinik', 'vaksin', 'lab', 'checkup', 'periksa', 'bpjs'], icon: 'heart-pulse', label: 'Kesehatan' },
  // 6. Kopi & Kafe
  { match: ['kopi', 'coffee', 'starbucks', 'ngopi', 'janji jiwa', 'kenangan', 'point coffee'], icon: 'coffee', label: 'Kopi' },
  // 7. Makanan & Kuliner
  { match: ['makan', 'kuliner', 'food', 'resto', 'restoran', 'cafe', 'kafe', 'sarapan', 'lunch', 'dinner', 'warung', 'snack', 'jajan', 'nasi', 'bakso', 'mie', 'gofood', 'grabfood', 'shopeefood'], icon: 'utensils', label: 'Makanan / Kuliner' },
  // 8. Wifi & Internet
  { match: ['wifi', 'internet', 'kuota', 'pulsa', 'indihome', 'biznet', 'myrepublic', 'telkomsel', 'by.u', 'kartu tri', 'paket data'], icon: 'wifi', label: 'Internet & Pulsa' },
  // 9. Olahraga & Gym
  { match: ['gym', 'olahraga', 'fitness', 'fitnes', 'sport', 'workout', 'renang', 'badminton', 'futsal', 'yoga'], icon: 'dumbbell', label: 'Olahraga' },
  // 10. Liburan & Wisata
  { match: ['liburan', 'wisata', 'travel', 'holiday', 'tiket pesawat', 'pesawat', 'tour', 'flight', 'jalan-jalan'], icon: 'plane', label: 'Liburan / Wisata' },
  { match: ['pantai', 'beach', 'resort', 'hotel', 'staycation', 'villa'], icon: 'palmtree', label: 'Staycation' },
  // 11. Edukasi & Buku
  { match: ['sekolah', 'kuliah', 'pendidikan', 'kursus', 'les', 'kampus', 'spp', 'edukasi', 'skripsi', 'wisuda', 'bimbel'], icon: 'graduation-cap', label: 'Pendidikan' },
  { match: ['buku', 'book', 'novel', 'gramedia', 'komik', 'ebook'], icon: 'book', label: 'Buku' },
  // 12. Hiburan & Film
  { match: ['nonton', 'bioskop', 'film', 'movie', 'cinema', 'xxi', 'cgv', 'netflix', 'disney', 'prime video', 'vidio'], icon: 'film', label: 'Hiburan Film' },
  { match: ['musik', 'music', 'konser', 'spotify', 'apple music', 'lagu'], icon: 'music', label: 'Musik' },
  { match: ['tv', 'televisi', 'streaming', 'youtube'], icon: 'tv', label: 'Streaming TV' },
  // 13. Kendaraan & Otomotif
  { match: ['mobil', 'motor', 'bengkel', 'parkir', 'service motor', 'service mobil', 'kendaraan', 'cuci motor', 'cuci mobil', 'tol'], icon: 'car', label: 'Otomotif' },
  { match: ['sepeda', 'gowes', 'folding bike', 'roadbike'], icon: 'bike', label: 'Sepeda' },
  { match: ['kereta', 'mrt', 'krl', 'angkot', 'ojek', 'grab', 'gojek', 'transport', 'transportasi', 'tije', 'busway', 'bus'], icon: 'bus', label: 'Transportasi' },
  // 14. Pakaian & Fashion
  { match: ['baju', 'pakaian', 'shirt', 'celana', 'sepatu', 'jaket', 'kaos', 'outfit', 'kondangan', 'gamis', 'hijab', 'dress'], icon: 'shirt', label: 'Pakaian' },
  // 15. Skincare & Kecantikan
  { match: ['skincare', 'kosmetik', 'makeup', 'kecantikan', 'perawatan', 'facial', 'serum', 'creambath'], icon: 'sparkles', label: 'Skincare' },
  { match: ['salon', 'potong rambut', 'barber', 'cukur', 'barbershop'], icon: 'scissors', label: 'Salon / Cukur' },
  // 16. Shopping umum
  { match: ['shopping', 'belanja', 'toko', 'mall', 'tote', 'fashion', 'shopee', 'tokped', 'lazada', 'haul', 'tas', 'pasar'], icon: 'shopping-bag', label: 'Shopping' },
  // 17. Rumah & Properti
  { match: ['rumah', 'kost', 'kos-kosan', 'kontrakan', 'renovasi', 'properti', 'apartemen', 'perabot', 'mebel', 'tempat tinggal'], icon: 'home', label: 'Rumah & Properti' },
  // 18. Bayi & Anak
  { match: ['bayi', 'baby', 'anak', 'popok', 'susu formula', 'pampers', 'mainan anak'], icon: 'baby', label: 'Bayi & Anak' },
  // 19. Hewan
  { match: ['hewan', 'pet', 'kucing', 'anjing', 'cat', 'dog', 'petshop', 'vet', 'whiskas', 'royal canin'], icon: 'dog', label: 'Hewan Peliharaan' },
  // 20. Hadiah & Donasi
  { match: ['hadiah', 'kado', 'gift', 'donasi', 'sedekah', 'infaq', 'zakat', 'amal', 'charity', 'sumbangan', 'angpao'], icon: 'gift', label: 'Hadiah / Amal' },
  // 21. Pekerjaan & Gaji
  { match: ['gaji', 'salary', 'kantor', 'kerja', 'proyek', 'project', 'freelance', 'honor', 'upah', 'pendapatan', 'omset'], icon: 'briefcase', label: 'Gaji / Pekerjaan' },
  // 22. Tabungan & Investasi
  { match: ['darurat', 'emergency'], icon: 'shield-alert', label: 'Dana Darurat' },
  { match: ['tabungan', 'celengan', 'simpanan', 'saving', 'dana nikah', 'haji', 'umroh', 'kurban', 'qurban', 'beli rumah'], icon: 'piggy-bank', label: 'Tabungan' },
  { match: ['investasi', 'saham', 'crypto', 'kripto', 'reksadana', 'dividen', 'cuan', 'emas', 'gold', 'bibit', 'ajaib', 'pluang'], icon: 'trending-up', label: 'Investasi' },
  // 23. Gadget & Elektronik
  { match: ['gadget', 'laptop', 'komputer', 'elektronik', 'pc', 'ipad', 'tablet', 'macbook'], icon: 'laptop', label: 'Gadget / Komputer' },
  { match: ['hp', 'smartphone', 'handphone', 'iphone', 'android', 'samsung'], icon: 'smartphone', label: 'Handphone' },
  // 24. Finansial & Tagihan
  { match: ['bank', 'pajak', 'bunga', 'deposito', 'admin bank', 'bunga bank'], icon: 'landmark', label: 'Perbankan' },
  { match: ['kartu kredit', 'credit card', 'paylater', 'cicilan', 'utang', 'hutang', 'pinjol', 'kredivo', 'spaylater'], icon: 'credit-card', label: 'Cicilan / Kredit' },
  { match: ['asuransi', 'insurance', 'prudential', 'allianz', 'manulife'], icon: 'shield-check', label: 'Asuransi' },
  { match: ['diskon', 'promo', 'cashback', 'voucher'], icon: 'badge-percent', label: 'Promo / Cashback' },
  { match: ['servis', 'service', 'alat', 'perbaikan', 'reparasi', 'pertukangan'], icon: 'wrench', label: 'Perbaikan' },
  { match: ['bonus', 'thr', 'reward', 'hadiah lomba', 'insentif'], icon: 'award', label: 'Bonus / THR' },
  { match: ['tagihan', 'iuran', 'bill', 'retribusi', 'keamanan', 'kebersihan'], icon: 'receipt', label: 'Tagihan' },
  { match: ['foto', 'kamera', 'fotografi', 'video'], icon: 'camera', label: 'Fotografi' }
];

let isManualCategoryIconSelected = false;

function detectIconFromCategoryName(name, type) {
  if (!name || !name.trim()) {
    return {
      icon: type === 'Savings' ? 'piggy-bank' : type === 'Income' ? 'coins' : 'shopping-bag',
      label: ''
    };
  }

  const clean = name.toLowerCase().trim();
  for (const rule of CATEGORY_KEYWORD_RULES) {
    for (const kw of rule.match) {
      if (clean.includes(kw)) {
        return { icon: rule.icon, label: rule.label };
      }
    }
  }

  return {
    icon: type === 'Savings' ? 'piggy-bank' : type === 'Income' ? 'coins' : 'shopping-bag',
    label: ''
  };
}

function renderCustomCategoryIconGrid(selectedIcon) {
  const grid = document.getElementById('customCategoryIconGrid');
  if (!grid) return;

  grid.innerHTML = CATEGORY_ICON_CATALOG.map((item) => {
    const isActive = item.icon === selectedIcon;
    return `
      <button
        type="button"
        onclick="selectCustomCategoryIcon('${item.icon}', true)"
        class="cat-icon-choice ${isActive ? 'active' : ''}"
        title="${item.label}"
      >
        <i data-lucide="${item.icon}" class="w-4 h-4 mb-1 pointer-events-none"></i>
        <span class="text-[9px] truncate max-w-full font-medium leading-none pointer-events-none">${item.label}</span>
      </button>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

function selectCustomCategoryIcon(iconName, isManual = false) {
  if (isManual) {
    isManualCategoryIconSelected = true;
  }

  const hiddenInput = document.getElementById('customCatSelectedIcon');
  if (hiddenInput) hiddenInput.value = iconName;

  const labelEl = document.getElementById('customCatSelectedIconLabel');
  if (labelEl) labelEl.textContent = iconName;

  const previewIcon = document.getElementById('customCatPreviewIcon');
  if (previewIcon) {
    previewIcon.setAttribute('data-lucide', iconName);
  }

  // Update active state in grid buttons
  document.querySelectorAll('.cat-icon-choice').forEach((btn) => {
    const iconEl = btn.querySelector('i');
    const bIcon = iconEl ? iconEl.getAttribute('data-lucide') : '';
    if (bIcon === iconName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (window.lucide) window.lucide.createIcons();
}

function randomizeCustomCategoryIcon() {
  const randomIndex = Math.floor(Math.random() * CATEGORY_ICON_CATALOG.length);
  const picked = CATEGORY_ICON_CATALOG[randomIndex];
  const box = document.getElementById('customCatPreviewIconBox');
  if (box) {
    box.style.transform = 'scale(1.18) rotate(12deg)';
    setTimeout(() => {
      box.style.transform = '';
    }, 220);
  }
  selectCustomCategoryIcon(picked.icon, true);
}

function openAddCategoryModal(defaultType = 'Savings') {
  isManualCategoryIconSelected = false;
  const typeSelect = document.getElementById('customCatType');
  typeSelect.value = defaultType;
  syncCustomSelectTrigger(typeSelect);

  const nameInput = document.getElementById('customCatName');
  nameInput.value = '';
  clearFieldValidationError('customCatName', 'customCatNameError');

  const previewName = document.getElementById('customCatPreviewName');
  if (previewName) previewName.textContent = 'Nama Kategori';

  const previewBadge = document.getElementById('customCatPreviewBadge');
  if (previewBadge) {
    previewBadge.textContent = defaultType;
    if (defaultType === 'Savings') {
      previewBadge.className = 'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30';
    } else if (defaultType === 'Expense') {
      previewBadge.className = 'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
    } else {
      previewBadge.className = 'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }
  }

  const defaultIcon = defaultType === 'Savings' ? 'piggy-bank' : defaultType === 'Income' ? 'coins' : 'shopping-bag';
  renderCustomCategoryIconGrid(defaultIcon);
  selectCustomCategoryIcon(defaultIcon, false, '');

  const modal = document.getElementById('modalAddCategory');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    modal.classList.add('modal-open');
    nameInput.focus();
    if (window.lucide) window.lucide.createIcons();
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
  const icon = document.getElementById('customCatSelectedIcon').value || (type === 'Savings' ? 'piggy-bank' : type === 'Income' ? 'coins' : 'shopping-bag');

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
    icon
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
  attachThousandSeparatorInput(
    document.getElementById('paydayAmountInput'),
    document.getElementById('paydayAmountPreview')
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
    if (typeof updateWalletFilterGlider === 'function') updateWalletFilterGlider();
  });

  document.getElementById('formTransaction').addEventListener('submit', handleTransactionFormSubmit);
  document.getElementById('formBudget').addEventListener('submit', handleSaveBudgets);
  document.getElementById('formAddCategory').addEventListener('submit', handleAddCategorySubmit);
  document.getElementById('formWalletBalance').addEventListener('submit', handleSaveWalletBalance);
  document.getElementById('formAddWallet').addEventListener('submit', handleAddWalletSubmit);

  const customCatNameInput = document.getElementById('customCatName');
  if (customCatNameInput) {
    customCatNameInput.addEventListener('input', (e) => {
      const name = e.target.value.trim();
      const previewName = document.getElementById('customCatPreviewName');
      if (previewName) {
        previewName.textContent = name || 'Nama Kategori';
      }

      if (!isManualCategoryIconSelected) {
        const type = document.getElementById('customCatType').value || 'Savings';
        const detected = detectIconFromCategoryName(name, type);
        selectCustomCategoryIcon(detected.icon, false);
      }
    });
  }

  const customCatTypeSelect = document.getElementById('customCatType');
  if (customCatTypeSelect) {
    customCatTypeSelect.addEventListener('change', (e) => {
      const type = e.target.value || 'Savings';
      const previewBadge = document.getElementById('customCatPreviewBadge');
      if (previewBadge) {
        previewBadge.textContent = type;
        if (type === 'Savings') {
          previewBadge.className = 'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30';
        } else if (type === 'Expense') {
          previewBadge.className = 'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30';
        } else {
          previewBadge.className = 'inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        }
      }

      if (!isManualCategoryIconSelected) {
        const name = document.getElementById('customCatName').value.trim();
        const detected = detectIconFromCategoryName(name, type);
        selectCustomCategoryIcon(detected.icon, false);
      }
    });
  }

  if (typeof initWalletSwipeGestures === 'function') {
    initWalletSwipeGestures();
  }

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
      closeEvaluationModal();
      closeAllMonthlyNotesModal();
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

  initQuotesRotation();
  checkAutoEvaluationTrigger();
  checkDailyReminder();

  initPwaInstallButton();
  initNetworkAutoSyncListener();
}

function initNetworkAutoSyncListener() {
  window.addEventListener('online', () => {
    renderSettingsSection();
    if (window.lucide) window.lucide.createIcons();
    if (
      state.googleAccount &&
      state.googleAccount.email &&
      (hasPendingDriveSync() || !state.googleAccount.driveFolderId)
    ) {
      showToast('🌐 Terhubung ke internet! Mencadangkan transaksi otomatis ke Google Drive...', 'emerald');
      runBackgroundDriveBackup(false);
    }
  });

  window.addEventListener('offline', () => {
    renderSettingsSection();
    if (window.lucide) window.lucide.createIcons();
  });

  // Saat aplikasi dibuka dan sedang terhubung ke internet, otomatis sinkronkan jika ada antrean, folder belum terbuat, atau izin tautan folder belum diaktifkan
  if (
    navigator.onLine !== false &&
    state.googleAccount &&
    state.googleAccount.email &&
    (hasPendingDriveSync() ||
      !state.googleAccount.driveFolderId ||
      !state.googleAccount.driveFolderPublic ||
      !state.driveBackups ||
      state.driveBackups.length === 0)
  ) {
    setTimeout(() => {
      runBackgroundDriveBackup(true);
    }, 500);
  }
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

