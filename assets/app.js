'use strict';

// Wait for ESM module to expose createClient, then init
const sb = window.__supabaseCreateClient(
  'https://bynnmxospdnfnnlaqqzi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5bm5teG9zcGRuZm5ubGFxcXppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3ODI5ODQsImV4cCI6MjA5NzM1ODk4NH0.yA0XCwzE8z70p2qGs9s_1QdTDGUK0cOjdAnP9zp_6RM'
);

let currentUser = null;
let currentView = 'dashboard';
let fundsChartInstance = null;

// ─── THEME ───
(function(){
  const t = document.querySelector('[data-theme-toggle]');
  const r = document.documentElement;
  const d = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  r.setAttribute('data-theme', d);
  if(t) t.addEventListener('click', () => {
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
  try {
    if (authMode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) showAuthError(error.message);
    } else {
      const displayName = document.getElementById('display-name').value.trim();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { display_name: displayName } }
      });
      if (error) { showAuthError(error.message); return; }
      if (data.user && !data.session) showAuthError('✅ 請到信筱確認帳號後再登入。');
    }
  } catch(err) {
    showAuthError('連線錯誤：' + err.message);
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

sb.auth.onAuthStateChange((_event, session) => {
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

document.getElementById('logout-btn').addEventListener('click', () => sb.auth.signOut());

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
function fmt(n, decimals=0) {
  if (n == null) return '—';
  return Number(n).toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function pnlClass(n) { return n > 0 ? 'pnl-pos' : n < 0 ? 'pnl-neg' : ''; }
function esc(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }

// ─── DASHBOARD (記帳與圖表為核心) ───
async function loadDashboard() {
  const [ {data: trades}, {data: income}, {data: expenses} ] = await Promise.all([
    sb.from('trades').select('*').eq('user_id', currentUser.id),
    sb.from('income').select('*').eq('user_id', currentUser.id),
    sb.from('expenses').select('*').eq('user_id', currentUser.id)
  ]);

  const allTrades = trades || [];
  const allIncome = income || [];
  const allExpenses = expenses || [];

  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // 計算 KPI
  let totalIncome = 0; let monthIncome = 0;
  allIncome.forEach(i => {
    totalIncome += Number(i.amount);
    if(i.income_date.startsWith(currentMonthStr)) monthIncome += Number(i.amount);
  });

  let totalExpense = 0; let monthExpense = 0;
  allExpenses.forEach(e => {
    totalExpense += Number(e.amount);
    if(e.expense_date.startsWith(currentMonthStr)) monthExpense += Number(e.amount);
  });

  const closedTrades = allTrades.filter(t => t.status === 'CLOSED');
  const totalTradePnl = closedTrades.reduce((s, t) => s + Number(t.net_pnl || 0), 0);

  const totalBalance = totalIncome - totalExpense + totalTradePnl;

  document.getElementById('kpi-total-balance').textContent = fmt(totalBalance);
  document.getElementById('kpi-month-income').textContent = '+' + fmt(monthIncome);
  document.getElementById('kpi-month-expense').textContent = '-' + fmt(monthExpense);
  const pnlEl = document.getElementById('kpi-trade-pnl');
  pnlEl.textContent = (totalTradePnl >= 0 ? '+' : '') + fmt(totalTradePnl);
  pnlEl.className = 'kpi-value ' + pnlClass(totalTradePnl);

  // 渲染最近收支紀錄清單
  const combinedExpenses = [
    ...allIncome.map(x => ({...x, type: 'income', date: x.income_date})),
    ...allExpenses.map(x => ({...x, type: 'expense', date: x.expense_date}))
  ].sort((a,b) => new Date(a.date) - new Date(b.date));

  const recent = combinedExpenses.slice(-5).reverse();
  const container = document.getElementById('recent-expenses-table');

  if (!recent.length) {
    container.innerHTML = '<div class="empty-state"><p>尚無收支記錄</p></div>';
  } else {
    container.innerHTML = `<table><thead><tr><th>日期</th><th>描述</th><th>金額</th><th>類型</th></tr></thead><tbody>${
      recent.map(r => `<tr>
        <td>${esc(r.date)}</td>
        <td>${esc(r.description || '—')}</td>
        <td class="${r.type==='income'?'pnl-pos':'pnl-neg'}">${r.type==='income'?'+':'-'}${fmt(r.amount)}</td>
        <td><span class="badge ${r.type==='income'?'badge-long':'badge-short'}">${r.type==='income'?'收入':'支出'}</span></td>
      </tr>`).join('')
    }</tbody></table>`;
  }

  // 準備資金曲線圖資料
  const flowByDate = {};
  combinedExpenses.forEach(x => {
    if(!flowByDate[x.date]) flowByDate[x.date] = 0;
    flowByDate[x.date] += (x.type === 'income' ? Number(x.amount) : -Number(x.amount));
  });
  closedTrades.forEach(t => {
    if(!t.exit_date) return;
    if(!flowByDate[t.exit_date]) flowByDate[t.exit_date] = 0;
    flowByDate[t.exit_date] += Number(t.net_pnl || 0);
  });

  const sortedDates = Object.keys(flowByDate).sort((a,b) => new Date(a) - new Date(b));
  let runningBalance = 0;
  const chartLabels = [];
  const chartData = [];

  sortedDates.forEach(date => {
    runningBalance += flowByDate[date];
    chartLabels.push(date);
    chartData.push(runningBalance);
  });

  renderFundsChart(chartLabels, chartData);
}

// 繪製資金曲線圖 (Art Deco 配色)
function renderFundsChart(labels, data) {
  const ctx = document.getElementById('fundsChart');
  if(!ctx) return;
  if(fundsChartInstance) fundsChartInstance.destroy();

  if(labels.length === 0) {
    labels = [new Date().toISOString().slice(0,10)];
    data = [0];
  }

  fundsChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '累積總資產',
        data: data,
        borderColor: '#D4AF37',
        backgroundColor: 'rgba(212, 175, 55, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.2,
        pointBackgroundColor: '#0A0A0A',
        pointBorderColor: '#D4AF37',
        pointHoverBackgroundColor: '#D4AF37',
        pointHoverBorderColor: '#fff',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(212, 175, 55, 0.1)' },
          ticks: { color: '#F2F0E4', font: { family: 'Josefin Sans' } }
        },
        y: {
          grid: { color: 'rgba(212, 175, 55, 0.1)' },
          ticks: { color: '#F2F0E4', font: { family: 'Josefin Sans' } }
        }
      },
      plugins: {
        legend: { labels: { color: '#D4AF37', font: { family: 'Josefin Sans', size: 14 } } },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 20, 0.9)',
          titleFont: { family: 'Josefin Sans', size: 14 },
          bodyFont: { family: 'Josefin Sans', size: 14 },
          borderColor: '#D4AF37',
          borderWidth: 1
        }
      }
    }
  });
}

// ─── TRADES ───
let tradesCache = [];
async function loadTrades() {
  const statusFilter    = document.getElementById('filter-status').value;
  const directionFilter = document.getElementById('filter-direction').value;
  let q = sb.from('trades').select('*').eq('user_id', currentUser.id).order('entry_date', { ascending: false });
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
    <td>${esc(t.market||'TW')}</td>
    <td><span class="badge badge-${t.direction.toLowerCase()}">${t.direction}</span></td>
    <td><span class="badge badge-${t.status.toLowerCase()}">${t.status}</span></td>
    <td>${esc(t.entry_date)}</td>
    <td>${fmt(t.entry_price,2)}</td>
    <td>${fmt(t.entry_qty)}</td>
    <td>${t.exit_price!=null?fmt(t.exit_price,2):'—'}</td>
    <td class="${pnlClass(t.net_pnl)}">${t.net_pnl!=null?(Number(t.net_pnl)>=0?'+':'')+fmt(t.net_pnl):'—'}</td>
    <td>${t.rating?'★'.repeat(t.rating):'—'}</td>
    <td>
      <button class="btn btn-ghost btn-sm" onclick="window.openEditTrade('${t.id}')">編輯</button>
      <button class="btn btn-danger btn-sm" onclick="window.deleteTrade('${t.id}')">刪除</button>
    </td>
  </tr>`).join('');
}

document.getElementById('new-trade-btn').addEventListener('click', () => openTradeModal());

function openTradeModal(trade=null) {
  document.getElementById('trade-modal-title').textContent = trade ? '編輯交易' : '新增交易';
  document.getElementById('trade-id').value        = trade?.id || '';
  document.getElementById('t-symbol').value        = trade?.symbol || '';
  document.getElementById('t-market').value        = trade?.market || 'TW';
  document.getElementById('t-direction').value     = trade?.direction || 'LONG';
  document.getElementById('t-status').value        = trade?.status || 'OPEN';
  document.getElementById('t-entry-date').value    = trade?.entry_date || new Date().toISOString().slice(0,10);
  document.getElementById('t-entry-price').value   = trade?.entry_price || '';
  document.getElementById('t-entry-qty').value     = trade?.entry_qty || '';
  document.getElementById('t-entry-fee').value     = trade?.entry_fee || '0';
  document.getElementById('t-exit-date').value     = trade?.exit_date || '';
  document.getElementById('t-exit-price').value    = trade?.exit_price || '';
  document.getElementById('t-exit-qty').value      = trade?.exit_qty || '';
  document.getElementById('t-exit-fee').value      = trade?.exit_fee || '0';
  document.getElementById('t-stop-loss').value     = trade?.stop_loss || '';
  document.getElementById('t-take-profit').value   = trade?.take_profit || '';
  document.getElementById('t-rating').value        = trade?.rating || '';
  document.getElementById('t-thesis').value        = trade?.thesis || '';
  document.getElementById('t-mistakes').value      = trade?.mistakes || '';
  document.getElementById('t-lessons').value       = trade?.lessons || '';
  document.getElementById('trade-form-error').style.display = 'none';
  document.getElementById('trade-modal').style.display = 'flex';
}

window.openEditTrade = (id) => { const t = tradesCache.find(x => x.id === id); if(t) openTradeModal(t); };
window.deleteTrade   = async (id) => {
  if (!confirm('確定刪除這筆交易？')) return;
  await sb.from('trades').delete().eq('id', id).eq('user_id', currentUser.id);
  loadTrades();
};

document.getElementById('trade-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id  = document.getElementById('trade-id').value;
  const g   = (sel) => document.getElementById(sel)?.value || null;
  const payload = {
    user_id: currentUser.id,
    symbol: g('t-symbol')?.toUpperCase(),
    market: g('t-market') || 'TW',
    direction: g('t-direction'),
    status: g('t-status') || 'OPEN',
    entry_date: g('t-entry-date'),
    entry_price: parseFloat(g('t-entry-price')),
    entry_qty: parseFloat(g('t-entry-qty')),
    entry_fee: parseFloat(g('t-entry-fee') || '0'),
    exit_date: g('t-exit-date') || null,
    exit_price: g('t-exit-price') ? parseFloat(g('t-exit-price')) : null,
    exit_qty: g('t-exit-qty') ? parseFloat(g('t-exit-qty')) : null,
    exit_fee: parseFloat(g('t-exit-fee') || '0'),
    stop_loss: g('t-stop-loss') ? parseFloat(g('t-stop-loss')) : null,
    take_profit: g('t-take-profit') ? parseFloat(g('t-take-profit')) : null,
    rating: g('t-rating') ? parseInt(g('t-rating')) : null,
    thesis: g('t-thesis') || null,
    mistakes: g('t-mistakes') || null,
    lessons: g('t-lessons') || null,
  };
  if (payload.exit_price && payload.exit_qty) {
    const dir = payload.direction === 'LONG' ? 1 : -1;
    const gross = dir * (payload.exit_price - payload.entry_price) * payload.exit_qty;
    payload.gross_pnl = gross;
    payload.net_pnl   = gross - (payload.entry_fee||0) - (payload.exit_fee||0);
    if (payload.entry_price && payload.entry_qty)
      payload.pnl_pct = payload.net_pnl / (payload.entry_price * payload.entry_qty) * 100;
  }
  const { error } = id
    ? await sb.from('trades').update(payload).eq('id', id).eq('user_id', currentUser.id)
    : await sb.from('trades').insert(payload);
  if (error) { document.getElementById('trade-form-error').textContent = error.message; document.getElementById('trade-form-error').style.display='block'; return; }
  closeModal('trade-modal'); loadTrades();
  if (currentView === 'dashboard') loadDashboard();
});

// ─── JOURNAL ───
let journalCache = [];
async function loadJournal() {
  const { data } = await sb.from('journals').select('*').eq('user_id', currentUser.id).order('journal_date', { ascending: false });
  journalCache = data || [];
  const container = document.getElementById('journal-list');
  if (!journalCache.length) { container.innerHTML = '<div class="empty-state"><p>尚無日誌</p></div>'; return; }
  const biasLabel = { BULLISH:'多頭 📈', BEARISH:'空頭 📉', NEUTRAL:'中性 ➡️' };
  container.innerHTML = journalCache.map(j => `
    <div class="journal-entry">
      <div class="journal-entry-header">
        <div class="journal-meta">
          <span class="journal-date">${esc(j.journal_date)}</span>
          ${j.market_bias ? `<span class="badge">${biasLabel[j.market_bias]||j.market_bias}</span>` : ''}
          ${j.mood ? `<span class="badge">心情 ${j.mood}/5</span>` : ''}
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn-ghost btn-sm" onclick="window.openEditJournal('${j.id}')">編輯</button>
          <button class="btn btn-danger btn-sm" onclick="window.deleteJournal('${j.id}')">刪除</button>
        </div>
      </div>
      ${j.title ? `<div class="journal-title">${esc(j.title)}</div>` : ''}
      <div class="journal-content">${esc(j.content)}</div>
    </div>`).join('');
}

document.getElementById('new-journal-btn').addEventListener('click', () => openJournalModal());

function openJournalModal(journal=null) {
  document.getElementById('journal-modal-title').textContent = journal ? '編輯日誌' : '新增日誌';
  document.getElementById('journal-id').value  = journal?.id || '';
  document.getElementById('j-date').value      = journal?.journal_date || new Date().toISOString().slice(0,10);
  document.getElementById('j-mood').value      = journal?.mood || '';
  document.getElementById('j-bias').value      = journal?.market_bias || '';
  document.getElementById('j-title').value     = journal?.title || '';
  document.getElementById('j-content').value   = journal?.content || '';
  document.getElementById('journal-form-error').style.display = 'none';
  document.getElementById('journal-modal').style.display = 'flex';
}

window.openEditJournal = (id) => { const j = journalCache.find(x => x.id===id); if(j) openJournalModal(j); };
window.deleteJournal   = async (id) => {
  if (!confirm('確定刪除？')) return;
  await sb.from('journals').delete().eq('id', id).eq('user_id', currentUser.id);
  loadJournal();
};

document.getElementById('journal-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('journal-id').value;
  const payload = {
    user_id: currentUser.id,
    journal_date: document.getElementById('j-date').value,
    mood: document.getElementById('j-mood').value ? parseInt(document.getElementById('j-mood').value) : null,
    market_bias: document.getElementById('j-bias').value || null,
    title: document.getElementById('j-title').value || null,
    content: document.getElementById('j-content').value,
  };
  const { error } = id
    ? await sb.from('journals').update(payload).eq('id', id)
    : await sb.from('journals').insert(payload);
  if (error) { document.getElementById('journal-form-error').textContent = error.message; document.getElementById('journal-form-error').style.display='block'; return; }
  closeModal('journal-modal'); loadJournal();
});

// ─── WATCHLIST ───
let watchCache = [];
async function loadWatchlist() {
  const { data } = await sb.from('watchlist').select('*').eq('user_id', currentUser.id).order('added_at', { ascending: false });
  watchCache = data || [];
  const tbody = document.getElementById('watchlist-tbody');
  if (!watchCache.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">尚無觀察標的</td></tr>'; return; }
  tbody.innerHTML = watchCache.map(w => `<tr>
    <td><strong>${esc(w.symbol)}</strong></td>
    <td>${esc(w.market||'TW')}</td>
    <td>${w.alert_price!=null?fmt(w.alert_price,2):'—'}</td>
    <td>${esc(w.note||'—')}</td>
    <td>${new Date(w.added_at).toLocaleDateString('zh-TW')}</td>
    <td>
      <button class="btn btn-ghost btn-sm" onclick="window.openEditWatch('${w.id}')">編輯</button>
      <button class="btn btn-danger btn-sm" onclick="window.deleteWatch('${w.id}')">刪除</button>
    </td>
  </tr>`).join('');
}

document.getElementById('new-watch-btn').addEventListener('click', () => openWatchModal());

function openWatchModal(watch=null) {
  document.getElementById('watch-id').value    = watch?.id || '';
  document.getElementById('w-symbol').value    = watch?.symbol || '';
  document.getElementById('w-market').value    = watch?.market || 'TW';
  document.getElementById('w-alert').value     = watch?.alert_price || '';
  document.getElementById('w-note').value      = watch?.note || '';
  document.getElementById('watch-form-error').style.display = 'none';
  document.getElementById('watch-modal').style.display = 'flex';
}

window.openEditWatch = (id) => { const w = watchCache.find(x => x.id===id); if(w) openWatchModal(w); };
window.deleteWatch   = async (id) => {
  if (!confirm('確定刪除？')) return;
  await sb.from('watchlist').delete().eq('id', id).eq('user_id', currentUser.id);
  loadWatchlist();
};

document.getElementById('watch-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('watch-id').value;
  const payload = {
    user_id: currentUser.id,
    symbol: document.getElementById('w-symbol').value.toUpperCase(),
    market: document.getElementById('w-market').value || 'TW',
    alert_price: document.getElementById('w-alert').value ? parseFloat(document.getElementById('w-alert').value) : null,
    note: document.getElementById('w-note').value || null,
  };
  const { error } = id
    ? await sb.from('watchlist').update(payload).eq('id', id)
    : await sb.from('watchlist').insert(payload);
  if (error) { document.getElementById('watch-form-error').textContent = error.message; document.getElementById('watch-form-error').style.display='block'; return; }
  closeModal('watch-modal'); loadWatchlist();
});

// ─── EXPENSES ───
let expensesCache = [];
async function loadExpenses() {
  const type = document.getElementById('filter-exp-type').value;
  const table = type === 'income' ? 'income' : 'expenses';
  const dateField = type === 'income' ? 'income_date' : 'expense_date';
  const { data } = await sb.from(table).select('*').eq('user_id', currentUser.id).order(dateField, { ascending: false });
  expensesCache = data || [];
  const tbody = document.getElementById('expenses-tbody');
  if (!expensesCache.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">尚無記錄</td></tr>'; return; }
  tbody.innerHTML = expensesCache.map(e => `<tr>
    <td>${esc(e[dateField])}</td>
    <td>${esc(e.description||'—')}</td>
    <td class="${type==='income'?'pnl-pos':'pnl-neg'}">${type==='income'?'+':'-'}${fmt(e.amount)}</td>
    <td>${esc(e.currency||'TWD')}</td>
    <td>${esc(e.payment_method||'—')}</td>
    <td>
      <button class="btn btn-ghost btn-sm" onclick="window.openEditExpense('${e.id}')">編輯</button>
      <button class="btn btn-danger btn-sm" onclick="window.deleteExpense('${e.id}')">刪除</button>
    </td>
  </tr>`).join('');
}

document.getElementById('filter-exp-type').addEventListener('change', loadExpenses);
document.getElementById('new-expense-btn').addEventListener('click', () => openExpenseModal());

// ─── EXPENSE MODAL TYPE TABS ───
document.querySelectorAll('.exp-type-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const selected = tab.dataset.expTab;
    document.querySelectorAll('.exp-type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('exp-type').value = selected;
    // 更新 modal 標題
    const isEdit = !!document.getElementById('exp-id').value;
    document.getElementById('expense-modal-title').textContent =
      isEdit ? (selected === 'income' ? '編輯收入' : '編輯支出')
             : (selected === 'income' ? '新增收入' : '新增支出');
  });
});

function setExpTypeTab(type) {
  document.querySelectorAll('.exp-type-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.expTab === type);
  });
  document.getElementById('exp-type').value = type;
}

function openExpenseModal(expense=null, forceType=null) {
  // 決定類型：編輯時用資料本身的類型，新增時沿用外部 filter 或強制指定
  const type = forceType ||
    (expense ? (expense._type || document.getElementById('filter-exp-type').value) : document.getElementById('filter-exp-type').value);
  const dateField = type === 'income' ? 'income_date' : 'expense_date';

  document.getElementById('expense-modal-title').textContent =
    expense ? (type === 'income' ? '編輯收入' : '編輯支出') : (type === 'income' ? '新增收入' : '新增支出');

  setExpTypeTab(type);
  document.getElementById('exp-id').value       = expense?.id || '';
  document.getElementById('exp-date').value     = expense?.[dateField] || new Date().toISOString().slice(0,10);
  document.getElementById('exp-amount').value   = expense?.amount || '';
  document.getElementById('exp-currency').value = expense?.currency || 'TWD';
  document.getElementById('exp-desc').value     = expense?.description || '';
  document.getElementById('exp-payment').value  = expense?.payment_method || 'CASH';
  document.getElementById('exp-form-error').style.display = 'none';
  document.getElementById('expense-modal').style.display = 'flex';
}

window.openEditExpense = (id) => {
  const e = expensesCache.find(x => x.id === id);
  if (e) openExpenseModal(e);
};

window.deleteExpense = async (id) => {
  if (!confirm('確定刪除？')) return;
  const type = document.getElementById('filter-exp-type').value;
  const table = type === 'income' ? 'income' : 'expenses';
  await sb.from(table).delete().eq('id', id).eq('user_id', currentUser.id);
  loadExpenses();
};

document.getElementById('expense-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id   = document.getElementById('exp-id').value;
  const type = document.getElementById('exp-type').value;
  const table = type === 'income' ? 'income' : 'expenses';
  const dateField = type === 'income' ? 'income_date' : 'expense_date';
  const payload = {
    user_id: currentUser.id,
    [dateField]: document.getElementById('exp-date').value,
    amount: parseFloat(document.getElementById('exp-amount').value),
    currency: document.getElementById('exp-currency').value || 'TWD',
    description: document.getElementById('exp-desc').value,
    payment_method: document.getElementById('exp-payment').value || 'CASH',
  };
  const { error } = id
    ? await sb.from(table).update(payload).eq('id', id).eq('user_id', currentUser.id)
    : await sb.from(table).insert(payload);
  if (error) { document.getElementById('exp-form-error').textContent = error.message; document.getElementById('exp-form-error').style.display='block'; return; }
  closeModal('expense-modal'); loadExpenses();
  if (currentView === 'dashboard') loadDashboard();
});

// ─── MODAL CLOSE ───
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if(e.target === overlay) closeModal(overlay.id); });
});
