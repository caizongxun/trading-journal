'use strict';

// ─── CONFIG ───
const SUPABASE_URL  = 'https://bynnmxospdnfnnlaqqzi.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5bm5teG9zcGRuZm5ubGFxcXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODI5ODQsImV4cCI6MjA5NzM1ODk4NH0.yA0XCwzE8z70p2qGs9s_1QdTDGUK0cOjdAnP9zp_6RM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ───
let currentUser = null;
let currentView = 'dashboard';

// ─── THEME TOGGLE ───
(function(){
  const t = document.querySelector('[data-theme-toggle]');
  const r = document.documentElement;
  const d = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  r.setAttribute('data-theme', d);
  if (t) t.addEventListener('click', () => {
    const cur = r.getAttribute('data-theme');
    r.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
  });
})();

// ─── AUTH ───
const authScreen = document.getElementById('auth-screen');
const appShell   = document.getElementById('app-shell');
const authForm   = document.getElementById('auth-form');
const authError  = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
let authMode = 'login';

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    authMode = tab.dataset.tab;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('signup-name-field').style.display = authMode === 'signup' ? 'flex' : 'none';
    authSubmit.textContent = authMode === 'login' ? '登入' : '註冊';
    authError.style.display = 'none';
  });
});

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.style.display = 'none';
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  authSubmit.disabled = true;
  authSubmit.textContent = '處理中...';

  if (authMode === 'login') {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showAuthError(error.message);
  } else {
    const displayName = document.getElementById('display-name').value.trim();
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) { showAuthError(error.message); return; }
    if (data.user && !data.session) showAuthError('請到信箱確認帳號後再登入。');
  }
  authSubmit.disabled = false;
  authSubmit.textContent = authMode === 'login' ? '登入' : '註冊';
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.style.display = 'block';
  authSubmit.disabled = false;
  authSubmit.textContent = authMode === 'login' ? '登入' : '註冊';
}

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) {
    authScreen.style.display = 'none';
    appShell.style.display   = 'grid';
    document.getElementById('user-email-display').textContent = currentUser.email;
    loadView(currentView);
  } else {
    authScreen.style.display = 'flex';
    appShell.style.display   = 'none';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => supabase.auth.signOut());

// ─── VIEW ROUTING ───
document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', e => {
    const view = el.dataset.view;
    if (view) { e.preventDefault(); switchView(view); }
  });
});

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });
  const titles = { dashboard:'總覽', trades:'交易記錄', journal:'交易日誌', watchlist:'觀察清單', expenses:'收支記帳' };
  document.getElementById('view-title').textContent = titles[view] || view;
  loadView(view);
}

function loadView(view) {
  if (!currentUser) return;
  if (view === 'dashboard')  loadDashboard();
  if (view === 'trades')     loadTrades();
  if (view === 'journal')    loadJournal();
  if (view === 'watchlist')  loadWatchlist();
  if (view === 'expenses')   loadExpenses();
}

// ─── HELPERS ───
function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function pnlClass(n) { return n > 0 ? 'pnl-pos' : n < 0 ? 'pnl-neg' : ''; }
function esc(str) {
  const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML;
}

// ─── DASHBOARD ───
async function loadDashboard() {
  const { data: trades } = await supabase.from('trades').select('*').eq('user_id', currentUser.id);
  const all = trades || [];
  const closed = all.filter(t => t.status === 'CLOSED');
  const totalPnl = closed.reduce((s, t) => s + Number(t.net_pnl || 0), 0);
  const wins     = closed.filter(t => Number(t.net_pnl || 0) > 0).length;
  const winRate  = closed.length ? (wins / closed.length * 100).toFixed(1) + '%' : '—';
  const rrArr    = all.filter(t => t.risk_reward).map(t => Number(t.risk_reward));
  const avgRR    = rrArr.length ? (rrArr.reduce((a,b)=>a+b,0)/rrArr.length).toFixed(2) : '—';

  document.getElementById('kpi-total-trades').textContent = all.length;
  const pnlEl = document.getElementById('kpi-total-pnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + fmt(totalPnl);
  pnlEl.className = 'kpi-value ' + pnlClass(totalPnl);
  document.getElementById('kpi-win-rate').textContent = winRate;
  document.getElementById('kpi-avg-rr').textContent   = avgRR;

  const recent = all.slice(-5).reverse();
  const container = document.getElementById('recent-trades-table');
  if (!recent.length) { container.innerHTML = '<div class="empty-state"><p>尚無交易記錄</p></div>'; return; }
  container.innerHTML = `<table>
    <thead><tr><th>代號</th><th>方向</th><th>狀態</th><th>進場日</th><th>淨損益</th></tr></thead>
    <tbody>${recent.map(t => `<tr>
      <td><strong>${esc(t.symbol)}</strong></td>
      <td><span class="badge badge-${t.direction.toLowerCase()}">${t.direction}</span></td>
      <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
      <td>${esc(t.entry_date)}</td>
      <td class="${pnlClass(t.net_pnl)}">${t.net_pnl != null ? (Number(t.net_pnl) >= 0 ? '+' : '') + fmt(t.net_pnl) : '—'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ─── TRADES ───
let tradesCache = [];
async function loadTrades() {
  const statusFilter    = document.getElementById('filter-status').value;
  const directionFilter = document.getElementById('filter-direction').value;
  let q = supabase.from('trades').select('*').eq('user_id', currentUser.id).order('entry_date', { ascending: false });
  if (statusFilter)    q = q.eq('status', statusFilter);
  if (directionFilter) q = q.eq('direction', directionFilter);
  const { data } = await q;
  tradesCache = data || [];
  renderTrades(tradesCache);
}

document.getElementById('filter-status').addEventListener('change', loadTrades);
document.getElementById('filter-direction').addEventListener('change', loadTrades);

function renderTrades(trades) {
  const tbody = document.getElementById('trades-tbody');
  if (!trades.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">尚無資料</td></tr>'; return; }
  tbody.innerHTML = trades.map(t => `<tr>
    <td><strong>${esc(t.symbol)}</strong></td>
    <td>${esc(t.market || 'TW')}</td>
    <td><span class="badge badge-${t.direction.toLowerCase()}">${t.direction}</span></td>
    <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
    <td>${esc(t.entry_date)}</td>
    <td>${fmt(t.entry_price, 2)}</td>
    <td>${fmt(t.entry_qty)}</td>
    <td>${t.exit_price != null ? fmt(t.exit_price, 2) : '—'}</td>
    <td class="${pnlClass(t.net_pnl)}">${t.net_pnl != null ? (Number(t.net_pnl) >= 0 ? '+' : '') + fmt(t.net_pnl) : '—'}</td>
    <td>${t.rating ? '★'.repeat(t.rating) : '—'}</td>
    <td>
      <button class="btn btn-ghost btn-sm" onclick="openEditTrade('${t.id}')">編輯</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTrade('${t.id}')">刪除</button>
    </td>
  </tr>`).join('');
}

document.getElementById('new-trade-btn').addEventListener('click', () => openTradeModal());

function openTradeModal(trade = null) {
  const modal = document.getElementById('trade-modal');
  document.getElementById('trade-modal-title').textContent = trade ? '編輯交易' : '新增交易';
  const fields = ['id','symbol','market','direction','status','entry_date','entry_price','entry_qty','entry_fee','exit_date','exit_price','exit_qty','exit_fee','stop_loss','take_profit','rating','thesis','mistakes','lessons'];
  fields.forEach(f => {
    const el = document.getElementById('t-' + f.replace('_','-').replace('_','-').replace('_','-'));
    if (!el) { document.getElementById('trade-id').value = trade?.id || ''; return; }
    el.value = trade?.[f] ?? (f === 'market' ? 'TW' : f === 'status' ? 'OPEN' : f === 'direction' ? 'LONG' : f === 'entry_fee' || f === 'exit_fee' ? '0' : '');
  });
  if (!trade) document.getElementById('t-entry-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('trade-form-error').style.display = 'none';
  modal.style.display = 'flex';
}

function openEditTrade(id) {
  const trade = tradesCache.find(t => t.id === id);
  if (trade) openTradeModal(trade);
}

async function deleteTrade(id) {
  if (!confirm('確定刪除這筆交易？')) return;
  await supabase.from('trades').delete().eq('id', id).eq('user_id', currentUser.id);
  loadTrades();
}

document.getElementById('trade-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('trade-id').value;
  const get = (sel) => { const el = document.getElementById(sel); return el ? el.value || null : null; };
  const payload = {
    user_id:     currentUser.id,
    symbol:      get('t-symbol')?.toUpperCase(),
    market:      get('t-market') || 'TW',
    direction:   get('t-direction'),
    status:      get('t-status') || 'OPEN',
    entry_date:  get('t-entry-date'),
    entry_price: parseFloat(get('t-entry-price')),
    entry_qty:   parseFloat(get('t-entry-qty')),
    entry_fee:   parseFloat(get('t-entry-fee') || '0'),
    exit_date:   get('t-exit-date') || null,
    exit_price:  get('t-exit-price')  ? parseFloat(get('t-exit-price'))  : null,
    exit_qty:    get('t-exit-qty')    ? parseFloat(get('t-exit-qty'))    : null,
    exit_fee:    parseFloat(get('t-exit-fee') || '0'),
    stop_loss:   get('t-stop-loss')   ? parseFloat(get('t-stop-loss'))   : null,
    take_profit: get('t-take-profit') ? parseFloat(get('t-take-profit')) : null,
    rating:      get('t-rating')      ? parseInt(get('t-rating'))         : null,
    thesis:      get('t-thesis')      || null,
    mistakes:    get('t-mistakes')    || null,
    lessons:     get('t-lessons')     || null,
  };
  // auto-compute net_pnl
  if (payload.exit_price && payload.exit_qty) {
    const dir = payload.direction === 'LONG' ? 1 : -1;
    const gross = dir * (payload.exit_price - payload.entry_price) * payload.exit_qty;
    payload.gross_pnl = gross;
    payload.net_pnl   = gross - (payload.entry_fee || 0) - (payload.exit_fee || 0);
    if (payload.entry_price && payload.entry_qty) {
      payload.pnl_pct = payload.net_pnl / (payload.entry_price * payload.entry_qty) * 100;
    }
  }
  let error;
  if (id) {
    ({ error } = await supabase.from('trades').update(payload).eq('id', id).eq('user_id', currentUser.id));
  } else {
    ({ error } = await supabase.from('trades').insert(payload));
  }
  if (error) { document.getElementById('trade-form-error').textContent = error.message; document.getElementById('trade-form-error').style.display = 'block'; return; }
  closeModal('trade-modal');
  loadTrades();
  if (currentView === 'dashboard') loadDashboard();
});

// ─── JOURNAL ───
let journalCache = [];
async function loadJournal() {
  const { data } = await supabase.from('journals').select('*').eq('user_id', currentUser.id).order('journal_date', { ascending: false });
  journalCache = data || [];
  const container = document.getElementById('journal-list');
  if (!journalCache.length) { container.innerHTML = '<div class="empty-state"><p>尚無日誌</p></div>'; return; }
  const biasLabel = { BULLISH:'多頭 📈', BEARISH:'空頭 📉', NEUTRAL:'中性 ➡️' };
  container.innerHTML = journalCache.map(j => `
    <div class="journal-entry">
      <div class="journal-entry-header">
        <div class="journal-meta">
          <span class="journal-date">${esc(j.journal_date)}</span>
          ${j.market_bias ? `<span class="badge">${biasLabel[j.market_bias] || j.market_bias}</span>` : ''}
          ${j.mood ? `<span class="badge">心情 ${j.mood}/5</span>` : ''}
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn-ghost btn-sm" onclick="openEditJournal('${j.id}')">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="deleteJournal('${j.id}')">刪除</button>
        </div>
      </div>
      ${j.title ? `<div class="journal-title">${esc(j.title)}</div>` : ''}
      <div class="journal-content">${esc(j.content)}</div>
    </div>`).join('');
}

document.getElementById('new-journal-btn').addEventListener('click', () => openJournalModal());

function openJournalModal(journal = null) {
  const modal = document.getElementById('journal-modal');
  document.getElementById('journal-modal-title').textContent = journal ? '編輯日誌' : '新增日誌';
  document.getElementById('journal-id').value    = journal?.id || '';
  document.getElementById('j-date').value        = journal?.journal_date || new Date().toISOString().slice(0,10);
  document.getElementById('j-mood').value        = journal?.mood || '';
  document.getElementById('j-bias').value        = journal?.market_bias || '';
  document.getElementById('j-title').value       = journal?.title || '';
  document.getElementById('j-content').value     = journal?.content || '';
  document.getElementById('journal-form-error').style.display = 'none';
  modal.style.display = 'flex';
}

function openEditJournal(id) { const j = journalCache.find(x => x.id === id); if (j) openJournalModal(j); }

async function deleteJournal(id) {
  if (!confirm('確定刪除？')) return;
  await supabase.from('journals').delete().eq('id', id).eq('user_id', currentUser.id);
  loadJournal();
}

document.getElementById('journal-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('journal-id').value;
  const payload = {
    user_id:      currentUser.id,
    journal_date: document.getElementById('j-date').value,
    mood:         document.getElementById('j-mood').value ? parseInt(document.getElementById('j-mood').value) : null,
    market_bias:  document.getElementById('j-bias').value || null,
    title:        document.getElementById('j-title').value || null,
    content:      document.getElementById('j-content').value,
  };
  let error;
  if (id) ({ error } = await supabase.from('journals').update(payload).eq('id', id)); 
  else    ({ error } = await supabase.from('journals').insert(payload));
  if (error) { document.getElementById('journal-form-error').textContent = error.message; document.getElementById('journal-form-error').style.display = 'block'; return; }
  closeModal('journal-modal');
  loadJournal();
});

// ─── WATCHLIST ───
let watchCache = [];
async function loadWatchlist() {
  const { data } = await supabase.from('watchlist').select('*').eq('user_id', currentUser.id).order('added_at', { ascending: false });
  watchCache = data || [];
  const tbody = document.getElementById('watchlist-tbody');
  if (!watchCache.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">尚無觀察標的</td></tr>'; return; }
  tbody.innerHTML = watchCache.map(w => `<tr>
    <td><strong>${esc(w.symbol)}</strong></td>
    <td>${esc(w.market || 'TW')}</td>
    <td>${w.alert_price != null ? fmt(w.alert_price, 2) : '—'}</td>
    <td>${esc(w.note || '—')}</td>
    <td>${new Date(w.added_at).toLocaleDateString('zh-TW')}</td>
    <td>
      <button class="btn btn-ghost btn-sm" onclick="openEditWatch('${w.id}')">編輯</button>
      <button class="btn btn-danger btn-sm" onclick="deleteWatch('${w.id}')">刪除</button>
    </td>
  </tr>`).join('');
}

document.getElementById('new-watch-btn').addEventListener('click', () => openWatchModal());

function openWatchModal(watch = null) {
  document.getElementById('watch-id').value      = watch?.id || '';
  document.getElementById('w-symbol').value      = watch?.symbol || '';
  document.getElementById('w-market').value      = watch?.market || 'TW';
  document.getElementById('w-alert').value       = watch?.alert_price || '';
  document.getElementById('w-note').value        = watch?.note || '';
  document.getElementById('watch-form-error').style.display = 'none';
  document.getElementById('watch-modal').style.display = 'flex';
}

function openEditWatch(id) { const w = watchCache.find(x => x.id === id); if (w) openWatchModal(w); }

async function deleteWatch(id) {
  if (!confirm('確定刪除？')) return;
  await supabase.from('watchlist').delete().eq('id', id).eq('user_id', currentUser.id);
  loadWatchlist();
}

document.getElementById('watch-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('watch-id').value;
  const payload = {
    user_id:     currentUser.id,
    symbol:      document.getElementById('w-symbol').value.toUpperCase(),
    market:      document.getElementById('w-market').value || 'TW',
    alert_price: document.getElementById('w-alert').value ? parseFloat(document.getElementById('w-alert').value) : null,
    note:        document.getElementById('w-note').value || null,
  };
  let error;
  if (id) ({ error } = await supabase.from('watchlist').update(payload).eq('id', id));
  else    ({ error } = await supabase.from('watchlist').insert(payload));
  if (error) { document.getElementById('watch-form-error').textContent = error.message; document.getElementById('watch-form-error').style.display = 'block'; return; }
  closeModal('watch-modal');
  loadWatchlist();
});

// ─── EXPENSES ───
let expensesCache = [];
async function loadExpenses() {
  const type = document.getElementById('filter-exp-type').value;
  const table = type === 'income' ? 'income' : 'expenses';
  const dateField = type === 'income' ? 'income_date' : 'expense_date';
  const { data } = await supabase.from(table).select('*').eq('user_id', currentUser.id).order(dateField, { ascending: false });
  expensesCache = data || [];
  const tbody = document.getElementById('expenses-tbody');
  if (!expensesCache.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">尚無記錄</td></tr>'; return; }
  tbody.innerHTML = expensesCache.map(ex => {
    const dateVal = ex.expense_date || ex.income_date;
    return `<tr>
      <td>${esc(dateVal)}</td>
      <td>${esc(ex.description || '—')}</td>
      <td class="pnl-${type === 'income' ? 'pos' : 'neg'}">${type === 'income' ? '+' : '-'}${fmt(ex.amount)}</td>
      <td>${esc(ex.currency || 'TWD')}</td>
      <td>${esc(ex.payment_method || ex.source || '—')}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteExpense('${ex.id}','${type}')">刪除</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('filter-exp-type').addEventListener('change', loadExpenses);

document.getElementById('new-expense-btn').addEventListener('click', () => {
  const type = document.getElementById('filter-exp-type').value;
  document.getElementById('exp-type').value = type;
  document.getElementById('expense-modal-title').textContent = type === 'income' ? '新增收入' : '新增支出';
  document.getElementById('exp-id').value   = '';
  document.getElementById('exp-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-currency').value = 'TWD';
  document.getElementById('exp-desc').value = '';
  document.getElementById('exp-form-error').style.display = 'none';
  document.getElementById('expense-modal').style.display = 'flex';
});

async function deleteExpense(id, type) {
  if (!confirm('確定刪除？')) return;
  const table = type === 'income' ? 'income' : 'expenses';
  await supabase.from(table).delete().eq('id', id).eq('user_id', currentUser.id);
  loadExpenses();
}

document.getElementById('expense-form').addEventListener('submit', async e => {
  e.preventDefault();
  const type  = document.getElementById('exp-type').value;
  const table = type === 'income' ? 'income' : 'expenses';
  const dateField = type === 'income' ? 'income_date' : 'expense_date';
  const payload = {
    user_id:     currentUser.id,
    amount:      parseFloat(document.getElementById('exp-amount').value),
    currency:    document.getElementById('exp-currency').value,
    description: document.getElementById('exp-desc').value,
    [dateField]: document.getElementById('exp-date').value,
  };
  const { error } = await supabase.from(table).insert(payload);
  if (error) { document.getElementById('exp-form-error').textContent = error.message; document.getElementById('exp-form-error').style.display = 'block'; return; }
  closeModal('expense-modal');
  loadExpenses();
});

// ─── MODAL CLOSE ───
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
});

// expose to inline onclick
window.openEditTrade   = openEditTrade;
window.deleteTrade     = deleteTrade;
window.openEditJournal = openEditJournal;
window.deleteJournal   = deleteJournal;
window.openEditWatch   = openEditWatch;
window.deleteWatch     = deleteWatch;
window.deleteExpense   = deleteExpense;
