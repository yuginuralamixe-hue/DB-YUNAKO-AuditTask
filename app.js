/**
 * ============================================================================
 * YUNAKO AUDIT & TASK HUB - APP.JS (NATIVE AUDITEE RBAC + ACTIVITY TRIAL)
 * Frontend PWA Controller (In-Memory State, GAS API Client, Image Compressor)
 * ============================================================================
 */

// GANTI URL DI BAWAH INI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA (.../exec)
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx0mlXgYPulfBSUajkdR2zlzzce1MUlCcawzBf8Ize6PwP-PoyaxDkBYjYAbk5JNiU/exec';

// Daftar rute dan endpoint API yang diizinkan untuk role Auditee (Read-Only)
const AUDITEE_ALLOWED_ROUTES = ['audit', 'audit-report', 'trials', 'trial-report'];
const AUDITEE_ALLOWED_ACTIONS = [
  'login',
  'logout',
  'getAuditSessions',
  'getAuditSessionDetail',
  'getTrialReports',
  'getTrialReportDetail'
];

// State Aplikasi di Memori Browser (Tanpa localStorage / sessionStorage / IndexedDB)
const AppState = {
  token: null,
  user: null,
  currentRoute: 'dashboard',
  usersList: [],
  schedules: [],
  scheduleViewMode: 'list',
  scheduleCategoryFilter: 'ALL',
  tasks: [],
  taskStatusFilter: 'ALL',
  templates: [],
  auditSessions: [],
  auditFilter: 'ALL',
  activeAuditDetail: null,
  // State Modul Activity Trial Report
  trialReports: [],
  trialFlowSteps: [],
  trialExistingPhotoUrl: '',
  trialPendingPhotoBase64: null
};

function isAuditeeUser() {
  return Boolean(AppState.user && String(AppState.user.Role || '').trim().toLowerCase() === 'auditee');
}

/* ============================================================================
 * 1. INISIALISASI & SERVICE WORKER PWA
 * ============================================================================ */

document.addEventListener('DOMContentLoaded', function() {
  lucide.createIcons();

  if (GAS_WEB_APP_URL.indexOf('PASTE_YOUR') > -1) {
    document.getElementById('api-warning-banner').classList.remove('hidden');
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(function(err) {
      console.warn('SW registration skipped:', err);
    });
  }

  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('toggle-password-btn').addEventListener('click', togglePasswordVisibility);
  document.getElementById('logout-btn-desktop').addEventListener('click', handleLogout);
  document.getElementById('logout-btn-mobile').addEventListener('click', handleLogout);

  const mobileAuditeeLogoutBtn = document.getElementById('logout-btn-mobile-auditee');
  if (mobileAuditeeLogoutBtn) {
    mobileAuditeeLogoutBtn.addEventListener('click', handleLogout);
  }

  document.getElementById('change-password-form').addEventListener('submit', handleChangePasswordSubmit);
  document.getElementById('trial-report-form').addEventListener('submit', handleTrialFormSubmit);

  document.querySelectorAll('.nav-link').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const route = btn.getAttribute('data-route');
      if (route) navigateTo(route);
    });
  });
});

/* ============================================================================
 * 2. KOMUNIKASI API GOOGLE APPS SCRIPT
 * ============================================================================ */

async function callApi(action, payload) {
  if (GAS_WEB_APP_URL.indexOf('PASTE_YOUR') > -1) {
    throw new Error('URL Google Apps Script belum dikonfigurasi di app.js');
  }

  // Blokir pemanggilan API di luar modul Audit & Activity Trial untuk role Auditee
  if (isAuditeeUser() && AUDITEE_ALLOWED_ACTIONS.indexOf(action) === -1) {
    throw new Error('Akses dibatasi: Role Auditee hanya memiliki akses lihat pada Audit Center dan Activity Trial.');
  }

  const response = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({
      action: action,
      token: AppState.token,
      payload: payload || {}
    })
  });

  if (!response.ok) {
    throw new Error('HTTP Error ' + response.status);
  }

  const result = await response.json();
  if (!result.success) {
    if (result.errorCode === 'UNAUTHORIZED') {
      AppState.token = null;
      AppState.user = null;
      showLoginScreen();
    }
    throw new Error(result.message || 'Terjadi kesalahan pada server.');
  }

  return result;
}

function showToast(message, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bgClass = type === 'error'
    ? 'bg-red-600 text-white'
    : (type === 'warning' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white');

  toast.className = 'pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center justify-between gap-3 transition-all ' + bgClass;
  toast.innerHTML = '<span>' + escapeHtml(message) + '</span><button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white font-bold">&times;</button>';
  container.appendChild(toast);

  if (type !== 'error') {
    setTimeout(function() {
      if (toast.parentElement) toast.remove();
    }, 3500);
  }
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

/* ============================================================================
 * 3. AUTENTIKASI & ROLE-BASED UI
 * ============================================================================ */

function togglePasswordVisibility() {
  const input = document.getElementById('login-password');
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('login-submit-btn');
  const errBox = document.getElementById('login-error-box');
  errBox.classList.add('hidden');

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  btn.disabled = true;
  btn.innerHTML = '<span>Memverifikasi...</span>';

  try {
    const res = await callApi('login', { username: username, password: password });
    AppState.token = res.data.token;
    AppState.user = res.data.user;

    document.getElementById('login-password').value = '';
    enterAppShell();
    showToast('Selamat datang, ' + AppState.user.Nama_Lengkap, 'success');
  } catch (err) {
    document.getElementById('login-error-text').textContent = err.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Masuk ke Aplikasi</span><i data-lucide="arrow-right" class="w-4 h-4"></i>';
    lucide.createIcons();
  }
}

function enterAppShell() {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  const u = AppState.user;
  const isAuditee = isAuditeeUser();

  // Terapkan class role-auditee pada body untuk penyesuaian layout & navigasi mobile 2 kolom
  document.body.classList.toggle('role-auditee', isAuditee);

  document.getElementById('sidebar-user-avatar').textContent = u.Nama_Lengkap.charAt(0).toUpperCase();
  document.getElementById('sidebar-user-name').textContent = u.Nama_Lengkap;
  document.getElementById('sidebar-user-role').textContent = u.Role + ' • ' + u.Departemen;
  document.getElementById('mobile-role-badge').textContent = u.Role;

  document.getElementById('prof-nama').textContent = u.Nama_Lengkap;
  document.getElementById('prof-username').textContent = u.Username;
  document.getElementById('prof-role').textContent = u.Role;
  document.getElementById('prof-dept').textContent = u.Departemen;

  document.querySelectorAll('.admin-only:not(.page-view)').forEach(function(el) {
    el.classList.toggle('hidden', u.Role !== 'Admin');
  });
  document.querySelectorAll('.auditor-only:not(.page-view)').forEach(function(el) {
    el.classList.toggle('hidden', isAuditee);
  });
  document.querySelectorAll('.non-auditee:not(.page-view)').forEach(function(el) {
    el.classList.toggle('hidden', isAuditee);
  });
  document.querySelectorAll('.auditee-only:not(.page-view)').forEach(function(el) {
    el.classList.toggle('hidden', !isAuditee);
  });

  // Sembunyikan seluruh tombol menu navigasi selain Audit & Activity Trial untuk role Auditee
  document.querySelectorAll('.nav-link[data-route]').forEach(function(btn) {
    const r = btn.getAttribute('data-route');
    const hideForAuditee = isAuditee && r !== 'audit' && r !== 'trials';
    btn.classList.toggle('hidden', hideForAuditee);
  });

  // Arahkan Auditee langsung ke Audit Center, sementara Admin & Auditor ke Dashboard
  navigateTo(isAuditee ? 'audit' : 'dashboard');
}

function showLoginScreen() {
  document.body.classList.remove('role-auditee');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
}

async function handleLogout() {
  try {
    await callApi('logout', {});
  } catch (e) {}
  AppState.token = null;
  AppState.user = null;
  showLoginScreen();
  showToast('Anda telah keluar dari aplikasi.', 'success');
}

async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  try {
    const res = await callApi('changePassword', { oldPassword: oldPassword, newPassword: newPassword });
    document.getElementById('change-password-form').reset();
    showToast(res.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 4. ROUTING & NAVIGASI HALAMAN
 * ============================================================================ */

function navigateTo(route) {
  // Paksa rute Auditee tetap berada di dalam Audit Center atau Activity Trial Report
  if (isAuditeeUser() && AUDITEE_ALLOWED_ROUTES.indexOf(route) === -1) {
    route = 'audit';
  }

  AppState.currentRoute = route;

  document.querySelectorAll('.page-view').forEach(function(sec) {
    sec.classList.add('hidden');
  });

  const targetView = document.getElementById('view-' + route);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  let activeRoute = route;
  if (route === 'audit-execute' || route === 'audit-report') activeRoute = 'audit';
  if (route === 'trial-form' || route === 'trial-report') activeRoute = 'trials';

  // Gunakan classList.toggle agar class .hidden dan .non-auditee tidak tertimpa
  document.querySelectorAll('#desktop-nav .nav-link').forEach(function(btn) {
    const isMatch = btn.getAttribute('data-route') === activeRoute;
    btn.classList.toggle('bg-brand-accent', isMatch);
    btn.classList.toggle('text-white', isMatch);
    btn.classList.toggle('shadow-xs', isMatch);
    btn.classList.toggle('text-blue-100', !isMatch);
    btn.classList.toggle('hover:bg-white/10', !isMatch);
  });

  document.querySelectorAll('#mobile-bottom-nav .nav-link').forEach(function(btn) {
    const isMatch = btn.getAttribute('data-route') === activeRoute;
    btn.classList.toggle('text-brand-accent', isMatch);
    btn.classList.toggle('text-slate-400', !isMatch);
  });

  const titles = {
    'dashboard': 'YUNAKO Hub',
    'schedule': 'Schedule & Agenda',
    'tasks': 'Task Tracker',
    'audit': 'Audit Center',
    'audit-execute': 'Eksekusi Audit',
    'audit-report': 'Laporan Audit',
    'trials': 'Activity Trial Report',
    'trial-form': 'Form Trial Report',
    'trial-report': 'Laporan Trial',
    'templates': 'Master Template',
    'settings': 'Pengaturan'
  };
  document.getElementById('mobile-header-title').textContent = titles[route] || 'YUNAKO Hub';

  if (route === 'dashboard') loadDashboard();
  if (route === 'schedule') loadSchedules();
  if (route === 'tasks') loadTasks();
  if (route === 'audit') loadAuditSessions();
  if (route === 'trials') loadTrialReports();
  if (route === 'templates') loadTemplates();
  if (route === 'settings') loadSettingsData();

  lucide.createIcons();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================================
 * 5. MODUL DASHBOARD
 * ============================================================================ */

async function loadDashboard() {
  if (isAuditeeUser()) return;

  document.getElementById('dash-greeting').textContent = 'Halo, ' + AppState.user.Nama_Lengkap;
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    const res = await callApi('getDashboardData', {});
    const d = res.data;
    AppState.usersList = d.users || [];

    document.getElementById('kpi-active-tasks').textContent = d.kpi.activeTasksCount;
    document.getElementById('kpi-urgent-tasks').textContent = d.kpi.urgentTasksCount + ' prioritas tinggi/urgent';
    document.getElementById('kpi-today-schedules').textContent = d.kpi.todaySchedulesCount;
    document.getElementById('kpi-draft-audits').textContent = d.kpi.draftAuditsCount;
    document.getElementById('kpi-avg-compliance').textContent = d.kpi.avgCompliance + '%';

    const schEl = document.getElementById('dash-schedules-list');
    if (!d.todaySchedules || d.todaySchedules.length === 0) {
      schEl.innerHTML = '<div class="text-center py-6 text-xs text-brand-muted">Tidak ada agenda terjadwal hari ini.</div>';
    } else {
      schEl.innerHTML = d.todaySchedules.map(function(s) {
        const isAudit = s.Kategori === 'Audit Terjadwal' && !isAuditeeUser();
        return '<div class="p-3 rounded-xl border border-brand-border bg-slate-50/70 flex items-center justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<span class="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-brand-primary">' + escapeHtml(s.Waktu_Mulai) + '</span>' +
              '<span class="text-[11px] font-semibold text-brand-muted">' + escapeHtml(s.Kategori) + '</span>' +
            '</div>' +
            '<div class="font-semibold text-sm text-brand-text truncate">' + escapeHtml(s.Judul_Agenda) + '</div>' +
            '<div class="text-xs text-brand-muted truncate">Area: ' + escapeHtml(s.Lokasi_Area) + '</div>' +
          '</div>' +
          (isAudit ? '<button onclick="openNewAuditModal(\'' + escapeHtml(s.Schedule_ID) + '\', \'' + escapeHtml(s.Lokasi_Area) + '\')" class="shrink-0 px-3 py-2 rounded-lg bg-brand-accent text-white text-xs font-semibold">Mulai Audit</button>' : '') +
        '</div>';
      }).join('');
    }

    const tskEl = document.getElementById('dash-tasks-list');
    if (!d.priorityTasks || d.priorityTasks.length === 0) {
      tskEl.innerHTML = '<div class="text-center py-6 text-xs text-brand-muted">Semua tugas telah selesai!</div>';
    } else {
      tskEl.innerHTML = d.priorityTasks.map(function(t) {
        const badgeColor = (t.Prioritas === 'Urgent' || t.Prioritas === 'High') ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600';
        return '<div onclick="navigateTo(\'tasks\')" class="cursor-pointer p-3 rounded-xl border border-brand-border hover:border-blue-300 transition flex items-center justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<div class="flex items-center gap-2 mb-1">' +
              '<span class="text-[11px] font-bold px-2 py-0.5 rounded ' + badgeColor + '">' + escapeHtml(t.Prioritas) + '</span>' +
              '<span class="font-mono text-[11px] text-brand-muted">Due: ' + escapeHtml(t.Due_Date) + '</span>' +
            '</div>' +
            '<div class="font-semibold text-sm text-brand-text truncate">' + escapeHtml(t.Judul_Tugas) + '</div>' +
            '<div class="text-xs text-brand-muted">PIC: ' + escapeHtml(t.Assignee_Nama) + '</div>' +
          '</div>' +
          '<span class="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700">' + escapeHtml(t.Status_Task) + '</span>' +
        '</div>';
      }).join('');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 6. MODUL SCHEDULE & CALENDAR
 * ============================================================================ */

async function loadSchedules() {
  if (isAuditeeUser()) return;

  const container = document.getElementById('schedule-list-container');
  container.innerHTML = '<div class="bg-white p-6 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Memuat jadwal...</div>';
  try {
    const res = await callApi('getSchedules', {});
    AppState.schedules = res.data || [];
    renderSchedules();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setScheduleViewMode(mode) {
  AppState.scheduleViewMode = mode;
  document.getElementById('sch-view-list-btn').className = mode === 'list'
    ? 'px-3 py-1.5 rounded-lg bg-white text-brand-primary shadow-xs'
    : 'px-3 py-1.5 rounded-lg text-slate-600';
  document.getElementById('sch-view-cal-btn').className = mode === 'calendar'
    ? 'px-3 py-1.5 rounded-lg bg-white text-brand-primary shadow-xs'
    : 'px-3 py-1.5 rounded-lg text-slate-600';

  document.getElementById('schedule-list-container').classList.toggle('hidden', mode !== 'list');
  document.getElementById('schedule-calendar-container').classList.toggle('hidden', mode !== 'calendar');
  renderSchedules();
}

function filterSchedules(cat) {
  AppState.scheduleCategoryFilter = cat;
  document.querySelectorAll('.sch-filter-chip').forEach(function(btn) {
    const active = btn.textContent === (cat === 'ALL' ? 'Semua' : cat);
    btn.className = 'sch-filter-chip px-3.5 py-1.5 rounded-full text-xs font-semibold ' +
      (active ? 'bg-brand-primary text-white' : 'bg-white border border-brand-border text-brand-muted');
  });
  renderSchedules();
}

function renderSchedules() {
  const filtered = AppState.schedules.filter(function(s) {
    return AppState.scheduleCategoryFilter === 'ALL' || s.Kategori === AppState.scheduleCategoryFilter;
  });

  const listEl = document.getElementById('schedule-list-container');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="bg-white p-8 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Belum ada jadwal pada kategori ini.</div>';
  } else {
    listEl.innerHTML = filtered.map(function(s) {
      const isAudit = s.Kategori === 'Audit Terjadwal';
      const borderClass = isAudit ? 'border-l-4 border-l-brand-accent' : 'border-l-4 border-l-emerald-500';
      const canEdit = !isAuditeeUser();
      return '<div class="bg-white p-4 rounded-2xl border border-brand-border ' + borderClass + ' shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">' +
        '<div class="space-y-1">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<span class="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-brand-text">' + escapeHtml(s.Tanggal_Mulai) + ' • ' + escapeHtml(s.Waktu_Mulai) + '-' + escapeHtml(s.Waktu_Selesai) + '</span>' +
            '<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-brand-primary">' + escapeHtml(s.Kategori) + '</span>' +
            '<span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">' + escapeHtml(s.Status_Agenda) + '</span>' +
          '</div>' +
          '<h3 class="font-bold text-base text-brand-text">' + escapeHtml(s.Judul_Agenda) + '</h3>' +
          '<p class="text-xs text-brand-muted">Area: <strong>' + escapeHtml(s.Lokasi_Area) + '</strong> • PIC: ' + escapeHtml(s.PIC_Nama) + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-2 shrink-0">' +
          (isAudit && canEdit ? '<button onclick="openNewAuditModal(\'' + escapeHtml(s.Schedule_ID) + '\', \'' + escapeHtml(s.Lokasi_Area) + '\')" class="px-3.5 py-2 rounded-xl bg-brand-accent text-white text-xs font-semibold">Mulai Audit</button>' : '') +
          (canEdit ? '<button onclick="deleteScheduleItem(\'' + escapeHtml(s.Schedule_ID) + '\')" class="p-2 rounded-xl border border-brand-border text-red-600 hover:bg-red-50" title="Hapus"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  const calEl = document.getElementById('schedule-calendar-container');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  let gridHtml = '<div class="font-bold text-base text-brand-text mb-3 capitalize">' + monthLabel + '</div>' +
    '<div class="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-brand-muted mb-2">' +
    '<div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div></div>' +
    '<div class="grid grid-cols-7 gap-1">';

  for (let empty = 0; empty < firstDay; empty++) {
    gridHtml += '<div class="h-14 rounded-lg bg-slate-50/50"></div>';
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + '-' + ('0' + (month + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
    const dayEvents = filtered.filter(function(ev) { return ev.Tanggal_Mulai === dateStr; });
    gridHtml += '<div class="h-14 p-1 rounded-lg border border-slate-100 flex flex-col justify-between">' +
      '<span class="text-xs font-mono font-semibold">' + d + '</span>' +
      (dayEvents.length > 0 ? '<span class="text-[10px] font-bold px-1 rounded bg-blue-100 text-brand-primary truncate">' + dayEvents.length + ' agenda</span>' : '') +
    '</div>';
  }
  gridHtml += '</div>';
  calEl.innerHTML = gridHtml;
  lucide.createIcons();
}

function openScheduleModal() {
  if (isAuditeeUser()) return;

  const today = new Date().toISOString().slice(0, 10);
  const userOptions = AppState.usersList.map(function(u) {
    return '<option value="' + escapeHtml(u.User_ID) + '">' + escapeHtml(u.Nama_Lengkap) + ' (' + u.Role + ')</option>';
  }).join('');

  openModal('Tambah Jadwal Baru',
    '<form id="schedule-form" class="space-y-3">' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Judul Agenda *</label>' +
      '<input type="text" id="sch-judul" required placeholder="Contoh: Audit Internal Area QC" class="w-full px-3.5 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Kategori</label>' +
        '<select id="sch-kategori" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' +
          '<option value="Audit Terjadwal">Audit Terjadwal</option>' +
          '<option value="Tugas Lapangan">Tugas Lapangan</option>' +
          '<option value="Meeting">Meeting</option>' +
          '<option value="Lainnya">Lainnya</option>' +
        '</select></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Tanggal *</label>' +
        '<input type="date" id="sch-tanggal" value="' + today + '" required class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Jam Mulai</label>' +
        '<input type="time" id="sch-mulai" value="09:00" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Jam Selesai</label>' +
        '<input type="time" id="sch-selesai" value="10:30" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Lokasi / Area Audit</label>' +
        '<input type="text" id="sch-lokasi" placeholder="Plant 1 / Lab Inspeksi" class="w-full px-3.5 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">PIC</label>' +
        '<select id="sch-pic" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' + userOptions + '</select></div>' +
      '</div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Catatan</label>' +
      '<textarea id="sch-desc" rows="2" class="w-full px-3 py-2 rounded-xl border border-brand-border text-sm"></textarea></div>' +
      '<button type="submit" class="w-full touch-target bg-brand-accent text-white font-semibold rounded-xl text-sm">Simpan Jadwal</button>' +
    '</form>'
  );

  document.getElementById('schedule-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
      const res = await callApi('saveSchedule', {
        Judul_Agenda: document.getElementById('sch-judul').value,
        Kategori: document.getElementById('sch-kategori').value,
        Tanggal_Mulai: document.getElementById('sch-tanggal').value,
        Waktu_Mulai: document.getElementById('sch-mulai').value,
        Waktu_Selesai: document.getElementById('sch-selesai').value,
        Lokasi_Area: document.getElementById('sch-lokasi').value,
        PIC_User_ID: document.getElementById('sch-pic').value,
        Deskripsi: document.getElementById('sch-desc').value
      });
      closeModal();
      showToast(res.message, 'success');
      if (AppState.currentRoute === 'schedule') loadSchedules(); else loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function deleteScheduleItem(scheduleId) {
  if (isAuditeeUser()) return;
  if (!confirm('Hapus jadwal ini?')) return;
  try {
    const res = await callApi('deleteSchedule', { Schedule_ID: scheduleId });
    showToast(res.message, 'success');
    loadSchedules();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 7. MODUL TASK TRACKER
 * ============================================================================ */

async function loadTasks() {
  if (isAuditeeUser()) return;

  const container = document.getElementById('tasks-list-container');
  container.innerHTML = '<div class="col-span-full bg-white p-6 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Memuat daftar tugas...</div>';
  try {
    const res = await callApi('getTasks', {});
    AppState.tasks = res.data || [];
    renderTasks();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setTaskStatusFilter(status) {
  AppState.taskStatusFilter = status;
  document.querySelectorAll('.task-tab-btn').forEach(function(btn) {
    const active = btn.textContent === (status === 'ALL' ? 'Semua' : status);
    btn.className = 'task-tab-btn px-3.5 py-2 rounded-xl text-xs font-semibold ' +
      (active ? 'bg-brand-primary text-white' : 'bg-white border border-brand-border text-brand-muted');
  });
  renderTasks();
}

function renderTasks() {
  const q = (document.getElementById('task-search-input').value || '').toLowerCase();
  const filtered = AppState.tasks.filter(function(t) {
    const matchStatus = AppState.taskStatusFilter === 'ALL' || t.Status_Task === AppState.taskStatusFilter;
    const matchQuery = !q ||
      String(t.Judul_Tugas).toLowerCase().indexOf(q) > -1 ||
      String(t.Related_Audit_ID).toLowerCase().indexOf(q) > -1 ||
      String(t.Assignee_Nama).toLowerCase().indexOf(q) > -1;
    return matchStatus && matchQuery;
  });

  const container = document.getElementById('tasks-list-container');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="col-span-full bg-white p-8 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Tidak ada tugas ditemukan.</div>';
    return;
  }

  container.innerHTML = filtered.map(function(t) {
    const prioBadge = (t.Prioritas === 'Urgent' || t.Prioritas === 'High')
      ? 'bg-red-50 text-red-600'
      : (t.Prioritas === 'Medium' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600');
    const statusBadge = t.Status_Task === 'Done'
      ? 'bg-emerald-50 text-emerald-700'
      : (t.Status_Task === 'In Progress' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700');

    return '<div class="bg-white p-4 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between gap-3">' +
      '<div>' +
        '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="font-mono text-[11px] text-brand-muted">' + escapeHtml(t.Task_ID) + '</span>' +
            '<span class="text-[11px] font-bold px-2 py-0.5 rounded ' + prioBadge + '">' + escapeHtml(t.Prioritas) + '</span>' +
          '</div>' +
          '<span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ' + statusBadge + '">' + escapeHtml(t.Status_Task) + '</span>' +
        '</div>' +
        (t.Related_Audit_ID ? '<div class="mb-1.5"><span class="font-mono text-[11px] px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">Temuan Audit: ' + escapeHtml(t.Related_Audit_ID) + '</span></div>' : '') +
        '<h3 class="font-bold text-base text-brand-text mb-1">' + escapeHtml(t.Judul_Tugas) + '</h3>' +
        '<p class="text-xs text-brand-muted whitespace-pre-line line-clamp-2">' + escapeHtml(t.Deskripsi) + '</p>' +
      '</div>' +
      '<div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">' +
        '<div class="text-xs text-brand-muted">' +
          '<div>PIC: <strong>' + escapeHtml(t.Assignee_Nama) + '</strong></div>' +
          '<div class="font-mono text-[11px]">Due: ' + escapeHtml(t.Due_Date) + '</div>' +
        '</div>' +
        '<button onclick="openTaskProgressModal(\'' + escapeHtml(t.Task_ID) + '\')" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-brand-primary text-xs font-semibold transition">Update Progres</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openTaskModal() {
  if (isAuditeeUser()) return;

  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const userOptions = AppState.usersList.map(function(u) {
    return '<option value="' + escapeHtml(u.User_ID) + '">' + escapeHtml(u.Nama_Lengkap) + ' (' + u.Role + ')</option>';
  }).join('');

  openModal('Buat Tugas Baru',
    '<form id="task-create-form" class="space-y-3">' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Judul Tugas *</label>' +
      '<input type="text" id="tsk-judul" required placeholder="Contoh: Perbarui label kalibrasi caliper" class="w-full px-3.5 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Deskripsi / Instruksi</label>' +
      '<textarea id="tsk-desc" rows="3" class="w-full px-3.5 py-2 rounded-xl border border-brand-border text-sm"></textarea></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Prioritas</label>' +
        '<select id="tsk-prio" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' +
          '<option value="Medium">Medium</option>' +
          '<option value="High">High</option>' +
          '<option value="Urgent">Urgent</option>' +
          '<option value="Low">Low</option>' +
        '</select></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Tenggat Waktu *</label>' +
        '<input type="date" id="tsk-due" value="' + nextWeek + '" required class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '</div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">PIC Pelaksana</label>' +
      '<select id="tsk-assignee" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' + userOptions + '</select></div>' +
      '<button type="submit" class="w-full touch-target bg-brand-accent text-white font-semibold rounded-xl text-sm">Simpan Tugas</button>' +
    '</form>'
  );

  document.getElementById('task-create-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
      const res = await callApi('saveTask', {
        Judul_Tugas: document.getElementById('tsk-judul').value,
        Deskripsi: document.getElementById('tsk-desc').value,
        Prioritas: document.getElementById('tsk-prio').value,
        Due_Date: document.getElementById('tsk-due').value,
        Assignee_User_ID: document.getElementById('tsk-assignee').value
      });
      closeModal();
      showToast(res.message, 'success');
      if (AppState.currentRoute === 'tasks') loadTasks(); else loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function openTaskProgressModal(taskId) {
  if (isAuditeeUser()) return;

  const t = AppState.tasks.find(function(item) { return item.Task_ID === taskId; });
  if (!t) return;

  openModal('Update Progres Tugas',
    '<form id="task-progress-form" class="space-y-3">' +
      '<div class="p-3 rounded-xl bg-slate-50 border border-brand-border">' +
        '<div class="font-mono text-xs text-brand-muted">' + escapeHtml(t.Task_ID) + '</div>' +
        '<div class="font-bold text-sm text-brand-text mt-0.5">' + escapeHtml(t.Judul_Tugas) + '</div>' +
        '<p class="text-xs text-brand-muted whitespace-pre-line mt-1">' + escapeHtml(t.Deskripsi) + '</p>' +
      '</div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Status Pengerjaan</label>' +
      '<select id="tsk-upd-status" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' +
        ['To Do', 'In Progress', 'Review', 'Done'].map(function(st) {
          return '<option value="' + st + '"' + (t.Status_Task === st ? ' selected' : '') + '>' + st + '</option>';
        }).join('') +
      '</select></div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Catatan Penyelesaian / Tindak Lanjut</label>' +
      '<textarea id="tsk-upd-notes" rows="3" placeholder="Jelaskan tindakan perbaikan yang telah dilakukan..." class="w-full px-3 py-2 rounded-xl border border-brand-border text-sm">' + escapeHtml(t.Catatan_Penyelesaian || '') + '</textarea></div>' +
      '<button type="submit" class="w-full touch-target bg-brand-accent text-white font-semibold rounded-xl text-sm">Simpan Perubahan</button>' +
    '</form>'
  );

  document.getElementById('task-progress-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
      const res = await callApi('updateTaskStatus', {
        Task_ID: t.Task_ID,
        Status_Task: document.getElementById('tsk-upd-status').value,
        Catatan_Penyelesaian: document.getElementById('tsk-upd-notes').value
      });
      closeModal();
      showToast(res.message, 'success');
      loadTasks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ============================================================================
 * 8. MODUL AUDIT SESSIONS, MOBILE EXECUTION & GOOGLE DRIVE CAMERA UPLOAD
 * ============================================================================ */

async function loadAuditSessions() {
  const container = document.getElementById('audit-sessions-container');
  container.innerHTML = '<div class="col-span-full bg-white p-6 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Memuat daftar sesi audit...</div>';
  try {
    const res = await callApi('getAuditSessions', {});
    AppState.auditSessions = res.data || [];
    renderAuditSessions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setAuditFilter(filter) {
  AppState.auditFilter = filter;
  document.querySelectorAll('.audit-filter-btn').forEach(function(btn) {
    const labelMap = { 'ALL': 'Semua Sesi', 'Draft': 'Draft (Berjalan)', 'Submitted': 'Submitted (Selesai)' };
    const active = btn.textContent === labelMap[filter];
    btn.className = 'audit-filter-btn px-3.5 py-1.5 rounded-full text-xs font-semibold ' +
      (active ? 'bg-brand-primary text-white' : 'bg-white border border-brand-border text-brand-muted');
  });
  renderAuditSessions();
}

function renderAuditSessions() {
  const filtered = AppState.auditSessions.filter(function(s) {
    return AppState.auditFilter === 'ALL' || s.Status_Audit === AppState.auditFilter;
  });

  const container = document.getElementById('audit-sessions-container');
  if (filtered.length === 0) {
    const emptyMsg = isAuditeeUser()
      ? 'Belum ada sesi audit yang tersedia untuk dilihat.'
      : 'Belum ada sesi audit. Klik "Mulai Audit Baru" untuk memulai pemeriksaan di HP.';
    container.innerHTML = '<div class="col-span-full bg-white p-8 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">' + emptyMsg + '</div>';
    return;
  }

  container.innerHTML = filtered.map(function(s) {
    const isDraft = s.Status_Audit === 'Draft';
    const canExecute = isDraft && !isAuditeeUser();
    const badgeClass = isDraft ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700';

    return '<div class="bg-white p-4 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between gap-3">' +
      '<div>' +
        '<div class="flex items-center justify-between gap-2 mb-2">' +
          '<span class="font-mono text-xs font-bold text-brand-primary">' + escapeHtml(s.Audit_ID) + '</span>' +
          '<span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ' + badgeClass + '">' + escapeHtml(s.Status_Audit) + '</span>' +
        '</div>' +
        '<h3 class="font-bold text-base text-brand-text">' + escapeHtml(s.Area_Objek_Audit) + '</h3>' +
        '<p class="text-xs text-brand-muted mt-0.5">' + escapeHtml(s.Nama_Checklist) + '</p>' +
        '<div class="text-xs text-brand-muted mt-2">Tanggal: <span class="font-mono">' + escapeHtml(s.Tanggal_Audit) + '</span> • Auditor: ' + escapeHtml(s.Auditor_Nama) + '</div>' +
      '</div>' +
      '<div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">' +
        (isDraft
          ? '<span class="text-xs text-amber-600 font-medium">Sedang berlangsung</span>'
          : '<div class="font-mono text-sm font-bold text-emerald-600">Skor: ' + escapeHtml(s.Persentase_Kepatuhan) + '%</div>') +
        (canExecute
          ? '<button onclick="openAuditExecution(\'' + escapeHtml(s.Audit_ID) + '\')" class="px-4 py-2 rounded-xl bg-brand-accent text-white text-xs font-semibold">Lanjutkan Isi Audit</button>'
          : '<button onclick="openAuditReport(\'' + escapeHtml(s.Audit_ID) + '\')" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-brand-primary text-xs font-semibold">Lihat Laporan</button>') +
      '</div>' +
    '</div>';
  }).join('');
}

async function openNewAuditModal(presetScheduleId, presetArea) {
  if (isAuditeeUser()) return;

  try {
    if (AppState.templates.length === 0) {
      const tRes = await callApi('getAuditTemplates', {});
      AppState.templates = tRes.data || [];
    }
    if (AppState.usersList.length === 0) {
      const dRes = await callApi('getDashboardData', {});
      AppState.usersList = dRes.data.users || [];
    }

    const tmplOptions = AppState.templates.map(function(t) {
      return '<option value="' + escapeHtml(t.Template_ID) + '">' + escapeHtml(t.Nama_Checklist) + ' (' + t.Total_Items + ' item)</option>';
    }).join('');

    const auditeeOptions = '<option value="">-- Pilih Akun PIC (Opsional) --</option>' +
      AppState.usersList.map(function(u) {
        return '<option value="' + escapeHtml(u.User_ID) + '">' + escapeHtml(u.Nama_Lengkap) + ' (' + u.Departemen + ')</option>';
      }).join('');

    const today = new Date().toISOString().slice(0, 10);

    openModal('Mulai Sesi Audit Baru',
      '<form id="new-audit-form" class="space-y-3">' +
        '<input type="hidden" id="aud-schedule-id" value="' + escapeHtml(presetScheduleId || '') + '" />' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Pilih Master Checklist *</label>' +
        '<select id="aud-template" required class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' + tmplOptions + '</select></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Area / Objek yang Diaudit *</label>' +
        '<input type="text" id="aud-area" required value="' + escapeHtml(presetArea || '') + '" placeholder="Contoh: Line Tapping 2 / Lab Kalibrasi" class="w-full px-3.5 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Tanggal Audit</label>' +
          '<input type="date" id="aud-tanggal" value="' + today + '" required class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
          '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Nama PIC Auditee *</label>' +
          '<input type="text" id="aud-auditee-nama" required placeholder="Nama PIC lapangan" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
        '</div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Tautkan ke Akun User (Untuk Auto-Task NG)</label>' +
        '<select id="aud-auditee-uid" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' + auditeeOptions + '</select></div>' +
        '<button type="submit" class="w-full touch-target bg-brand-accent text-white font-semibold rounded-xl text-sm">Buka Lembar Checklist Audit</button>' +
      '</form>'
    );

    document.getElementById('new-audit-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      try {
        const res = await callApi('createAuditSession', {
          Template_ID: document.getElementById('aud-template').value,
          Schedule_ID: document.getElementById('aud-schedule-id').value,
          Area_Objek_Audit: document.getElementById('aud-area').value,
          Tanggal_Audit: document.getElementById('aud-tanggal').value,
          Auditee_Nama: document.getElementById('aud-auditee-nama').value,
          Auditee_User_ID: document.getElementById('aud-auditee-uid').value
        });
        closeModal();
        showToast(res.message, 'success');
        openAuditExecution(res.data.Audit_ID);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openAuditExecution(auditId) {
  if (isAuditeeUser()) {
    openAuditReport(auditId);
    return;
  }

  navigateTo('audit-execute');
  const container = document.getElementById('exec-items-container');
  container.innerHTML = '<div class="bg-white p-6 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Memuat lembar checklist audit...</div>';

  try {
    const res = await callApi('getAuditSessionDetail', { Audit_ID: auditId });
    AppState.activeAuditDetail = res.data;
    renderAuditExecution();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateExecutionProgressBar() {
  const session = AppState.activeAuditDetail;
  if (!session) return;
  const total = session.answers.length;
  const filled = session.answers.filter(function(a) { return a.Jawaban_Status !== 'PENDING'; }).length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;

  document.getElementById('exec-progress-text').textContent = filled + ' / ' + total + ' Item (' + pct + '%)';
  document.getElementById('exec-progress-bar').style.width = pct + '%';
}

function renderAuditExecution() {
  const s = AppState.activeAuditDetail;
  if (!s) return;

  document.getElementById('exec-audit-id').textContent = s.Audit_ID;
  document.getElementById('exec-audit-area').textContent = s.Area_Objek_Audit;
  document.getElementById('exec-audit-meta').textContent = s.Nama_Checklist + ' • Auditee: ' + s.Auditee_Nama;
  document.getElementById('exec-summary-notes').value = s.Ringkasan_Temuan || '';
  updateExecutionProgressBar();

  const container = document.getElementById('exec-items-container');
  container.innerHTML = s.answers.map(function(ans) {
    const st = ans.Jawaban_Status;
    const isNG = st === 'NG';
    const cardBorder = isNG ? 'border-red-300 bg-red-50/20' : (st === 'OK' ? 'border-emerald-300' : 'border-brand-border');

    const okBtnClass = st === 'OK'
      ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
      : 'bg-white text-slate-700 border-brand-border hover:bg-emerald-50';
    const ngBtnClass = st === 'NG'
      ? 'bg-red-500 text-white border-red-500 shadow-xs'
      : 'bg-white text-slate-700 border-brand-border hover:bg-red-50';
    const naBtnClass = st === 'N/A'
      ? 'bg-slate-600 text-white border-slate-600 shadow-xs'
      : 'bg-white text-slate-700 border-brand-border hover:bg-slate-100';

    return '<div id="card-item-' + ans.Item_ID + '" class="bg-white rounded-2xl border ' + cardBorder + ' p-4 shadow-xs space-y-3">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<div class="flex items-center gap-2">' +
          '<span class="w-7 h-7 rounded-lg bg-brand-primary text-white font-mono text-xs font-bold flex items-center justify-center">' + ans.Urutan + '</span>' +
          (ans.Klausul_Ref ? '<span class="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-brand-muted">' + escapeHtml(ans.Klausul_Ref) + '</span>' : '') +
        '</div>' +
        (ans.Wajib_Foto ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Wajib Foto</span>' : '') +
      '</div>' +

      '<div>' +
        '<h3 class="font-bold text-sm md:text-base text-brand-text leading-snug">' + escapeHtml(ans.Pertanyaan_Audit) + '</h3>' +
        (ans.Panduan_Kriteria ? '<p class="text-xs text-brand-muted mt-1">Kriteria: ' + escapeHtml(ans.Panduan_Kriteria) + '</p>' : '') +
      '</div>' +

      '<div class="grid grid-cols-3 gap-2">' +
        '<button type="button" onclick="selectAuditOption(\'' + ans.Item_ID + '\', \'OK\')" class="touch-target rounded-xl border font-bold text-sm transition ' + okBtnClass + '">✓ OK</button>' +
        '<button type="button" onclick="selectAuditOption(\'' + ans.Item_ID + '\', \'NG\')" class="touch-target rounded-xl border font-bold text-sm transition ' + ngBtnClass + '">✕ NG</button>' +
        '<button type="button" onclick="selectAuditOption(\'' + ans.Item_ID + '\', \'N/A\')" class="touch-target rounded-xl border font-bold text-sm transition ' + naBtnClass + '">— N/A</button>' +
      '</div>' +

      '<div>' +
        '<textarea id="note-' + ans.Item_ID + '" onblur="saveItemNote(\'' + ans.Item_ID + '\')" rows="2" placeholder="' + (isNG ? 'Wajib isi deskripsi temuan NG di lapangan...' : 'Catatan pemeriksaan (opsional)...') + '"' +
        ' class="w-full p-2.5 rounded-xl border ' + (isNG ? 'border-red-300 bg-red-50/40' : 'border-brand-border') + ' text-xs focus:outline-none focus:ring-2 focus:ring-brand-accent">' + escapeHtml(ans.Catatan_Temuan || '') + '</textarea>' +
      '</div>' +

      '<div id="photo-box-' + ans.Item_ID + '" class="space-y-2">' +
        renderPhotoBoxHtml(ans) +
      '</div>' +
    '</div>';
  }).join('');

  lucide.createIcons();
}

function renderPhotoBoxHtml(ans) {
  if (ans.Bukti_Foto_URL) {
    return '<div class="p-2.5 rounded-xl bg-slate-50 border border-brand-border flex items-center justify-between gap-3">' +
      '<div class="flex items-center gap-3 min-w-0">' +
        '<img src="' + escapeHtml(ans.Bukti_Foto_URL) + '" onclick="openLightbox(\'' + escapeHtml(ans.Bukti_Foto_URL) + '\')" alt="Bukti" class="w-14 h-14 rounded-lg object-cover border border-slate-200 cursor-pointer shrink-0" />' +
        '<div class="min-w-0">' +
          '<div class="text-xs font-semibold text-emerald-700">✓ Tersimpan di Google Drive</div>' +
          '<button type="button" onclick="openLightbox(\'' + escapeHtml(ans.Bukti_Foto_URL) + '\')" class="text-[11px] text-brand-accent underline">Perbesar Foto</button>' +
        '</div>' +
      '</div>' +
      '<label class="shrink-0 px-3 py-2 rounded-lg bg-white border border-brand-border text-xs font-semibold cursor-pointer hover:bg-slate-100">' +
        'Ganti Foto' +
        '<input type="file" accept="image/*" capture="environment" onchange="handleAuditPhotoInput(\'' + ans.Item_ID + '\', this)" class="hidden" />' +
      '</label>' +
    '</div>';
  }

  return '<label class="w-full touch-target rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 text-brand-primary text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition">' +
    '<i data-lucide="camera" class="w-4 h-4"></i>' +
    '<span>Ambil / Unggah Foto Bukti</span>' +
    '<input type="file" accept="image/*" capture="environment" onchange="handleAuditPhotoInput(\'' + ans.Item_ID + '\', this)" class="hidden" />' +
  '</label>';
}

async function selectAuditOption(itemId, status) {
  if (isAuditeeUser()) return;

  const s = AppState.activeAuditDetail;
  const ans = s.answers.find(function(a) { return a.Item_ID === itemId; });
  if (!ans) return;

  ans.Jawaban_Status = status;
  const noteEl = document.getElementById('note-' + itemId);
  if (noteEl) ans.Catatan_Temuan = noteEl.value;

  renderAuditExecution();

  try {
    await callApi('saveAuditAnswer', {
      Audit_ID: s.Audit_ID,
      Item_ID: itemId,
      Jawaban_Status: status,
      Catatan_Temuan: ans.Catatan_Temuan
    });
  } catch (err) {
    showToast('Gagal menyimpan jawaban: ' + err.message, 'error');
  }
}

async function saveItemNote(itemId) {
  if (isAuditeeUser()) return;

  const s = AppState.activeAuditDetail;
  const ans = s.answers.find(function(a) { return a.Item_ID === itemId; });
  const noteEl = document.getElementById('note-' + itemId);
  if (!ans || !noteEl) return;

  if (ans.Catatan_Temuan === noteEl.value) return;
  ans.Catatan_Temuan = noteEl.value;

  try {
    await callApi('saveAuditAnswer', {
      Audit_ID: s.Audit_ID,
      Item_ID: itemId,
      Jawaban_Status: ans.Jawaban_Status,
      Catatan_Temuan: ans.Catatan_Temuan
    });
  } catch (err) {
    showToast('Gagal menyimpan catatan: ' + err.message, 'error');
  }
}

function compressImageFile(file, maxWidth, quality) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleAuditPhotoInput(itemId, inputEl) {
  if (isAuditeeUser()) return;

  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  const s = AppState.activeAuditDetail;
  const ans = s.answers.find(function(a) { return a.Item_ID === itemId; });
  const photoBox = document.getElementById('photo-box-' + itemId);

  photoBox.innerHTML = '<div class="p-3 rounded-xl bg-blue-50 text-brand-primary text-xs font-semibold flex items-center justify-center gap-2">Mengompresi &amp; mengunggah foto ke Google Drive...</div>';

  try {
    const compressedBase64 = await compressImageFile(file, 1280, 0.75);
    const res = await callApi('uploadAuditPhoto', {
      Audit_ID: s.Audit_ID,
      Item_ID: itemId,
      mimeType: 'image/jpeg',
      base64Data: compressedBase64
    });

    ans.Bukti_Foto_URL = res.data.Bukti_Foto_URL;
    ans.Bukti_Foto_Drive_ID = res.data.Bukti_Foto_Drive_ID;
    photoBox.innerHTML = renderPhotoBoxHtml(ans);
    lucide.createIcons();
    showToast('Foto bukti tersimpan ke Google Drive.', 'success');
  } catch (err) {
    photoBox.innerHTML = '<div class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-2">' +
      '<div>Gagal mengunggah foto: ' + escapeHtml(err.message) + '</div>' +
      renderPhotoBoxHtml(ans) +
    '</div>';
    lucide.createIcons();
  }
}

async function submitCurrentAudit() {
  if (isAuditeeUser()) return;

  const s = AppState.activeAuditDetail;
  if (!s) return;

  if (!confirm('Selesaikan dan submit audit ini? Skor akhir akan dihitung dan hasil akan dikunci.')) return;

  const btn = document.getElementById('exec-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Memproses Submit...';

  try {
    const res = await callApi('submitAuditSession', {
      Audit_ID: s.Audit_ID,
      Ringkasan_Temuan: document.getElementById('exec-summary-notes').value,
      autoCreateTasks: document.getElementById('exec-auto-task').checked
    });
    showToast(res.message + (res.data.createdTasksCount > 0 ? ' (' + res.data.createdTasksCount + ' Task perbaikan dibuat)' : ''), 'success');
    openAuditReport(s.Audit_ID);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="send" class="w-4 h-4"></i><span>Submit Final Audit</span>';
    lucide.createIcons();
  }
}

/* ============================================================================
 * 9. AUDIT REPORT & PRINT VIEW
 * ============================================================================ */

async function openAuditReport(auditId) {
  navigateTo('audit-report');
  const container = document.getElementById('report-document-container');
  container.innerHTML = '<div class="text-center py-8 text-sm text-brand-muted">Menyusun laporan hasil audit...</div>';

  try {
    const res = await callApi('getAuditSessionDetail', { Audit_ID: auditId });
    const s = res.data;

    const okCount = s.answers.filter(function(a) { return a.Jawaban_Status === 'OK'; }).length;
    const ngCount = s.answers.filter(function(a) { return a.Jawaban_Status === 'NG'; }).length;
    const naCount = s.answers.filter(function(a) { return a.Jawaban_Status === 'N/A'; }).length;

    container.innerHTML =
      '<div class="border-b-2 border-brand-primary pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">' +
        '<div>' +
          '<div class="text-xs font-bold uppercase tracking-wider text-brand-primary">YUNAKO Audit &amp; Task Hub</div>' +
          '<h2 class="text-xl font-bold text-brand-text">LAPORAN HASIL AUDIT LAPANGAN</h2>' +
        '</div>' +
        '<div class="text-left sm:text-right font-mono text-xs">' +
          '<div class="font-bold text-brand-primary">' + escapeHtml(s.Audit_ID) + '</div>' +
          '<div class="text-brand-muted">Doc: ' + escapeHtml(s.Kode_Dokumen) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-brand-border">' +
        '<div><span class="text-brand-muted block">Checklist</span><strong>' + escapeHtml(s.Nama_Checklist) + '</strong></div>' +
        '<div><span class="text-brand-muted block">Area / Objek</span><strong>' + escapeHtml(s.Area_Objek_Audit) + '</strong></div>' +
        '<div><span class="text-brand-muted block">Tanggal Audit</span><strong class="font-mono">' + escapeHtml(s.Tanggal_Audit) + '</strong></div>' +
        '<div><span class="text-brand-muted block">Auditor / Auditee</span><strong>' + escapeHtml(s.Auditor_Nama) + ' / ' + escapeHtml(s.Auditee_Nama) + '</strong></div>' +
      '</div>' +

      '<div class="grid grid-cols-4 gap-2 text-center">' +
        '<div class="p-3 rounded-xl bg-blue-50 border border-blue-200"><div class="text-[11px] font-semibold text-brand-primary">Skor Kepatuhan</div><div class="font-mono text-lg md:text-2xl font-bold text-brand-primary">' + escapeHtml(s.Persentase_Kepatuhan) + '%</div></div>' +
        '<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div class="text-[11px] font-semibold text-emerald-700">OK</div><div class="font-mono text-lg md:text-2xl font-bold text-emerald-700">' + okCount + '</div></div>' +
        '<div class="p-3 rounded-xl bg-red-50 border border-red-200"><div class="text-[11px] font-semibold text-red-700">NG</div><div class="font-mono text-lg md:text-2xl font-bold text-red-700">' + ngCount + '</div></div>' +
        '<div class="p-3 rounded-xl bg-slate-100 border border-slate-200"><div class="text-[11px] font-semibold text-slate-600">N/A</div><div class="font-mono text-lg md:text-2xl font-bold text-slate-700">' + naCount + '</div></div>' +
      '</div>' +

      '<div class="space-y-3">' +
        s.answers.map(function(a) {
          const stBadge = a.Jawaban_Status === 'OK'
            ? 'bg-emerald-100 text-emerald-800'
            : (a.Jawaban_Status === 'NG' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700');

          return '<div class="p-3.5 rounded-xl border border-brand-border flex flex-col sm:flex-row justify-between gap-3">' +
            '<div class="space-y-1 flex-1">' +
              '<div class="flex items-center gap-2">' +
                '<span class="font-mono text-xs font-bold">#' + a.Urutan + '</span>' +
                '<span class="text-xs font-bold px-2 py-0.5 rounded ' + stBadge + '">' + escapeHtml(a.Jawaban_Status) + '</span>' +
                (a.Task_ID_Terkait ? '<span class="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">Task: ' + escapeHtml(a.Task_ID_Terkait) + '</span>' : '') +
              '</div>' +
              '<div class="font-semibold text-sm text-brand-text">' + escapeHtml(a.Pertanyaan_Audit) + '</div>' +
              (a.Catatan_Temuan ? '<div class="text-xs text-brand-muted">Catatan: ' + escapeHtml(a.Catatan_Temuan) + '</div>' : '') +
            '</div>' +
            (a.Bukti_Foto_URL ? '<img src="' + escapeHtml(a.Bukti_Foto_URL) + '" onclick="openLightbox(\'' + escapeHtml(a.Bukti_Foto_URL) + '\')" class="w-20 h-20 rounded-lg object-cover border border-slate-200 cursor-pointer shrink-0" />' : '') +
          '</div>';
        }).join('') +
      '</div>' +

      (s.Ringkasan_Temuan ? '<div class="p-4 rounded-xl bg-slate-50 border border-brand-border text-xs"><strong>Kesimpulan Auditor:</strong><p class="mt-1 whitespace-pre-line">' + escapeHtml(s.Ringkasan_Temuan) + '</p></div>' : '');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 10. MODUL ACTIVITY TRIAL REPORT
 * ============================================================================ */

async function loadTrialReports() {
  const container = document.getElementById('trials-list-container');
  container.innerHTML = '<div class="col-span-full bg-white p-6 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Memuat daftar Activity Trial Report...</div>';
  try {
    const res = await callApi('getTrialReports', {});
    AppState.trialReports = res.data || [];
    renderTrialsList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderTrialsList() {
  const q = (document.getElementById('trial-search-input').value || '').toLowerCase();
  const filtered = AppState.trialReports.filter(function(r) {
    return !q ||
      String(r.Nama_Trial).toLowerCase().indexOf(q) > -1 ||
      String(r.Item_Trial).toLowerCase().indexOf(q) > -1 ||
      String(r.No_Lot).toLowerCase().indexOf(q) > -1;
  });

  const container = document.getElementById('trials-list-container');
  if (filtered.length === 0) {
    const emptyMsg = isAuditeeUser()
      ? 'Belum ada laporan Activity Trial yang tersedia untuk dilihat.'
      : 'Belum ada laporan trial. Klik <strong>Buat Laporan Trial</strong> untuk mendokumentasikan aktivitas trial Anda.';
    container.innerHTML = '<div class="col-span-full bg-white p-8 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">' + emptyMsg + '</div>';
    return;
  }

  container.innerHTML = filtered.map(function(r) {
    const decisionClass = r.Status_Keputusan === 'PASS / OK'
      ? 'bg-emerald-50 text-emerald-700'
      : (r.Status_Keputusan === 'FAIL / NG' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700');

    const trialAreaStep = (r.Flow_Steps || []).find(function(st) { return st.isTrial; });
    const trialAreaName = trialAreaStep ? trialAreaStep.step : '-';

    return '<div class="bg-white p-4 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between gap-3">' +
      '<div class="space-y-1.5">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="font-mono text-xs font-bold text-brand-primary">' + escapeHtml(r.Trial_ID) + '</span>' +
          '<span class="text-xs font-bold px-2.5 py-0.5 rounded-full ' + decisionClass + '">' + escapeHtml(r.Status_Keputusan) + '</span>' +
        '</div>' +
        '<h3 class="font-bold text-base text-brand-text leading-snug">' + escapeHtml(r.Nama_Trial) + '</h3>' +
        '<div class="text-xs text-brand-muted">Item: <strong>' + escapeHtml(r.Item_Trial) + '</strong> • Lot: <span class="font-mono">' + escapeHtml(r.No_Lot) + '</span> (' + r.Qty_Trial + ' pcs)</div>' +
        '<div class="flex flex-wrap gap-1.5 pt-1">' +
          '<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">Area Trial: ' + escapeHtml(trialAreaName) + '</span>' +
          '<span class="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-brand-primary">Larutan: ' + escapeHtml(r.Konsentrasi_Trial) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">' +
        '<div class="text-xs font-mono">' +
          '<span class="text-emerald-700 font-bold">OK: ' + r.Qty_OK + '</span> / ' +
          '<span class="text-red-600 font-bold">NG: ' + r.Qty_NG + '</span>' +
        '</div>' +
        '<button onclick="openTrialReportView(\'' + escapeHtml(r.Trial_ID) + '\')" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-brand-primary text-xs font-semibold">Lihat &amp; Cetak Report</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openTrialForm(existingTrial) {
  if (isAuditeeUser()) return;

  navigateTo('trial-form');
  const today = new Date().toISOString().slice(0, 10);
  AppState.trialPendingPhotoBase64 = null;

  if (existingTrial) {
    document.getElementById('trial-form-badge').textContent = 'EDIT: ' + existingTrial.Trial_ID;
    document.getElementById('trl-id').value = existingTrial.Trial_ID;
    document.getElementById('trl-nama').value = existingTrial.Nama_Trial || '';
    document.getElementById('trl-tujuan').value = existingTrial.Tujuan_Trial || '';
    document.getElementById('trl-tanggal').value = existingTrial.Tanggal_Trial || today;
    document.getElementById('trl-item').value = existingTrial.Item_Trial || '';
    document.getElementById('trl-lot').value = existingTrial.No_Lot || '';
    document.getElementById('trl-qty').value = existingTrial.Qty_Trial || 50;
    document.getElementById('trl-kons-std').value = existingTrial.Konsentrasi_Standar || '';
    document.getElementById('trl-kons-trial').value = existingTrial.Konsentrasi_Trial || '';
    document.getElementById('trl-param-lain').value = existingTrial.Parameter_Proses_Lain || '';
    document.getElementById('trl-qty-ok').value = existingTrial.Qty_OK || 0;
    document.getElementById('trl-qty-ng').value = existingTrial.Qty_NG || 0;
    document.getElementById('trl-catatan-visual').value = existingTrial.Catatan_Visual || '';
    document.getElementById('trl-keputusan').value = existingTrial.Status_Keputusan || 'PASS / OK';
    document.getElementById('trl-kesimpulan').value = existingTrial.Kesimpulan_Trial || '';
    document.getElementById('trl-next').value = existingTrial.Next_Trial_Plan || '';

    AppState.trialFlowSteps = Array.isArray(existingTrial.Flow_Steps) && existingTrial.Flow_Steps.length > 0
      ? existingTrial.Flow_Steps
      : [{ step: 'Degreasing', isTrial: false }, { step: 'Pickling', isTrial: true }, { step: 'Plating', isTrial: false }];
    AppState.trialExistingPhotoUrl = existingTrial.Foto_Bukti_URL || '';
  } else {
    document.getElementById('trial-form-badge').textContent = 'TRIAL BARU';
    document.getElementById('trial-report-form').reset();
    document.getElementById('trl-id').value = '';
    document.getElementById('trl-tanggal').value = today;
    document.getElementById('trl-qty').value = 50;
    document.getElementById('trl-qty-ok').value = 50;
    document.getElementById('trl-qty-ng').value = 0;
    AppState.trialFlowSteps = [
      { step: 'Degreasing', isTrial: false },
      { step: 'Pickling', isTrial: true },
      { step: 'Water Rinse', isTrial: false },
      { step: 'Plating', isTrial: false }
    ];
    AppState.trialExistingPhotoUrl = '';
  }

  renderTrialPhotoPreview();
  recalcTrialVisualStats();
  renderTrialFlowEditor();
}

function addTrialFlowStep() {
  AppState.trialFlowSteps.push({ step: '', isTrial: false });
  renderTrialFlowEditor();
}

function removeTrialFlowStep(idx) {
  if (AppState.trialFlowSteps.length <= 1) return;
  AppState.trialFlowSteps.splice(idx, 1);
  renderTrialFlowEditor();
}

function updateTrialFlowStepName(idx, val) {
  AppState.trialFlowSteps[idx].step = val;
  renderTrialFlowPreviewOnly();
}

function toggleTrialFlowArea(idx) {
  AppState.trialFlowSteps[idx].isTrial = !AppState.trialFlowSteps[idx].isTrial;
  renderTrialFlowEditor();
}

function renderTrialFlowPreviewOnly() {
  const previewEl = document.getElementById('trl-flow-preview');
  previewEl.innerHTML = AppState.trialFlowSteps.map(function(st, i) {
    const label = st.step.trim() || ('Tahap ' + (i + 1));
    const boxHtml = st.isTrial
      ? '<div class="px-3 py-2 rounded-xl bg-amber-100 border-2 border-amber-500 text-amber-950 shadow-xs">' +
          '<div class="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">★ AREA TRIAL</div>' +
          '<div class="text-xs font-bold">' + (i + 1) + '. ' + escapeHtml(label) + '</div>' +
        '</div>'
      : '<div class="px-3 py-2 rounded-xl bg-white border border-brand-border text-brand-text">' +
          '<div class="text-[10px] text-brand-muted">Proses Standar</div>' +
          '<div class="text-xs font-semibold">' + (i + 1) + '. ' + escapeHtml(label) + '</div>' +
        '</div>';

    const arrow = (i < AppState.trialFlowSteps.length - 1)
      ? '<span class="text-slate-400 font-bold text-sm">→</span>'
      : '';
    return boxHtml + arrow;
  }).join('');
}

function renderTrialFlowEditor() {
  renderTrialFlowPreviewOnly();
  const editorEl = document.getElementById('trl-flow-steps-editor');
  editorEl.innerHTML = AppState.trialFlowSteps.map(function(st, idx) {
    const toggleBtnClass = st.isTrial
      ? 'bg-amber-500 text-white border-amber-500'
      : 'bg-white text-brand-muted border-brand-border hover:bg-amber-50';

    return '<div class="flex items-center gap-2">' +
      '<span class="w-6 text-center font-mono text-xs font-bold text-brand-muted">' + (idx + 1) + '.</span>' +
      '<input type="text" value="' + escapeHtml(st.step) + '" oninput="updateTrialFlowStepName(' + idx + ', this.value)" placeholder="Nama proses (misal: Degreasing, Pickling...)"' +
      ' class="flex-1 px-3 py-2 rounded-xl border border-brand-border text-xs font-medium" />' +
      '<button type="button" onclick="toggleTrialFlowArea(' + idx + ')" class="px-3 py-2 rounded-xl border text-xs font-bold shrink-0 transition ' + toggleBtnClass + '">' +
        (st.isTrial ? '★ Area Trial' : 'Tandai Trial') +
      '</button>' +
      '<button type="button" onclick="removeTrialFlowStep(' + idx + ')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Hapus tahap">' +
        '<i data-lucide="x" class="w-4 h-4"></i>' +
      '</button>' +
    '</div>';
  }).join('');
  lucide.createIcons();
}

function recalcTrialVisualStats() {
  const total = Number(document.getElementById('trl-qty').value || 0);
  const ok = Number(document.getElementById('trl-qty-ok').value || 0);
  const rate = total > 0 ? Math.round((ok / total) * 1000) / 10 : 0;
  document.getElementById('trl-yield-badge').textContent = rate + '% OK';
}

function renderTrialPhotoPreview() {
  const box = document.getElementById('trl-photo-preview-box');
  const src = AppState.trialPendingPhotoBase64 || AppState.trialExistingPhotoUrl;
  if (!src) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = '<div class="p-2.5 rounded-xl bg-slate-50 border border-brand-border flex items-center gap-3">' +
    '<img src="' + escapeHtml(src) + '" onclick="openLightbox(\'' + escapeHtml(src) + '\')" class="w-16 h-16 rounded-lg object-cover border border-slate-200 cursor-pointer" />' +
    '<div class="text-xs">' +
      '<div class="font-semibold text-emerald-700">' + (AppState.trialPendingPhotoBase64 ? 'Foto siap diunggah saat simpan' : 'Tersimpan di Google Drive') + '</div>' +
      '<button type="button" onclick="openLightbox(\'' + escapeHtml(src) + '\')" class="text-brand-accent underline">Klik untuk perbesar</button>' +
    '</div>' +
  '</div>';
}

async function previewSelectedTrialPhoto(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  try {
    AppState.trialPendingPhotoBase64 = await compressImageFile(file, 1280, 0.75);
    renderTrialPhotoPreview();
  } catch (err) {
    showToast('Gagal memproses foto: ' + err.message, 'error');
  }
}

async function handleTrialFormSubmit(e) {
  e.preventDefault();
  if (isAuditeeUser()) return;

  const btn = document.getElementById('trl-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Menyimpan Laporan Trial...';

  const cleanSteps = AppState.trialFlowSteps
    .filter(function(s) { return s.step.trim() !== ''; })
    .map(function(s) { return { step: s.step.trim(), isTrial: Boolean(s.isTrial) }; });

  try {
    const res = await callApi('saveTrialReport', {
      Trial_ID: document.getElementById('trl-id').value,
      Nama_Trial: document.getElementById('trl-nama').value,
      Tujuan_Trial: document.getElementById('trl-tujuan').value,
      Tanggal_Trial: document.getElementById('trl-tanggal').value,
      Item_Trial: document.getElementById('trl-item').value,
      No_Lot: document.getElementById('trl-lot').value,
      Qty_Trial: Number(document.getElementById('trl-qty').value || 0),
      Flow_Steps: cleanSteps,
      Konsentrasi_Standar: document.getElementById('trl-kons-std').value,
      Konsentrasi_Trial: document.getElementById('trl-kons-trial').value,
      Parameter_Proses_Lain: document.getElementById('trl-param-lain').value,
      Qty_OK: Number(document.getElementById('trl-qty-ok').value || 0),
      Qty_NG: Number(document.getElementById('trl-qty-ng').value || 0),
      Catatan_Visual: document.getElementById('trl-catatan-visual').value,
      Status_Keputusan: document.getElementById('trl-keputusan').value,
      Kesimpulan_Trial: document.getElementById('trl-kesimpulan').value,
      Next_Trial_Plan: document.getElementById('trl-next').value
    });

    const savedTrialId = res.data.Trial_ID;

    if (AppState.trialPendingPhotoBase64) {
      btn.textContent = 'Mengunggah Foto ke Drive...';
      await callApi('uploadTrialPhoto', {
        Trial_ID: savedTrialId,
        mimeType: 'image/jpeg',
        base64Data: AppState.trialPendingPhotoBase64
      });
      AppState.trialPendingPhotoBase64 = null;
    }

    showToast(res.message, 'success');
    openTrialReportView(savedTrialId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Activity Trial Report';
  }
}

async function openTrialReportView(trialId) {
  navigateTo('trial-report');
  const container = document.getElementById('trial-report-document');
  container.innerHTML = '<div class="text-center py-8 text-sm text-brand-muted">Menyusun Activity Trial Report...</div>';

  try {
    const res = await callApi('getTrialReportDetail', { Trial_ID: trialId });
    const r = res.data;

    const editBtn = document.getElementById('trl-report-edit-btn');
    if (editBtn) {
      editBtn.classList.toggle('hidden', isAuditeeUser());
      editBtn.onclick = function() { openTrialForm(r); };
    }

    const total = Number(r.Qty_Trial || 0);
    const okPct = total > 0 ? Math.round((Number(r.Qty_OK || 0) / total) * 1000) / 10 : 0;

    const flowHtml = (r.Flow_Steps || []).map(function(st, i) {
      const box = st.isTrial
        ? '<div class="px-3.5 py-2.5 rounded-xl bg-amber-100 border-2 border-amber-500 text-amber-950">' +
            '<div class="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">★ AREA TRIAL</div>' +
            '<div class="text-xs font-bold">' + (i + 1) + '. ' + escapeHtml(st.step) + '</div>' +
          '</div>'
        : '<div class="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-brand-border text-brand-text">' +
            '<div class="text-[10px] text-brand-muted">Standar</div>' +
            '<div class="text-xs font-semibold">' + (i + 1) + '. ' + escapeHtml(st.step) + '</div>' +
          '</div>';
      const arrow = (i < r.Flow_Steps.length - 1) ? '<span class="text-slate-400 font-bold">→</span>' : '';
      return box + arrow;
    }).join('');

    const badgeColor = r.Status_Keputusan === 'PASS / OK'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : (r.Status_Keputusan === 'FAIL / NG' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300');

    container.innerHTML =
      '<div class="border-b-2 border-brand-primary pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">' +
        '<div>' +
          '<div class="text-xs font-bold uppercase tracking-wider text-brand-primary">YUNAKO Audit &amp; Task Hub</div>' +
          '<h2 class="text-xl font-bold text-brand-text">ACTIVITY TRIAL REPORT</h2>' +
        '</div>' +
        '<div class="text-left sm:text-right font-mono text-xs">' +
          '<div class="font-bold text-brand-primary">' + escapeHtml(r.Trial_ID) + '</div>' +
          '<div class="text-brand-muted">PIC: ' + escapeHtml(r.Creator_Nama) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="space-y-2">' +
        '<h3 class="text-base font-bold text-brand-text">' + escapeHtml(r.Nama_Trial) + '</h3>' +
        '<p class="text-xs text-brand-muted"><strong>Tujuan Trial:</strong> ' + escapeHtml(r.Tujuan_Trial) + '</p>' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-brand-border mt-2">' +
          '<div><span class="text-brand-muted block">Tanggal Trial</span><strong class="font-mono">' + escapeHtml(r.Tanggal_Trial) + '</strong></div>' +
          '<div><span class="text-brand-muted block">Item Trial</span><strong>' + escapeHtml(r.Item_Trial) + '</strong></div>' +
          '<div><span class="text-brand-muted block">Nomor Lot</span><strong class="font-mono">' + escapeHtml(r.No_Lot) + '</strong></div>' +
          '<div><span class="text-brand-muted block">Qty Sampel</span><strong class="font-mono">' + r.Qty_Trial + ' pcs</strong></div>' +
        '</div>' +
      '</div>' +

      '<div class="space-y-2">' +
        '<div class="text-xs font-bold uppercase tracking-wider text-brand-primary">Flow Trial &amp; Penanda Area Trial</div>' +
        '<div class="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-brand-border">' + flowHtml + '</div>' +
      '</div>' +

      '<div class="space-y-2">' +
        '<div class="text-xs font-bold uppercase tracking-wider text-brand-primary">Parameter Proses &amp; Konsentrasi Larutan</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">' +
          '<div class="p-3 rounded-xl bg-slate-50 border border-brand-border"><span class="text-brand-muted block">Konsentrasi Larutan Standar</span><strong>' + escapeHtml(r.Konsentrasi_Standar) + '</strong></div>' +
          '<div class="p-3 rounded-xl bg-blue-50 border border-blue-200"><span class="text-brand-primary block font-semibold">Konsentrasi Larutan Trial (Diuji)</span><strong class="text-brand-primary text-sm">' + escapeHtml(r.Konsentrasi_Trial) + '</strong></div>' +
        '</div>' +
        (r.Parameter_Proses_Lain ? '<div class="p-3 rounded-xl bg-slate-50 border border-brand-border text-xs"><strong>Parameter Pendukung:</strong> ' + escapeHtml(r.Parameter_Proses_Lain) + '</div>' : '') +
      '</div>' +

      '<div class="space-y-3">' +
        '<div class="text-xs font-bold uppercase tracking-wider text-brand-primary">Hasil Inspeksi Visual (OK &amp; NG)</div>' +
        '<div class="grid grid-cols-3 gap-2 text-center">' +
          '<div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><div class="text-[11px] font-semibold text-emerald-700">Visual OK</div><div class="font-mono text-lg font-bold text-emerald-700">' + r.Qty_OK + ' pcs</div></div>' +
          '<div class="p-3 rounded-xl bg-red-50 border border-red-200"><div class="text-[11px] font-semibold text-red-700">Visual NG</div><div class="font-mono text-lg font-bold text-red-700">' + r.Qty_NG + ' pcs</div></div>' +
          '<div class="p-3 rounded-xl bg-blue-50 border border-blue-200"><div class="text-[11px] font-semibold text-brand-primary">OK Rate</div><div class="font-mono text-lg font-bold text-brand-primary">' + okPct + '%</div></div>' +
        '</div>' +
        '<div class="flex flex-col sm:flex-row gap-4 items-start p-3.5 rounded-xl border border-brand-border">' +
          '<div class="flex-1 text-xs space-y-1"><strong>Catatan Inspeksi Visual:</strong><p class="text-brand-muted whitespace-pre-line">' + escapeHtml(r.Catatan_Visual || '-') + '</p></div>' +
          (r.Foto_Bukti_URL ? '<img src="' + escapeHtml(r.Foto_Bukti_URL) + '" onclick="openLightbox(\'' + escapeHtml(r.Foto_Bukti_URL) + '\')" class="w-28 h-28 rounded-xl object-cover border border-slate-200 cursor-pointer shrink-0" />' : '') +
        '</div>' +
      '</div>' +

      '<div class="p-4 rounded-xl border ' + badgeColor + ' space-y-2 text-xs">' +
        '<div class="font-bold text-sm">Keputusan Trial: ' + escapeHtml(r.Status_Keputusan) + '</div>' +
        '<div><strong>Kesimpulan:</strong><p class="mt-0.5 whitespace-pre-line">' + escapeHtml(r.Kesimpulan_Trial) + '</p></div>' +
        (r.Next_Trial_Plan ? '<div class="pt-2 border-t border-black/10"><strong>Next Trial / Tindak Lanjut:</strong><p class="mt-0.5 whitespace-pre-line">' + escapeHtml(r.Next_Trial_Plan) + '</p></div>' : '') +
      '</div>';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ============================================================================
 * 11. MASTER CHECKLIST TEMPLATES (ADMIN)
 * ============================================================================ */

async function loadTemplates() {
  if (isAuditeeUser()) return;

  const container = document.getElementById('templates-list-container');
  container.innerHTML = '<div class="col-span-full bg-white p-6 rounded-2xl border border-brand-border text-center text-sm text-brand-muted">Memuat master template...</div>';
  try {
    const res = await callApi('getAuditTemplates', {});
    AppState.templates = res.data || [];
    const isAdmin = AppState.user.Role === 'Admin';

    container.innerHTML = AppState.templates.map(function(t) {
      return '<div class="bg-white p-4 rounded-2xl border border-brand-border shadow-xs flex flex-col justify-between gap-3">' +
        '<div>' +
          '<div class="flex items-center justify-between mb-1.5">' +
            '<span class="font-mono text-xs font-bold text-brand-primary">' + escapeHtml(t.Kode_Dokumen) + '</span>' +
            '<span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-brand-primary">' + t.Total_Items + ' Item</span>' +
          '</div>' +
          '<h3 class="font-bold text-base text-brand-text">' + escapeHtml(t.Nama_Checklist) + '</h3>' +
          '<p class="text-xs text-brand-muted mt-1">' + escapeHtml(t.Deskripsi) + '</p>' +
        '</div>' +
        '<div class="pt-3 border-t border-slate-100 flex justify-end gap-2">' +
          (isAdmin ? '<button onclick="openTemplateEditorModal(\'' + escapeHtml(t.Template_ID) + '\')" class="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-brand-primary text-xs font-semibold">Edit Pertanyaan</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openTemplateEditorModal(templateId) {
  if (isAuditeeUser()) return;

  let existing = { Template_ID: '', Kode_Dokumen: '', Nama_Checklist: '', Kategori_Audit: 'Internal Quality', Deskripsi: '', items: [] };
  if (templateId) {
    const res = await callApi('getTemplateDetail', { Template_ID: templateId });
    existing = res.data;
  } else {
    existing.items = [{ Klausul_Ref: '', Pertanyaan_Audit: '', Panduan_Kriteria: '', Wajib_Foto: false, Bobot_Skor: 1 }];
  }

  function buildItemRowHtml(it, idx) {
    return '<div class="tmpl-item-row p-3 rounded-xl bg-slate-50 border border-brand-border space-y-2">' +
      '<div class="flex items-center justify-between">' +
        '<span class="font-mono text-xs font-bold text-brand-primary">Item #' + (idx + 1) + '</span>' +
        '<button type="button" onclick="this.closest(\'.tmpl-item-row\').remove()" class="text-xs text-red-600 font-semibold">Hapus</button>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2">' +
        '<input type="text" class="itm-klausul px-2.5 py-1.5 rounded-lg border border-brand-border text-xs" placeholder="Klausul (misal ISO 9001)" value="' + escapeHtml(it.Klausul_Ref || '') + '" />' +
        '<input type="number" class="itm-bobot px-2.5 py-1.5 rounded-lg border border-brand-border text-xs" min="1" max="10" value="' + (it.Bobot_Skor || 1) + '" />' +
      '</div>' +
      '<textarea rows="2" class="itm-pertanyaan w-full px-2.5 py-1.5 rounded-lg border border-brand-border text-xs" required placeholder="Pertanyaan checklist audit...">' + escapeHtml(it.Pertanyaan_Audit || '') + '</textarea>' +
      '<input type="text" class="itm-panduan w-full px-2.5 py-1.5 rounded-lg border border-brand-border text-xs" placeholder="Panduan kriteria OK/NG..." value="' + escapeHtml(it.Panduan_Kriteria || '') + '" />' +
      '<label class="flex items-center gap-2 text-xs font-medium text-brand-text">' +
        '<input type="checkbox" class="itm-foto rounded"' + (it.Wajib_Foto ? ' checked' : '') + ' />' +
        '<span>Wajib lampirkan foto bukti</span>' +
      '</label>' +
    '</div>';
  }

  openModal(templateId ? 'Edit Master Template' : 'Buat Master Template Baru',
    '<form id="template-editor-form" class="space-y-3">' +
      '<div class="grid grid-cols-2 gap-2">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Kode Dokumen</label>' +
        '<input type="text" id="tpl-kode" value="' + escapeHtml(existing.Kode_Dokumen) + '" placeholder="FRM-AUD-02" class="w-full px-3 py-2 rounded-xl border border-brand-border text-xs" /></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Kategori</label>' +
        '<input type="text" id="tpl-kat" value="' + escapeHtml(existing.Kategori_Audit) + '" class="w-full px-3 py-2 rounded-xl border border-brand-border text-xs" /></div>' +
      '</div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Nama Checklist *</label>' +
      '<input type="text" id="tpl-nama" required value="' + escapeHtml(existing.Nama_Checklist) + '" class="w-full px-3 py-2 rounded-xl border border-brand-border text-sm" /></div>' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Deskripsi</label>' +
      '<input type="text" id="tpl-desc" value="' + escapeHtml(existing.Deskripsi) + '" class="w-full px-3 py-2 rounded-xl border border-brand-border text-xs" /></div>' +
      '<div class="flex items-center justify-between pt-2">' +
        '<span class="text-xs font-bold text-brand-text">Daftar Butir Pertanyaan</span>' +
        '<button type="button" id="add-tmpl-item-btn" class="text-xs font-semibold text-brand-accent">+ Tambah Item</button>' +
      '</div>' +
      '<div id="tmpl-items-wrapper" class="space-y-2.5">' +
        existing.items.map(buildItemRowHtml).join('') +
      '</div>' +
      '<button type="submit" class="w-full touch-target bg-brand-accent text-white font-semibold rounded-xl text-sm">Simpan Master Template</button>' +
    '</form>'
  );

  document.getElementById('add-tmpl-item-btn').addEventListener('click', function() {
    const wrapper = document.getElementById('tmpl-items-wrapper');
    const count = wrapper.querySelectorAll('.tmpl-item-row').length;
    wrapper.insertAdjacentHTML('beforeend', buildItemRowHtml({ Wajib_Foto: false, Bobot_Skor: 1 }, count));
  });

  document.getElementById('template-editor-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const itemNodes = document.querySelectorAll('#tmpl-items-wrapper .tmpl-item-row');
    const items = Array.from(itemNodes).map(function(node) {
      return {
        Klausul_Ref: node.querySelector('.itm-klausul').value,
        Bobot_Skor: Number(node.querySelector('.itm-bobot').value || 1),
        Pertanyaan_Audit: node.querySelector('.itm-pertanyaan').value,
        Panduan_Kriteria: node.querySelector('.itm-panduan').value,
        Wajib_Foto: node.querySelector('.itm-foto').checked
      };
    });

    try {
      const res = await callApi('saveAuditTemplate', {
        Template_ID: existing.Template_ID,
        Kode_Dokumen: document.getElementById('tpl-kode').value,
        Kategori_Audit: document.getElementById('tpl-kat').value,
        Nama_Checklist: document.getElementById('tpl-nama').value,
        Deskripsi: document.getElementById('tpl-desc').value,
        items: items
      });
      closeModal();
      showToast(res.message, 'success');
      loadTemplates();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ============================================================================
 * 12. SETTINGS, ADMIN USERS & LOGS
 * ============================================================================ */

async function loadSettingsData() {
  if (AppState.user.Role !== 'Admin') return;

  try {
    const [uRes, lRes] = await Promise.all([
      callApi('getUsers', {}),
      callApi('getActivityLogs', {})
    ]);

    const users = uRes.data || [];
    document.getElementById('users-list-container').innerHTML = users.map(function(u) {
      return '<div class="p-3 rounded-xl border border-brand-border flex items-center justify-between gap-2">' +
        '<div>' +
          '<div class="font-bold text-sm text-brand-text">' + escapeHtml(u.Nama_Lengkap) + ' <span class="font-mono text-xs text-brand-muted">(@' + escapeHtml(u.Username) + ')</span></div>' +
          '<div class="text-xs text-brand-muted">' + escapeHtml(u.Role) + ' • ' + escapeHtml(u.Departemen) + ' • ' + (u.Status_Aktif ? 'Aktif' : 'Nonaktif') + '</div>' +
        '</div>' +
        '<button onclick=\'openUserModal(' + JSON.stringify(u) + ')\' class="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold">Edit</button>' +
      '</div>';
    }).join('');

    const logs = lRes.data || [];
    document.getElementById('logs-list-container').innerHTML = logs.map(function(l) {
      return '<div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">' +
        '<div><span class="font-mono font-bold text-brand-primary">[' + escapeHtml(l.Action_Type) + ']</span> <strong>' + escapeHtml(l.User_Nama) + '</strong>: ' + escapeHtml(l.Detail_Aktivitas) + '</div>' +
        '<div class="font-mono text-[10px] text-brand-muted">' + escapeHtml(l.Timestamp) + '</div>' +
      '</div>';
    }).join('');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openUserModal(existingUser) {
  if (AppState.user.Role !== 'Admin') return;

  const u = existingUser || { User_ID: '', Username: '', Nama_Lengkap: '', Role: 'Auditor', Departemen: '', Status_Aktif: true };

  openModal(u.User_ID ? 'Edit Pengguna' : 'Tambah Pengguna Baru',
    '<form id="admin-user-form" class="space-y-3">' +
      '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Nama Lengkap *</label>' +
      '<input type="text" id="usr-nama" required value="' + escapeHtml(u.Nama_Lengkap) + '" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Username *</label>' +
        '<input type="text" id="usr-username" required value="' + escapeHtml(u.Username) + '" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Role *</label>' +
        '<select id="usr-role" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm">' +
          ['Admin', 'Auditor', 'Auditee'].map(function(r) {
            return '<option value="' + r + '"' + (u.Role === r ? ' selected' : '') + '>' + r + '</option>';
          }).join('') +
        '</select></div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-3">' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">Departemen</label>' +
        '<input type="text" id="usr-dept" value="' + escapeHtml(u.Departemen) + '" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
        '<div><label class="block text-xs font-semibold text-brand-muted mb-1">' + (u.User_ID ? 'Reset Password (Opsional)' : 'Password *') + '</label>' +
        '<input type="password" id="usr-pass" ' + (u.User_ID ? '' : 'required minlength="6"') + ' placeholder="Min. 6 karakter" class="w-full px-3 py-2.5 rounded-xl border border-brand-border text-sm" /></div>' +
      '</div>' +
      (u.User_ID ? '<label class="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" id="usr-aktif"' + (u.Status_Aktif ? ' checked' : '') + ' /> Akun Aktif</label>' : '') +
      '<button type="submit" class="w-full touch-target bg-brand-accent text-white font-semibold rounded-xl text-sm">Simpan Pengguna</button>' +
    '</form>'
  );

  document.getElementById('admin-user-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    try {
      const res = await callApi('saveUser', {
        User_ID: u.User_ID,
        Nama_Lengkap: document.getElementById('usr-nama').value,
        Username: document.getElementById('usr-username').value,
        Role: document.getElementById('usr-role').value,
        Departemen: document.getElementById('usr-dept').value,
        Password: document.getElementById('usr-pass').value,
        Status_Aktif: u.User_ID ? document.getElementById('usr-aktif').checked : true
      });
      closeModal();
      showToast(res.message, 'success');
      loadSettingsData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

/* ============================================================================
 * 13. MODAL & LIGHTBOX HELPERS
 * ============================================================================ */

function openModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-backdrop').classList.remove('hidden');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox-modal').classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightbox-modal').classList.add('hidden');
  document.getElementById('lightbox-img').src = '';
}