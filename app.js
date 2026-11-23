/**
 * ============================================================================
 * YUNAKO AUDIT & TASK HUB - FRONTEND CONTROLLER (v2.0 - +Activity Trial Report)
 * Author: Yugi Nuralam Khoirulloh
 * ============================================================================
 */

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx0mlXgYPulfBSUajkdR2zlzzce1MUlCcawzBf8Ize6PwP-PoyaxDkBYjYAbk5JNiU/exec';

const STATE = {
  user: null,
  currentRoute: 'dashboard',
  activeAuditId: null,
  activeTrialId: null,
  trialFilter: 'ALL',
  trialFlowDraft: [],
  trialPhotoData: null,
  data: {
    users: [],
    schedules: [],
    tasks: [],
    audits: [],
    checklistItems: [],
    capas: [],
    trialReports: [],
    notifications: []
  },
  isLoading: false
};

/* ============================================================================
 * 1. INITIALIZATION & THEME
 * ============================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  bindGlobalEvents();
  checkExistingSession();
  lucide.createIcons();
});

function initTheme() {
  const savedTheme = localStorage.getItem('yunako_theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('yunako_theme', isDark ? 'dark' : 'light');
}

function bindGlobalEvents() {
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('toggle-pass-btn').addEventListener('click', () => {
    const inp = document.getElementById('login-password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
  document.getElementById('refresh-data-btn').addEventListener('click', () => fetchBootstrapData(true));
  document.getElementById('desktop-logout-btn').addEventListener('click', logoutUser);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('notif-btn').addEventListener('click', openNotificationsModal);

  document.querySelectorAll('.nav-btn, .nav-btn-mobile').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.getAttribute('data-nav');
      navigateTo(route);
    });
  });
}

/* ============================================================================
 * 2. API CLIENT & OFFLINE CACHE
 * ============================================================================ */

async function callGasApi(action, payload = {}) {
  if (GAS_WEB_APP_URL.includes('GANTI_DENGAN_DEPLOYMENT_ID_ANDA')) {
    throw new Error('URL GAS_WEB_APP_URL di app.js belum diisi dengan URL Web App Anda.');
  }
  const body = JSON.stringify({
    action,
    user: STATE.user,
    ...payload
  });

  const response = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body
  });

  if (!response.ok) {
    throw new Error('Gagal terhubung ke server GAS (' + response.status + ')');
  }
  const result = await response.json();
  if (result.status === 'error') {
    throw new Error(result.message || 'Terjadi kesalahan pada server.');
  }
  return result;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-slate-900 text-white dark:bg-blue-600'
  };
  const el = document.createElement('div');
  el.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-xs font-medium flex items-center justify-between gap-3 transition-all ${colors[type] || colors.info}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

/* ============================================================================
 * 3. SESSION & AUTHENTICATION
 * ============================================================================ */

function checkExistingSession() {
  const savedUser = sessionStorage.getItem('yunako_user');
  if (savedUser) {
    STATE.user = JSON.parse(savedUser);
    enterAppShell();
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('login-submit-btn');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  btn.disabled = true;
  btn.innerHTML = `<span>Memverifikasi...</span>`;

  try {
    const res = await callGasApi('login', { username, password });
    STATE.user = res.user;
    sessionStorage.setItem('yunako_user', JSON.stringify(res.user));
    showToast('Selamat datang, ' + res.user.Nama_Lengkap, 'success');
    enterAppShell();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Masuk ke Aplikasi</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
    lucide.createIcons();
  }
}

function enterAppShell() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  const u = STATE.user;
  document.getElementById('sidebar-user-name').textContent = u.Nama_Lengkap;
  document.getElementById('sidebar-user-role').textContent = `${u.Role} • ${u.Departemen}`;
  document.getElementById('sidebar-avatar').textContent = u.Nama_Lengkap.slice(0, 2).toUpperCase();

  const cachedData = localStorage.getItem('yunako_cache_data');
  if (cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      STATE.data = { ...STATE.data, ...parsed };
      renderCurrentRoute();
    } catch (e) {}
  }

  fetchBootstrapData(false);
}

function logoutUser() {
  sessionStorage.removeItem('yunako_user');
  STATE.user = null;
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  showToast('Anda telah keluar dari sesi.', 'info');
}

async function fetchBootstrapData(showNotif = false) {
  const syncText = document.getElementById('sync-status-text');
  syncText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block"></span> Menyinkronkan...`;

  try {
    const res = await callGasApi('getBootstrapData');
    STATE.data = { ...STATE.data, ...res.data };
    localStorage.setItem('yunako_cache_data', JSON.stringify(STATE.data));
    updateNotificationBadge();
    renderCurrentRoute();
    syncText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> Tersinkronisasi`;
    if (showNotif) showToast('Data berhasil diperbarui.', 'success');
  } catch (err) {
    syncText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"></span> Mode Offline`;
    showToast(err.message, 'error');
  }
}

function updateNotificationBadge() {
  const unread = (STATE.data.notifications || []).filter(n =>
    String(n.Is_Read).toUpperCase() !== 'TRUE' &&
    (n.User_ID === STATE.user.User_ID || n.User_ID === 'ALL')
  );
  const badge = document.getElementById('notif-badge');
  if (unread.length > 0) {
    badge.textContent = unread.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ============================================================================
 * 4. NAVIGATION ROUTER
 * ============================================================================ */

function navigateTo(route) {
  STATE.currentRoute = route;
  if (route !== 'audit') STATE.activeAuditId = null;
  if (route !== 'trial') STATE.activeTrialId = null;

  const titles = {
    dashboard: 'Dashboard Operasional',
    schedule: 'Schedule & Agenda',
    tasks: 'Task Manager',
    audit: 'Quality Audit Center',
    trial: 'Activity Trial Report',
    capa: 'CAPA & Tindak Lanjut Temuan',
    settings: 'Pengaturan & Profil'
  };
  document.getElementById('page-title').textContent = titles[route] || 'Dashboard';

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const active = btn.getAttribute('data-nav') === route;
    btn.className = active
      ? 'nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition bg-blue-800 text-white shadow-xs'
      : 'nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-blue-100 hover:bg-blue-800/60 transition';
  });

  document.querySelectorAll('.nav-btn-mobile').forEach(btn => {
    const active = btn.getAttribute('data-nav') === route;
    btn.className = active
      ? 'nav-btn-mobile flex flex-col items-center justify-center flex-1 py-1 text-blue-600 dark:text-blue-400 font-semibold'
      : 'nav-btn-mobile flex flex-col items-center justify-center flex-1 py-1 text-slate-500 dark:text-slate-400';
  });

  renderCurrentRoute();
}

function renderCurrentRoute() {
  const main = document.getElementById('main-content');
  switch (STATE.currentRoute) {
    case 'dashboard': renderDashboard(main); break;
    case 'schedule': renderSchedule(main); break;
    case 'tasks': renderTasks(main); break;
    case 'audit':
      if (STATE.activeAuditId) renderAuditExecution(main, STATE.activeAuditId);
      else renderAuditList(main);
      break;
    case 'trial':
      if (STATE.activeTrialId) renderTrialDetail(main, STATE.activeTrialId);
      else renderTrialList(main);
      break;
    case 'capa': renderCapa(main); break;
    case 'settings': renderSettings(main); break;
  }
  lucide.createIcons();
}

/* ============================================================================
 * 5. VIEW: DASHBOARD
 * ============================================================================ */

function renderDashboard(container) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const schedulesToday = STATE.data.schedules.filter(s => s.Tanggal_Mulai === todayStr);
  const openTasks = STATE.data.tasks.filter(t => t.Status !== 'Done');
  const openCapas = STATE.data.capas.filter(c => c.Status_CAPA !== 'Verified');
  const trials = STATE.data.trialReports || [];

  const completedAudits = STATE.data.audits.filter(a => a.Status_Audit === 'Completed');
  const avgScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((acc, a) => acc + Number(a.Score_Persen || 0), 0) / completedAudits.length)
    : 100;

  container.innerHTML = `
    <!-- KPI CARDS -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
      <div class="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span class="text-xs font-medium">Agenda Hari Ini</span>
          <i data-lucide="calendar" class="w-4 h-4 text-blue-600"></i>
        </div>
        <p class="text-2xl font-bold tabular-nums">${schedulesToday.length}</p>
        <p class="text-[11px] text-slate-400 mt-1">Total ${STATE.data.schedules.length} jadwal</p>
      </div>

      <div class="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span class="text-xs font-medium">Tugas Aktif</span>
          <i data-lucide="list-todo" class="w-4 h-4 text-amber-500"></i>
        </div>
        <p class="text-2xl font-bold tabular-nums">${openTasks.length}</p>
        <p class="text-[11px] text-slate-400 mt-1">${STATE.data.tasks.filter(t => t.Status === 'Done').length} tugas selesai</p>
      </div>

      <div class="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span class="text-xs font-medium">Skor Audit</span>
          <i data-lucide="award" class="w-4 h-4 text-emerald-600"></i>
        </div>
        <p class="text-2xl font-bold tabular-nums">${avgScore}%</p>
        <p class="text-[11px] text-slate-400 mt-1">${completedAudits.length} sesi selesai</p>
      </div>

      <div class="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span class="text-xs font-medium">Trial Report</span>
          <i data-lucide="flask-conical" class="w-4 h-4 text-indigo-600"></i>
        </div>
        <p class="text-2xl font-bold tabular-nums">${trials.length}</p>
        <p class="text-[11px] text-slate-400 mt-1">${trials.filter(t => t.Hasil_Inspeksi_Status === 'OK').length} hasil OK</p>
      </div>

      <div class="col-span-2 lg:col-span-1 bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1.5">
          <span class="text-xs font-medium">CAPA Open</span>
          <i data-lucide="alert-circle" class="w-4 h-4 text-red-600"></i>
        </div>
        <p class="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">${openCapas.length}</p>
        <p class="text-[11px] text-slate-400 mt-1">Perlu verifikasi</p>
      </div>
    </div>

    <!-- QUICK ACTIONS -->
    <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Aksi Cepat Lapangan</h3>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button onclick="openTrialModal()" class="flex items-center gap-2.5 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 font-semibold text-xs transition">
          <i data-lucide="flask-conical" class="w-4 h-4"></i> + Trial Report
        </button>
        <button onclick="openScheduleModal()" class="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 font-semibold text-xs transition">
          <i data-lucide="calendar-plus" class="w-4 h-4"></i> + Jadwal Baru
        </button>
        <button onclick="openTaskModal()" class="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-semibold text-xs transition">
          <i data-lucide="plus-circle" class="w-4 h-4"></i> + Tambah Tugas
        </button>
        <button onclick="openNewAuditModal()" class="flex items-center gap-2.5 p-3 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 hover:bg-purple-100 font-semibold text-xs transition">
          <i data-lucide="clipboard-plus" class="w-4 h-4"></i> + Mulai Audit
        </button>
        <button onclick="navigateTo('capa')" class="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 font-semibold text-xs transition">
          <i data-lucide="shield-alert" class="w-4 h-4"></i> Cek CAPA
        </button>
      </div>
    </div>

    <!-- TWO COLUMN SUMMARY -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm">Activity Trial Report Terbaru</h3>
          <button onclick="navigateTo('trial')" class="text-xs text-blue-600 font-semibold hover:underline">Lihat Semua</button>
        </div>
        <div class="space-y-3">
          ${trials.slice(-4).reverse().map(tr => `
            <div onclick="openTrialDetail('${tr.Trial_ID}')" class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 cursor-pointer hover:border-blue-400 transition">
              <div class="min-w-0">
                <p class="font-semibold text-xs truncate">${escapeHtml(tr.Nama_Trial)}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${escapeHtml(tr.Item_Trial)} • Lot: ${escapeHtml(tr.No_Lot)} • ${escapeHtml(tr.Tanggal_Trial)}</p>
              </div>
              ${renderTrialResultBadge(tr.Hasil_Inspeksi_Status)}
            </div>
          `).join('') || '<p class="text-xs text-slate-400 py-4 text-center">Belum ada laporan trial tersimpan.</p>'}
        </div>
      </div>

      <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm">Tugas Prioritas & Tenggat Terdekat</h3>
          <button onclick="navigateTo('tasks')" class="text-xs text-blue-600 font-semibold hover:underline">Lihat Semua</button>
        </div>
        <div class="space-y-3">
          ${openTasks.slice(0, 4).map(t => `
            <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold text-xs truncate">${escapeHtml(t.Judul_Tugas)}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">Deadline: ${escapeHtml(t.Deadline || '-')} • PIC: ${getUserName(t.Assignee_User_ID)}</p>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${t.Prioritas === 'High' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">
                ${escapeHtml(t.Prioritas)}
              </span>
            </div>
          `).join('') || '<p class="text-xs text-slate-400 py-4 text-center">Semua tugas telah selesai.</p>'}
        </div>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 6. VIEW: ACTIVITY TRIAL REPORT (LIST, DETAIL & FLOW BUILDER)
 * ============================================================================ */

function renderTrialResultBadge(status) {
  const s = String(status || 'OK').toUpperCase();
  if (s === 'OK') {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 shrink-0">✓ OK</span>`;
  }
  if (s === 'NG') {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 shrink-0">✕ NG</span>`;
  }
  return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 shrink-0">⚠ CONDITIONAL</span>`;
}

function parseFlowJson(rawJson) {
  if (!rawJson) return [];
  if (Array.isArray(rawJson)) return rawJson;
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function renderTrialList(container) {
  const canEdit = STATE.user.Role === 'Admin' || STATE.user.Role === 'Auditor';
  const allTrials = (STATE.data.trialReports || []).slice().reverse();
  const filtered = STATE.trialFilter === 'ALL'
    ? allTrials
    : allTrials.filter(t => String(t.Hasil_Inspeksi_Status).toUpperCase() === STATE.trialFilter);

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        ${['ALL', 'OK', 'NG', 'CONDITIONAL'].map(f => `
          <button onclick="setTrialFilter('${f}')" class="px-3 py-1.5 rounded-xl text-xs font-semibold transition ${STATE.trialFilter === f ? 'bg-[#1E3A8A] text-white' : 'bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700'}">
            ${f === 'ALL' ? 'Semua (' + allTrials.length + ')' : f}
          </button>
        `).join('')}
      </div>
      ${canEdit ? `
        <button onclick="openTrialModal()" class="px-4 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 self-start shadow-xs">
          <i data-lucide="plus" class="w-4 h-4"></i> Buat Trial Report Baru
        </button>
      ` : ''}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${filtered.map(tr => {
        const steps = parseFlowJson(tr.Flow_Trial_JSON);
        const trialAreas = steps.filter(s => s.isTrialArea).map(s => s.step).join(', ') || 'Belum ditandai';
        return `
          <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4 hover:border-blue-400 transition">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">${escapeHtml(tr.Trial_ID)}</span>
                <div class="flex items-center gap-1.5">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-semibold ${tr.Status_Trial === 'Draft' ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-800'}">${escapeHtml(tr.Status_Trial || 'Final')}</span>
                  ${renderTrialResultBadge(tr.Hasil_Inspeksi_Status)}
                </div>
              </div>
              <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(tr.Nama_Trial)}</h4>
              <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(tr.Tujuan_Trial)}</p>

              <div class="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px]">
                <div><span class="text-slate-400 block">Item Trial:</span><span class="font-semibold">${escapeHtml(tr.Item_Trial)}</span></div>
                <div><span class="text-slate-400 block">No. Lot / Qty:</span><span class="font-semibold">${escapeHtml(tr.No_Lot)} (${escapeHtml(tr.Qty)})</span></div>
                <div class="col-span-2 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                  <span class="text-slate-400">📍 Area Trial:</span>
                  <span class="font-bold text-red-600 dark:text-red-400">${escapeHtml(trialAreas)}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <span class="text-[11px] text-slate-400">Tgl: ${escapeHtml(tr.Tanggal_Trial)} • OK: ${tr.Qty_OK || 0} / NG: ${tr.Qty_NG || 0}</span>
              <div class="flex items-center gap-2">
                ${canEdit ? `
                  <button onclick="openTrialModal('${tr.Trial_ID}')" class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium">
                    Edit
                  </button>
                ` : ''}
                <button onclick="openTrialDetail('${tr.Trial_ID}')" class="px-3 py-1.5 rounded-lg bg-[#1E3A8A] text-white text-xs font-semibold hover:bg-blue-800">
                  Lihat Laporan
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('') || '<div class="col-span-full bg-white dark:bg-[#1E293B] p-10 rounded-2xl text-center text-xs text-slate-400">Belum ada Activity Trial Report. Klik tombol "+ Buat Trial Report Baru" untuk mulai mencatat.</div>'}
    </div>
  `;
}

function setTrialFilter(filterVal) {
  STATE.trialFilter = filterVal;
  renderCurrentRoute();
}

function openTrialDetail(trialId) {
  STATE.activeTrialId = trialId;
  renderCurrentRoute();
}

function renderTrialDetail(container, trialId) {
  const tr = (STATE.data.trialReports || []).find(t => t.Trial_ID === trialId);
  if (!tr) {
    STATE.activeTrialId = null;
    return renderTrialList(container);
  }

  const steps = parseFlowJson(tr.Flow_Trial_JSON);
  const canEdit = STATE.user.Role === 'Admin' || STATE.user.Role === 'Auditor';

  container.innerHTML = `
    <!-- TOOLBAR AKSI -->
    <div class="flex flex-wrap items-center justify-between gap-3 no-print">
      <button onclick="openTrialDetail(null)" class="text-xs font-semibold text-blue-600 flex items-center gap-1 hover:underline">
        <i data-lucide="arrow-left" class="w-4 h-4"></i> Kembali ke Daftar Trial
      </button>
      <div class="flex flex-wrap items-center gap-2">
        ${canEdit ? `
          <button onclick="openTrialModal('${tr.Trial_ID}')" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Edit Report
          </button>
          <button onclick="deleteTrialReport('${tr.Trial_ID}')" class="px-3 py-2 rounded-xl border border-red-200 text-red-600 bg-red-50/50 text-xs font-semibold flex items-center gap-1.5 hover:bg-red-100">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Hapus
          </button>
        ` : ''}
        <button onclick="window.print()" class="px-4 py-2 rounded-xl bg-[#1E3A8A] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-blue-800 shadow-xs">
          <i data-lucide="printer" class="w-3.5 h-3.5"></i> Cetak / Export PDF
        </button>
      </div>
    </div>

    <!-- DOKUMEN LAPORAN TRIAL (PRINT-READY) -->
    <article class="bg-white dark:bg-[#1E293B] p-6 lg:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6 print-only-clean">
      <!-- KOP DOKUMEN -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b-2 border-[#1E3A8A]">
        <div>
          <span class="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">YUNAKO QUALITY & ENGINEERING REPORT</span>
          <h3 class="text-xl font-bold text-slate-900 dark:text-white mt-1">${escapeHtml(tr.Nama_Trial)}</h3>
          <p class="text-xs text-slate-500 mt-1">Dibuat oleh: ${getUserName(tr.Created_By)} • Status: ${escapeHtml(tr.Status_Trial || 'Final')}</p>
        </div>
        <div class="sm:text-right">
          <span class="font-mono text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 block mb-1.5">${escapeHtml(tr.Trial_ID)}</span>
          ${renderTrialResultBadge(tr.Hasil_Inspeksi_Status)}
        </div>
      </div>

      <!-- TUJUAN TRIAL -->
      <div class="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900">
        <p class="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-1">Tujuan Trial</p>
        <p class="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">${escapeHtml(tr.Tujuan_Trial || '-')}</p>
      </div>

      <!-- IDENTITAS LOT & SAMPEL -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
          <span class="text-[11px] text-slate-400 block">Tanggal Trial</span>
          <span class="text-sm font-bold tabular-nums">${escapeHtml(tr.Tanggal_Trial || '-')}</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
          <span class="text-[11px] text-slate-400 block">Item / Part Trial</span>
          <span class="text-sm font-bold">${escapeHtml(tr.Item_Trial || '-')}</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
          <span class="text-[11px] text-slate-400 block">Nomor Lot</span>
          <span class="text-sm font-bold font-mono">${escapeHtml(tr.No_Lot || '-')}</span>
        </div>
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800">
          <span class="text-[11px] text-slate-400 block">Qty Sampel Trial</span>
          <span class="text-sm font-bold tabular-nums">${escapeHtml(tr.Qty || '-')}</span>
        </div>
      </div>

      <!-- FLOW PROSES, PARAMETER LARUTAN & PENANDA AREA TRIAL -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Flow Proses, Parameter Larutan & Titik Area Trial</h4>
          <span class="text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
            <span class="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span> Area yang Ditandai Trial
          </span>
        </div>

        <div class="flex flex-wrap items-stretch gap-2.5">
          ${steps.map((st, idx) => `
            <div class="flex items-center gap-2">
              <div class="w-48 sm:w-52 p-3.5 rounded-xl border-2 transition ${st.isTrialArea
                ? 'border-red-500 bg-red-50/80 dark:bg-red-950/30 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50'}">
                <div class="flex items-center justify-between gap-1 mb-1">
                  <span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${st.isTrialArea ? 'bg-red-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">
                    ${st.isTrialArea ? '📍 AREA TRIAL' : 'Proses #' + (idx + 1)}
                  </span>
                </div>
                <p class="font-bold text-xs text-slate-900 dark:text-white mt-1">${idx + 1}. ${escapeHtml(st.step)}</p>
                <div class="mt-2 pt-2 border-t ${st.isTrialArea ? 'border-red-200 dark:border-red-800' : 'border-slate-200 dark:border-slate-800'}">
                  <span class="text-[10px] text-slate-400 block">Parameter / Konsentrasi:</span>
                  <p class="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5 whitespace-pre-line">${escapeHtml(st.parameter || '-')}</p>
                </div>
              </div>
              ${idx < steps.length - 1 ? `<i data-lucide="arrow-right" class="w-5 h-5 text-slate-400 shrink-0"></i>` : ''}
            </div>
          `).join('') || '<p class="text-xs text-slate-400">Tidak ada data flow proses.</p>'}
        </div>
      </div>

      <!-- HASIL INSPEKSI VISUAL & BUKTI FOTO -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Hasil Inspeksi Visual & Pengukuran</h4>
            ${renderTrialResultBadge(tr.Hasil_Inspeksi_Status)}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
              <span class="text-[11px] text-emerald-700 dark:text-emerald-300 block">Jumlah OK</span>
              <span class="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">${tr.Qty_OK || 0} pcs</span>
            </div>
            <div class="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900">
              <span class="text-[11px] text-red-700 dark:text-red-300 block">Jumlah NG</span>
              <span class="text-lg font-bold text-red-700 dark:text-red-400 tabular-nums">${tr.Qty_NG || 0} pcs</span>
            </div>
          </div>
          <div>
            <span class="text-[11px] font-semibold text-slate-400 block mb-1">Catatan / Temuan Inspeksi:</span>
            <p class="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line">${escapeHtml(tr.Detail_Hasil_Inspeksi || '-')}</p>
          </div>
        </div>

        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">Dokumentasi Foto Hasil Trial</h4>
          ${tr.Bukti_Foto_URL ? `
            <div class="space-y-2">
              <img src="${escapeHtml(tr.Bukti_Foto_URL)}" alt="Bukti Hasil Trial" class="w-full max-h-56 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900" />
              <a href="${escapeHtml(tr.Bukti_Foto_URL)}" target="_blank" class="text-[11px] text-blue-600 font-semibold hover:underline inline-flex items-center gap-1 no-print">
                <i data-lucide="external-link" class="w-3 h-3"></i> Buka Foto Resolusi Penuh di Google Drive
              </a>
            </div>
          ` : `
            <div class="flex-1 flex items-center justify-center p-6 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-400">
              Tidak ada lampiran foto pada laporan trial ini.
            </div>
          `}
        </div>
      </div>

      <!-- KESIMPULAN & NEXT TRIAL -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">Kesimpulan Trial</h4>
          <p class="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">${escapeHtml(tr.Kesimpulan_Trial || '-')}</p>
        </div>
        <div class="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          <h4 class="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1.5">Next Trial / Rencana Tindak Lanjut</h4>
          <p class="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed">${escapeHtml(tr.Next_Trial || '-')}</p>
        </div>
      </div>
    </article>
  `;
}

function openTrialModal(trialId = null) {
  const existing = trialId ? (STATE.data.trialReports || []).find(t => t.Trial_ID === trialId) : null;
  STATE.trialPhotoData = null;

  if (existing) {
    STATE.trialFlowDraft = parseFlowJson(existing.Flow_Trial_JSON);
  } else {
    STATE.trialFlowDraft = [
      { step: 'Degreasing', parameter: '', isTrialArea: false },
      { step: 'Pickling', parameter: '', isTrialArea: true },
      { step: 'Plating', parameter: '', isTrialArea: false }
    ];
  }

  const today = new Date().toISOString().slice(0, 10);

  openModal(existing ? 'Edit Activity Trial Report' : 'Buat Activity Trial Report Baru', `
    <form id="trial-form" class="space-y-4">
      <input type="hidden" id="trl-id" value="${existing ? escapeHtml(existing.Trial_ID) : ''}" />

      <div>
        <label class="block text-xs font-semibold mb-1">Nama Trial *</label>
        <input type="text" id="trl-nama" required value="${existing ? escapeHtml(existing.Nama_Trial) : ''}"
          placeholder="Contoh: Trial Optimasi Konsentrasi Pickling HCl"
          class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
      </div>

      <div>
        <label class="block text-xs font-semibold mb-1">Tujuan Trial *</label>
        <textarea id="trl-tujuan" rows="2" required placeholder="Jelaskan target kualitas / masalah yang ingin diselesaikan..."
          class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${existing ? escapeHtml(existing.Tujuan_Trial) : ''}</textarea>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label class="block text-xs font-semibold mb-1">Tanggal Trial *</label>
          <input type="date" id="trl-tgl" required value="${existing ? escapeHtml(existing.Tanggal_Trial) : today}"
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Item / Part Trial *</label>
          <input type="text" id="trl-item" required value="${existing ? escapeHtml(existing.Item_Trial) : ''}"
            placeholder="Self Lock Nut M8"
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">No. Lot *</label>
          <input type="text" id="trl-lot" required value="${existing ? escapeHtml(existing.No_Lot) : ''}"
            placeholder="LOT-2611-01"
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Qty Sampel *</label>
          <input type="text" id="trl-qty" required value="${existing ? escapeHtml(existing.Qty) : ''}"
            placeholder="300 pcs"
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
      </div>

      <!-- FLOW TRIAL BUILDER -->
      <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <label class="block text-xs font-bold text-slate-800 dark:text-white">Flow Trial & Parameter Larutan per Proses</label>
            <p class="text-[11px] text-slate-500">Isi urutan proses, konsentrasi/parameter larutan, dan klik tombol <b>Area Trial</b> pada titik yang diuji.</p>
          </div>
          <div class="flex gap-1.5">
            <button type="button" onclick="applyPlatingPreset()" class="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[11px] font-semibold hover:bg-blue-200">
              Preset Plating
            </button>
            <button type="button" onclick="addTrialFlowStep()" class="px-2.5 py-1 rounded-lg bg-[#1E3A8A] text-white text-[11px] font-semibold hover:bg-blue-800">
              + Proses
            </button>
          </div>
        </div>

        <div id="flow-steps-container" class="space-y-2"></div>
      </div>

      <!-- HASIL INSPEKSI VISUAL -->
      <div class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <label class="block text-xs font-bold text-slate-800 dark:text-white">Hasil Inspeksi Visual & Pengukuran</label>
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="block text-[11px] font-semibold mb-1">Keputusan Hasil</label>
            <select id="trl-hasil-status" class="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold">
              <option value="OK" ${existing?.Hasil_Inspeksi_Status === 'OK' ? 'selected' : ''}>✓ OK (Lolos)</option>
              <option value="NG" ${existing?.Hasil_Inspeksi_Status === 'NG' ? 'selected' : ''}>✕ NG (Gagal)</option>
              <option value="CONDITIONAL" ${existing?.Hasil_Inspeksi_Status === 'CONDITIONAL' ? 'selected' : ''}>⚠ CONDITIONAL</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] font-semibold mb-1">Qty OK (pcs)</label>
            <input type="number" id="trl-qty-ok" min="0" value="${existing ? Number(existing.Qty_OK || 0) : 0}"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold mb-1">Qty NG (pcs)</label>
            <input type="number" id="trl-qty-ng" min="0" value="${existing ? Number(existing.Qty_NG || 0) : 0}"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-semibold mb-1">Catatan Hasil Inspeksi Visual / Ukur</label>
          <textarea id="trl-detail-hasil" rows="2" placeholder="Contoh: Permukaan cerah merata, tidak ada blistering/burnt, ketebalan XRF sesuai standar..."
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${existing ? escapeHtml(existing.Detail_Hasil_Inspeksi) : ''}</textarea>
        </div>

        <div>
          <label class="block text-[11px] font-semibold mb-1">Upload Foto Bukti Hasil Trial (Opsional)</label>
          <input type="file" id="trl-foto-input" accept="image/*" capture="environment" onchange="handleTrialPhotoSelect(event)"
            class="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold" />
          <p id="trl-foto-status" class="text-[11px] text-slate-400 mt-1">
            ${existing?.Bukti_Foto_URL ? 'Foto lama sudah tersimpan. Pilih file baru jika ingin mengganti.' : 'Foto otomatis dikompres & disimpan ke Google Drive.'}
          </p>
        </div>
      </div>

      <!-- KESIMPULAN & NEXT TRIAL -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold mb-1">Kesimpulan Trial *</label>
          <textarea id="trl-kesimpulan" rows="3" required placeholder="Evaluasi akhir terhadap tujuan trial..."
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${existing ? escapeHtml(existing.Kesimpulan_Trial) : ''}</textarea>
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Next Trial / Tindak Lanjut *</label>
          <textarea id="trl-next" rows="3" required placeholder="Rencana parameter/lot trial berikutnya atau lanjut masspro..."
            class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${existing ? escapeHtml(existing.Next_Trial) : ''}</textarea>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 gap-3">
        <select id="trl-status-doc" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold">
          <option value="Final" ${existing?.Status_Trial !== 'Draft' ? 'selected' : ''}>Status: Final Report</option>
          <option value="Draft" ${existing?.Status_Trial === 'Draft' ? 'selected' : ''}>Status: Draft (Sementara)</option>
        </select>
        <button type="submit" id="trl-submit-btn" class="px-5 py-2.5 bg-[#1E3A8A] hover:bg-blue-800 text-white rounded-xl font-semibold text-xs flex items-center gap-2">
          <i data-lucide="save" class="w-4 h-4"></i> Simpan Trial Report
        </button>
      </div>
    </form>
  `);

  renderFlowStepsEditor();
  document.getElementById('trial-form').addEventListener('submit', handleTrialFormSubmit);
}

function renderFlowStepsEditor() {
  const container = document.getElementById('flow-steps-container');
  if (!container) return;

  container.innerHTML = STATE.trialFlowDraft.map((st, idx) => `
    <div class="p-2.5 rounded-xl border ${st.isTrialArea ? 'border-red-400 bg-red-50/60 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B]'} flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <div class="flex items-center gap-2 flex-1">
        <span class="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center shrink-0">${idx + 1}</span>
        <input type="text" value="${escapeHtml(st.step)}" oninput="updateTrialFlowField(${idx}, 'step', this.value)"
          placeholder="Nama Proses (misal: Pickling)"
          class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-semibold" />
      </div>
      <div class="flex-1">
        <input type="text" value="${escapeHtml(st.parameter)}" oninput="updateTrialFlowField(${idx}, 'parameter', this.value)"
          placeholder="Konsentrasi / Parameter (misal: HCl 12% • 4 mnt)"
          class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-xs font-mono" />
      </div>
      <div class="flex items-center justify-end gap-1.5 shrink-0">
        <button type="button" onclick="toggleTrialFlowArea(${idx})"
          class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition ${st.isTrialArea ? 'bg-red-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-red-100'}">
          ${st.isTrialArea ? '📍 Area Trial' : 'Tandai Trial'}
        </button>
        ${STATE.trialFlowDraft.length > 1 ? `
          <button type="button" onclick="removeTrialFlowStep(${idx})" class="p-1.5 rounded-lg text-slate-400 hover:text-red-600">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function addTrialFlowStep() {
  STATE.trialFlowDraft.push({ step: '', parameter: '', isTrialArea: false });
  renderFlowStepsEditor();
}

function removeTrialFlowStep(idx) {
  STATE.trialFlowDraft.splice(idx, 1);
  renderFlowStepsEditor();
}

function updateTrialFlowField(idx, field, val) {
  if (STATE.trialFlowDraft[idx]) {
    STATE.trialFlowDraft[idx][field] = val;
  }
}

function toggleTrialFlowArea(idx) {
  if (STATE.trialFlowDraft[idx]) {
    STATE.trialFlowDraft[idx].isTrialArea = !STATE.trialFlowDraft[idx].isTrialArea;
    renderFlowStepsEditor();
  }
}

function applyPlatingPreset() {
  STATE.trialFlowDraft = [
    { step: 'Degreasing', parameter: 'Alkaline Cleaner 45 g/L • 60°C • 5 mnt', isTrialArea: false },
    { step: 'Water Rinse', parameter: 'Air Bilas Mengalir • Suhu Ruang', isTrialArea: false },
    { step: 'Pickling', parameter: 'HCl 12% (120 mL/L) • 4 mnt', isTrialArea: true },
    { step: 'Zinc Plating', parameter: 'Zn 12 g/L, NaOH 110 g/L • 2.5 A/dm²', isTrialArea: false },
    { step: 'Chromate', parameter: 'Trivalent Cr3+ 8% • pH 2.0 • 45 dtk', isTrialArea: false },
    { step: 'Dryer', parameter: 'Hot Air 80°C • 10 mnt', isTrialArea: false }
  ];
  renderFlowStepsEditor();
}

async function handleTrialPhotoSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('trl-foto-status');
  statusEl.textContent = 'Mengompres gambar...';
  try {
    const compressedBase64 = await compressImageToBase64(file, 1024, 0.78);
    STATE.trialPhotoData = {
      base64Data: compressedBase64,
      fileName: file.name,
      mimeType: 'image/jpeg'
    };
    statusEl.textContent = '✓ Foto siap diunggah (' + file.name + ')';
    statusEl.className = 'text-[11px] text-emerald-600 font-semibold mt-1';
  } catch (err) {
    showToast('Gagal memproses foto: ' + err.message, 'error');
  }
}

async function handleTrialFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('trl-submit-btn');
  btn.disabled = true;
  btn.innerHTML = `<span>Menyimpan...</span>`;

  try {
    const validFlow = STATE.trialFlowDraft.filter(s => String(s.step || '').trim() !== '');
    if (validFlow.length === 0) {
      throw new Error('Minimal isi 1 tahapan proses pada Flow Trial.');
    }

    let uploadedUrl = undefined;
    let uploadedDriveId = undefined;

    if (STATE.trialPhotoData) {
      btn.innerHTML = `<span>Mengunggah Foto...</span>`;
      const upRes = await callGasApi('uploadTrialEvidence', {
        trialId: document.getElementById('trl-id').value || 'NEW_TRIAL',
        base64Data: STATE.trialPhotoData.base64Data,
        fileName: STATE.trialPhotoData.fileName,
        mimeType: STATE.trialPhotoData.mimeType
      });
      uploadedUrl = upRes.url;
      uploadedDriveId = upRes.fileId;
    }

    const itemPayload = {
      Trial_ID: document.getElementById('trl-id').value || null,
      Nama_Trial: document.getElementById('trl-nama').value,
      Tujuan_Trial: document.getElementById('trl-tujuan').value,
      Tanggal_Trial: document.getElementById('trl-tgl').value,
      Item_Trial: document.getElementById('trl-item').value,
      No_Lot: document.getElementById('trl-lot').value,
      Qty: document.getElementById('trl-qty').value,
      Flow_Trial_JSON: validFlow,
      Hasil_Inspeksi_Status: document.getElementById('trl-hasil-status').value,
      Qty_OK: document.getElementById('trl-qty-ok').value,
      Qty_NG: document.getElementById('trl-qty-ng').value,
      Detail_Hasil_Inspeksi: document.getElementById('trl-detail-hasil').value,
      Kesimpulan_Trial: document.getElementById('trl-kesimpulan').value,
      Next_Trial: document.getElementById('trl-next').value,
      Status_Trial: document.getElementById('trl-status-doc').value
    };

    if (uploadedUrl) {
      itemPayload.Bukti_Foto_URL = uploadedUrl;
      itemPayload.Bukti_Foto_Drive_ID = uploadedDriveId;
    }

    const saveRes = await callGasApi('saveTrialReport', { item: itemPayload });
    closeModal();
    showToast('Activity Trial Report berhasil disimpan!', 'success');
    await fetchBootstrapData(false);
    if (saveRes.id) {
      openTrialDetail(saveRes.id);
    }
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Simpan Trial Report`;
    lucide.createIcons();
  }
}

async function deleteTrialReport(trialId) {
  if (!confirm('Hapus laporan trial ' + trialId + ' secara permanen?')) return;
  try {
    await callGasApi('deleteTrialReport', { id: trialId });
    STATE.activeTrialId = null;
    showToast('Laporan trial dihapus.', 'success');
    fetchBootstrapData(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 7. VIEW: SCHEDULE & AGENDA
 * ============================================================================ */

function renderSchedule(container) {
  const canEdit = STATE.user.Role === 'Admin' || STATE.user.Role === 'Auditor';
  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p class="text-xs text-slate-500">Kalender operasional audit, inspeksi, dan tenggat kalibrasi.</p>
      </div>
      ${canEdit ? `
        <button onclick="openScheduleModal()" class="px-4 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 self-start">
          <i data-lucide="plus" class="w-4 h-4"></i> Tambah Jadwal
        </button>
      ` : ''}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${STATE.data.schedules.map(s => `
        <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">${escapeHtml(s.Kategori)}</span>
              <span class="text-xs font-mono text-slate-400">${escapeHtml(s.Tanggal_Mulai)}</span>
            </div>
            <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(s.Judul_Agenda)}</h4>
            <p class="text-xs text-slate-500 mt-1"><i data-lucide="map-pin" class="w-3 h-3 inline mr-1"></i>${escapeHtml(s.Lokasi_Area || '-')}</p>
            <p class="text-xs text-slate-500 mt-0.5"><i data-lucide="clock" class="w-3 h-3 inline mr-1"></i>${escapeHtml(s.Waktu_Mulai)} - ${escapeHtml(s.Waktu_Selesai)}</p>
            ${s.Catatan ? `<p class="text-xs text-slate-400 mt-2 italic">"${escapeHtml(s.Catatan)}"</p>` : ''}
          </div>
          <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <span class="text-[11px] font-medium text-slate-500">PIC: ${getUserName(s.PIC_User_ID)}</span>
            ${canEdit ? `
              <button onclick="deleteSchedule('${s.Schedule_ID}')" class="text-xs text-red-500 hover:underline">Hapus</button>
            ` : ''}
          </div>
        </div>
      `).join('') || '<p class="text-xs text-slate-400 col-span-full text-center py-8">Belum ada jadwal tersimpan.</p>'}
    </div>
  `;
}

function openScheduleModal() {
  const userOptions = STATE.data.users.map(u => `<option value="${u.User_ID}">${escapeHtml(u.Nama_Lengkap)}</option>`).join('');
  openModal('Tambah Jadwal Baru', `
    <form id="schedule-form" class="space-y-3">
      <div>
        <label class="block text-xs font-semibold mb-1">Judul Agenda *</label>
        <input type="text" id="sch-judul" required placeholder="Contoh: Audit Internal ISO 9001 Area Plating" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold mb-1">Kategori</label>
          <select id="sch-kategori" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
            <option value="Audit">Audit</option>
            <option value="Trial">Activity Trial</option>
            <option value="Kalibrasi">Kalibrasi</option>
            <option value="Meeting">Meeting</option>
            <option value="Deadline">Deadline</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">PIC</label>
          <select id="sch-pic" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">${userOptions}</select>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div>
          <label class="block text-xs font-semibold mb-1">Tanggal *</label>
          <input type="date" id="sch-tgl" required value="${new Date().toISOString().slice(0, 10)}" class="w-full px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Mulai</label>
          <input type="time" id="sch-mulai" value="08:30" class="w-full px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Selesai</label>
          <input type="time" id="sch-selesai" value="11:30" class="w-full px-2 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Lokasi / Line Produksi</label>
        <input type="text" id="sch-lokasi" placeholder="Plant 1 - Ruang Lab QC" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Catatan</label>
        <textarea id="sch-catatan" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs"></textarea>
      </div>
      <button type="submit" class="w-full py-2.5 bg-[#1E3A8A] text-white rounded-xl font-semibold text-xs">Simpan Jadwal</button>
    </form>
  `);

  document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await callGasApi('saveSchedule', {
        item: {
          Judul_Agenda: document.getElementById('sch-judul').value,
          Kategori: document.getElementById('sch-kategori').value,
          PIC_User_ID: document.getElementById('sch-pic').value,
          Tanggal_Mulai: document.getElementById('sch-tgl').value,
          Waktu_Mulai: document.getElementById('sch-mulai').value,
          Waktu_Selesai: document.getElementById('sch-selesai').value,
          Lokasi_Area: document.getElementById('sch-lokasi').value,
          Catatan: document.getElementById('sch-catatan').value
        }
      });
      closeModal();
      showToast('Jadwal berhasil ditambahkan.', 'success');
      fetchBootstrapData(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function deleteSchedule(id) {
  if (!confirm('Hapus jadwal ini?')) return;
  try {
    await callGasApi('deleteSchedule', { id });
    showToast('Jadwal dihapus.', 'success');
    fetchBootstrapData(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 8. VIEW: TASK MANAGER
 * ============================================================================ */

function renderTasks(container) {
  const cols = ['To Do', 'In Progress', 'Done'];
  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p class="text-xs text-slate-500">Pelacakan tugas harian, proyek QCC, dan tindak lanjut audit.</p>
      <button onclick="openTaskModal()" class="px-4 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 self-start">
        <i data-lucide="plus" class="w-4 h-4"></i> Tugas Baru
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      ${cols.map(status => {
        const list = STATE.data.tasks.filter(t => t.Status === status);
        return `
          <div class="bg-slate-100/70 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">${status}</h4>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white dark:bg-slate-800">${list.length}</span>
            </div>
            <div class="space-y-2.5">
              ${list.map(t => `
                <div class="bg-white dark:bg-[#1E293B] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.Prioritas === 'High' ? 'bg-red-100 text-red-700' : (t.Prioritas === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}">${escapeHtml(t.Prioritas)}</span>
                    <span class="text-[11px] text-slate-400 font-mono">${escapeHtml(t.Deadline || '')}</span>
                  </div>
                  <p class="font-semibold text-xs text-slate-900 dark:text-white">${escapeHtml(t.Judul_Tugas)}</p>
                  ${t.Deskripsi ? `<p class="text-[11px] text-slate-500 line-clamp-2">${escapeHtml(t.Deskripsi)}</p>` : ''}
                  <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span class="text-[11px] text-slate-400">${getUserName(t.Assignee_User_ID)}</span>
                    <div class="flex gap-1">
                      ${status !== 'In Progress' ? `<button onclick="changeTaskStatus('${t.Task_ID}', 'In Progress')" class="px-2 py-1 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">Proses</button>` : ''}
                      ${status !== 'Done' ? `<button onclick="changeTaskStatus('${t.Task_ID}', 'Done')" class="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">Selesai</button>` : ''}
                    </div>
                  </div>
                </div>
              `).join('') || '<p class="text-xs text-slate-400 text-center py-6">Kosong</p>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function openTaskModal() {
  const userOptions = STATE.data.users.map(u => `<option value="${u.User_ID}">${escapeHtml(u.Nama_Lengkap)}</option>`).join('');
  openModal('Tambah Tugas Baru', `
    <form id="task-form" class="space-y-3">
      <div>
        <label class="block text-xs font-semibold mb-1">Judul Tugas *</label>
        <input type="text" id="tsk-judul" required placeholder="Contoh: Update Kalibrasi Mikrometer & Gauge" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Deskripsi</label>
        <textarea id="tsk-desc" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs"></textarea>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold mb-1">Prioritas</label>
          <select id="tsk-prio" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
            <option value="High">High</option>
            <option value="Medium" selected>Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Deadline</label>
          <input type="date" id="tsk-deadline" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Ditugaskan Kepada (PIC)</label>
        <select id="tsk-pic" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">${userOptions}</select>
      </div>
      <button type="submit" class="w-full py-2.5 bg-[#1E3A8A] text-white rounded-xl font-semibold text-xs">Simpan Tugas</button>
    </form>
  `);

  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await callGasApi('saveTask', {
        item: {
          Judul_Tugas: document.getElementById('tsk-judul').value,
          Deskripsi: document.getElementById('tsk-desc').value,
          Prioritas: document.getElementById('tsk-prio').value,
          Deadline: document.getElementById('tsk-deadline').value,
          Assignee_User_ID: document.getElementById('tsk-pic').value
        }
      });
      closeModal();
      showToast('Tugas berhasil dibuat.', 'success');
      fetchBootstrapData(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function changeTaskStatus(id, status) {
  try {
    await callGasApi('updateTaskStatus', { id, status });
    showToast('Status tugas diperbarui.', 'success');
    fetchBootstrapData(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 9. VIEW: AUDIT CENTER & LAPANGAN CHECKLIST
 * ============================================================================ */

function renderAuditList(container) {
  const canCreate = STATE.user.Role === 'Admin' || STATE.user.Role === 'Auditor';
  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p class="text-xs text-slate-500">Pelaksanaan audit internal ISO 9001:2015, Patrol 5R, dan audit proses.</p>
      ${canCreate ? `
        <button onclick="openNewAuditModal()" class="px-4 py-2 bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 self-start">
          <i data-lucide="clipboard-plus" class="w-4 h-4"></i> Sesi Audit Baru
        </button>
      ` : ''}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${STATE.data.audits.map(a => `
        <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">${escapeHtml(a.Nomor_Dokumen)}</span>
              <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${a.Status_Audit === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
                ${escapeHtml(a.Status_Audit)}
              </span>
            </div>
            <h4 class="font-bold text-sm">${escapeHtml(a.Judul_Audit)}</h4>
            <p class="text-xs text-slate-500 mt-1">Standar: ${escapeHtml(a.Standar_Acuan)} • Area: ${escapeHtml(a.Area_Departemen)}</p>
            <p class="text-xs text-slate-400 mt-0.5">Tanggal: ${escapeHtml(a.Tanggal_Audit)} • Auditee: ${escapeHtml(a.Auditee_PIC)}</p>
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div>
              <span class="text-[11px] text-slate-400 block">Skor Kepatuhan</span>
              <span class="text-base font-bold tabular-nums text-slate-900 dark:text-white">${a.Score_Persen || 0}%</span>
            </div>
            <button onclick="openAuditSession('${a.Audit_ID}')" class="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-semibold hover:opacity-90">
              ${a.Status_Audit === 'Completed' ? 'Lihat Laporan' : 'Isi Checklist'}
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-xs text-slate-400 col-span-full text-center py-8">Belum ada sesi audit.</p>'}
    </div>
  `;
}

function openNewAuditModal() {
  openModal('Buat Sesi Audit Baru', `
    <form id="audit-new-form" class="space-y-3">
      <div>
        <label class="block text-xs font-semibold mb-1">Judul Audit *</label>
        <input type="text" id="aud-judul" required placeholder="Audit Internal Q4 - Inspeksi & Lab" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold mb-1">Standar Acuan</label>
          <select id="aud-standar" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
            <option value="ISO 9001:2015">ISO 9001:2015</option>
            <option value="Patrol 5R">Patrol 5R / Gemba</option>
            <option value="Process Audit">Process Audit</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">Tanggal Audit</label>
          <input type="date" id="aud-tgl" value="${new Date().toISOString().slice(0, 10)}" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold mb-1">Area / Departemen *</label>
          <input type="text" id="aud-area" required placeholder="Quality Control / Plating" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
        <div>
          <label class="block text-xs font-semibold mb-1">PIC Auditee</label>
          <input type="text" id="aud-pic" placeholder="Nama PIC Area" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
        </div>
      </div>
      <button type="submit" class="w-full py-2.5 bg-[#1E3A8A] text-white rounded-xl font-semibold text-xs">Generate Checklist & Mulai</button>
    </form>
  `);

  document.getElementById('audit-new-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await callGasApi('createAuditSession', {
        session: {
          Judul_Audit: document.getElementById('aud-judul').value,
          Standar_Acuan: document.getElementById('aud-standar').value,
          Tanggal_Audit: document.getElementById('aud-tgl').value,
          Area_Departemen: document.getElementById('aud-area').value,
          Auditee_PIC: document.getElementById('aud-pic').value
        }
      });
      closeModal();
      showToast('Sesi audit berhasil dibuat!', 'success');
      await fetchBootstrapData(false);
      openAuditSession(res.auditId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openAuditSession(auditId) {
  STATE.activeAuditId = auditId;
  renderCurrentRoute();
}

function renderAuditExecution(container, auditId) {
  const audit = STATE.data.audits.find(a => a.Audit_ID === auditId);
  const items = STATE.data.checklistItems.filter(i => i.Audit_ID === auditId);
  if (!audit) return renderAuditList(container);

  container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 no-print">
      <button onclick="openAuditSession(null)" class="text-xs font-semibold text-blue-600 flex items-center gap-1">
        <i data-lucide="arrow-left" class="w-4 h-4"></i> Kembali ke Daftar Audit
      </button>
      <div class="flex gap-2">
        <button onclick="window.print()" class="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1">
          <i data-lucide="printer" class="w-3.5 h-3.5"></i> Cetak Laporan
        </button>
        <button onclick="submitChecklistData(false)" class="px-3.5 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold">Simpan Draft</button>
        <button onclick="submitChecklistData(true)" class="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold">Selesaikan & Generate CAPA</button>
      </div>
    </div>

    <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 print-only-clean">
      <div class="flex flex-wrap justify-between gap-2">
        <div>
          <span class="font-mono text-xs text-blue-600 font-bold">${escapeHtml(audit.Nomor_Dokumen)} • ${escapeHtml(audit.Standar_Acuan)}</span>
          <h3 class="text-lg font-bold mt-0.5">${escapeHtml(audit.Judul_Audit)}</h3>
          <p class="text-xs text-slate-500">Area: ${escapeHtml(audit.Area_Departemen)} | Tanggal: ${escapeHtml(audit.Tanggal_Audit)} | Auditee: ${escapeHtml(audit.Auditee_PIC)}</p>
        </div>
        <div class="text-right">
          <span class="text-xs text-slate-400">Skor Saat Ini</span>
          <p class="text-2xl font-bold text-blue-600 tabular-nums">${audit.Score_Persen || 0}%</p>
        </div>
      </div>
    </div>

    <div class="space-y-4">
      ${items.map((item, idx) => `
        <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 checklist-card print-only-clean" data-item-id="${item.Item_ID}">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-semibold">Klausul ${escapeHtml(item.Klausul)}</span>
              <span class="text-xs font-semibold text-blue-600 ml-2">${escapeHtml(item.Kategori_Poin)}</span>
              <p class="font-semibold text-sm mt-1.5">${idx + 1}. ${escapeHtml(item.Pertanyaan_Checklist)}</p>
              <p class="text-xs text-slate-400 mt-0.5">Kriteria: ${escapeHtml(item.Kriteria_Penerimaan)}</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label class="block text-[11px] font-semibold mb-1">Hasil Evaluasi</label>
              <select class="chk-eval w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold">
                <option value="Pending" ${item.Hasil_Evaluasi === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                <option value="Conform" ${item.Hasil_Evaluasi === 'Conform' ? 'selected' : ''}>✅ Conform (OK)</option>
                <option value="Non-Conform" ${item.Hasil_Evaluasi === 'Non-Conform' ? 'selected' : ''}>❌ Non-Conform (NG)</option>
                <option value="N/A" ${item.Hasil_Evaluasi === 'N/A' ? 'selected' : ''}>➖ N/A</option>
              </select>
            </div>
            <div>
              <label class="block text-[11px] font-semibold mb-1">Kategori Temuan</label>
              <select class="chk-sev w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
                <option value="Observation" ${item.Severity === 'Observation' ? 'selected' : ''}>Observation (OFI)</option>
                <option value="Minor" ${item.Severity === 'Minor' ? 'selected' : ''}>Minor NC</option>
                <option value="Major" ${item.Severity === 'Major' ? 'selected' : ''}>Major NC</option>
              </select>
            </div>
            <div class="no-print">
              <label class="block text-[11px] font-semibold mb-1">Bukti Foto Lapangan</label>
              <input type="file" accept="image/*" capture="environment" onchange="handleEvidenceUpload(event, '${auditId}', '${item.Item_ID}')" class="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold" />
            </div>
          </div>

          <div>
            <input type="text" class="chk-note w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              placeholder="Catatan objektif / bukti temuan..." value="${escapeHtml(item.Catatan_Temuan || '')}" />
          </div>

          ${item.Bukti_Foto_URL ? `
            <div class="pt-1">
              <a href="${item.Bukti_Foto_URL}" target="_blank" class="inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:underline">
                <i data-lucide="image" class="w-3.5 h-3.5"></i> Lihat Foto Bukti di Google Drive
              </a>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

async function handleEvidenceUpload(event, auditId, itemId) {
  const file = event.target.files[0];
  if (!file) return;
  showToast('Mengompres & mengunggah foto bukti...', 'info');

  try {
    const compressedBase64 = await compressImageToBase64(file, 1024, 0.78);
    const res = await callGasApi('uploadAuditEvidence', {
      auditId,
      base64Data: compressedBase64,
      fileName: `${itemId}_${Date.now()}.jpg`,
      mimeType: 'image/jpeg'
    });

    const targetItem = STATE.data.checklistItems.find(i => i.Item_ID === itemId);
    if (targetItem) {
      targetItem.Bukti_Foto_URL = res.url;
      targetItem.Bukti_Foto_Drive_ID = res.fileId;
    }
    showToast('Foto bukti berhasil diunggah ke Drive!', 'success');
    renderCurrentRoute();
  } catch (err) {
    showToast('Gagal upload foto: ' + err.message, 'error');
  }
}

async function submitChecklistData(finishAudit) {
  const cards = document.querySelectorAll('.checklist-card');
  const updates = [];
  cards.forEach(card => {
    const itemId = card.getAttribute('data-item-id');
    const existing = STATE.data.checklistItems.find(i => i.Item_ID === itemId) || {};
    updates.push({
      Item_ID: itemId,
      Hasil_Evaluasi: card.querySelector('.chk-eval').value,
      Severity: card.querySelector('.chk-sev').value,
      Catatan_Temuan: card.querySelector('.chk-note').value,
      Bukti_Foto_URL: existing.Bukti_Foto_URL || '',
      Bukti_Foto_Drive_ID: existing.Bukti_Foto_Drive_ID || ''
    });
  });

  try {
    const res = await callGasApi('saveAuditChecklist', {
      auditId: STATE.activeAuditId,
      items: updates,
      finishAudit
    });
    showToast(finishAudit ? `Audit selesai! Skor: ${res.scorePersen}%` : 'Draft checklist tersimpan.', 'success');
    if (finishAudit) STATE.activeAuditId = null;
    fetchBootstrapData(false);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 10. VIEW: CAPA & TEMUAN
 * ============================================================================ */

function renderCapa(container) {
  container.innerHTML = `
    <div>
      <p class="text-xs text-slate-500">Daftar Non-Conformance Report (NCR) & tindakan perbaikan yang harus diverifikasi.</p>
    </div>

    <div class="space-y-4">
      ${STATE.data.capas.map(c => `
        <div class="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-mono text-xs font-bold text-red-600">${escapeHtml(c.Nomor_NCR)}</span>
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${c.Status_CAPA === 'Verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">
              ${escapeHtml(c.Status_CAPA)}
            </span>
          </div>
          <p class="font-semibold text-sm">${escapeHtml(c.Uraian_Temuan)}</p>
          <p class="text-xs text-slate-400">Due Date: ${escapeHtml(c.Target_Due_Date)} • PIC: ${getUserName(c.PIC_User_ID)}</p>
          ${c.Root_Cause_Analysis ? `<p class="text-xs bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl"><strong>Root Cause:</strong> ${escapeHtml(c.Root_Cause_Analysis)}</p>` : ''}
          ${c.Tindakan_Korektif ? `<p class="text-xs bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl"><strong>Corrective Action:</strong> ${escapeHtml(c.Tindakan_Korektif)}</p>` : ''}
          <div class="pt-2 flex justify-end">
            <button onclick="openCapaModal('${c.CAPA_ID}')" class="px-3.5 py-1.5 rounded-xl bg-[#1E3A8A] text-white text-xs font-semibold">Update CAPA</button>
          </div>
        </div>
      `).join('') || '<p class="text-xs text-slate-400 text-center py-8">Tidak ada temuan CAPA aktif.</p>'}
    </div>
  `;
}

function openCapaModal(capaId) {
  const c = STATE.data.capas.find(x => x.CAPA_ID === capaId);
  if (!c) return;
  openModal('Tindak Lanjut CAPA: ' + c.Nomor_NCR, `
    <form id="capa-form" class="space-y-3">
      <div>
        <label class="block text-xs font-semibold mb-1">Analisis Akar Masalah (5-Whys / 4M)</label>
        <textarea id="capa-rca" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${escapeHtml(c.Root_Cause_Analysis || '')}</textarea>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Tindakan Korektif (Corrective Action)</label>
        <textarea id="capa-ca" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${escapeHtml(c.Tindakan_Korektif || '')}</textarea>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Tindakan Pencegahan (Preventive Action)</label>
        <textarea id="capa-pa" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs">${escapeHtml(c.Tindakan_Pencegahan || '')}</textarea>
      </div>
      <div>
        <label class="block text-xs font-semibold mb-1">Status CAPA</label>
        <select id="capa-status" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs">
          <option value="Open" ${c.Status_CAPA === 'Open' ? 'selected' : ''}>Open</option>
          <option value="In Progress" ${c.Status_CAPA === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Waiting Verification" ${c.Status_CAPA === 'Waiting Verification' ? 'selected' : ''}>Waiting Verification</option>
          ${STATE.user.Role !== 'Auditee' ? `<option value="Verified" ${c.Status_CAPA === 'Verified' ? 'selected' : ''}>Verified (Closed)</option>` : ''}
        </select>
      </div>
      <button type="submit" class="w-full py-2.5 bg-[#1E3A8A] text-white rounded-xl font-semibold text-xs">Simpan Perubahan CAPA</button>
    </form>
  `);

  document.getElementById('capa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await callGasApi('saveCapa', {
        item: {
          CAPA_ID: capaId,
          Root_Cause_Analysis: document.getElementById('capa-rca').value,
          Tindakan_Korektif: document.getElementById('capa-ca').value,
          Tindakan_Pencegahan: document.getElementById('capa-pa').value,
          Status_CAPA: document.getElementById('capa-status').value
        }
      });
      closeModal();
      showToast('Data CAPA berhasil diperbarui.', 'success');
      fetchBootstrapData(false);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ============================================================================
 * 11. VIEW: SETTINGS & PASSWORD CHANGE
 * ============================================================================ */

function renderSettings(container) {
  const u = STATE.user;
  container.innerHTML = `
    <div class="max-w-xl space-y-6">
      <div class="bg-white dark:bg-[#1E293B] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <h3 class="font-bold text-sm">Profil Pengguna Aktif</h3>
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div><span class="text-slate-400 block">Nama Lengkap</span><span class="font-semibold">${escapeHtml(u.Nama_Lengkap)}</span></div>
          <div><span class="text-slate-400 block">Username</span><span class="font-mono font-semibold">${escapeHtml(u.Username)}</span></div>
          <div><span class="text-slate-400 block">Role Akses</span><span class="font-semibold">${escapeHtml(u.Role)}</span></div>
          <div><span class="text-slate-400 block">Departemen</span><span class="font-semibold">${escapeHtml(u.Departemen)}</span></div>
        </div>
      </div>

      <div class="bg-white dark:bg-[#1E293B] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h3 class="font-bold text-sm">Ganti Password Akun</h3>
        <form id="change-pass-form" class="space-y-3">
          <div>
            <label class="block text-xs font-semibold mb-1">Password Lama</label>
            <input type="password" id="old-pass" required class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
          </div>
          <div>
            <label class="block text-xs font-semibold mb-1">Password Baru (Minimal 6 Karakter)</label>
            <input type="password" id="new-pass" required minlength="6" class="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent text-xs" />
          </div>
          <button type="submit" class="px-4 py-2.5 bg-[#1E3A8A] text-white rounded-xl font-semibold text-xs">Perbarui Password</button>
        </form>
      </div>

      <div class="bg-white dark:bg-[#1E293B] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 class="font-bold text-sm text-red-600">Keluar dari Aplikasi</h3>
          <p class="text-xs text-slate-400">Hapus sesi aktif pada perangkat ini.</p>
        </div>
        <button onclick="logoutUser()" class="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold">Logout</button>
      </div>
    </div>
  `;

  document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await callGasApi('changePassword', {
        userId: u.User_ID,
        oldPassword: document.getElementById('old-pass').value,
        newPassword: document.getElementById('new-pass').value
      });
      e.target.reset();
      showToast('Password berhasil diperbarui!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ============================================================================
 * 12. MODALS & HELPER UTILITIES
 * ============================================================================ */

function openModal(title, htmlContent) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = htmlContent;
  document.getElementById('modal-backdrop').classList.remove('hidden');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

function openNotificationsModal() {
  const list = (STATE.data.notifications || []).filter(n => n.User_ID === STATE.user.User_ID || n.User_ID === 'ALL').slice(-10).reverse();
  openModal('Notifikasi & Pengingat', `
    <div class="space-y-2.5">
      ${list.map(n => `
        <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p class="font-bold text-xs">${escapeHtml(n.Judul)}</p>
          <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(n.Pesan)}</p>
        </div>
      `).join('') || '<p class="text-xs text-slate-400 text-center py-6">Tidak ada notifikasi baru.</p>'}
    </div>
  `);
}

function getUserName(userId) {
  const u = (STATE.data.users || []).find(x => x.User_ID === userId);
  return u ? u.Nama_Lengkap : (userId || '-');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function compressImageToBase64(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}