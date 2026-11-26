/* =============================================================
   admin.js – Phần DÙNG CHUNG cho mọi trang Admin
   -------------------------------------------------------------
   1. CONFIG        : tên key LocalStorage, danh sách trang, nhãn hiển thị
   2. Data layer    : đọc/ghi LocalStorage và phân loại tài khoản
   3. Tiện ích      : esc(), formatDate(), toast(), confirmDialog()
   4. Layout        : tự dựng Sidebar + Header cho từng trang
   5. API công khai : window.UTC2Admin (các trang khác dùng lại)
   ============================================================= */
(function () {
  'use strict';

  /* ---------- 1. CONFIG ---------- */
  const DEFAULTS = {
    KEYS: {
      USERS: 'utc2_users',
      POSTS: 'utc2_posts',
      SESSION: 'utc2_currentUser',            // phiên đăng nhập do TV4 quản lý, dạng { id, fullName, role }
      SIDEBAR: 'utc2_admin_sidebar_collapsed', // chỉ dùng riêng cho admin
      SIDEBAR_WIDTH: 'utc2_admin_sidebar_width'
    },
    REQUIRE_LOGIN: true,
    LOGIN_URL: 'login.html',
    LOGOUT_URL: 'login.html',
    PAGES: [
      { key: 'dashboard', label: 'Tổng quan', href: 'dashboard.html', icon: 'grid', group: 'system' },
      { key: 'users', label: 'Tài khoản', href: 'users.html', icon: 'users', group: 'management' },
      { key: 'posts', label: 'Tin đăng', href: 'posts.html', icon: 'file', group: 'management' }
    ]
  };

  /* Có thể ghi đè cấu hình mà KHÔNG sửa file này: đặt trước thẻ <script src="script/admin.js">
       <script>window.UTC2_ADMIN_CONFIG = { REQUIRE_LOGIN: true, LOGIN_URL: 'login.html',
                                            KEYS: { USERS: 'tên_key_khác' } };</script> */
  const OVERRIDE = window.UTC2_ADMIN_CONFIG || {};
  const CONFIG = Object.assign({}, DEFAULTS, OVERRIDE, {
    KEYS: Object.assign({}, DEFAULTS.KEYS, OVERRIDE.KEYS || {})
  });

  const TYPE_LABEL = {
    exchange: 'Trao đổi đồ cũ',
    gift: 'Cho tặng đồ cũ',
    lost: 'Báo mất đồ',
    found: 'Nhặt được đồ'
  };
  const POST_STATUS_LABEL = {
    pending: 'Chờ duyệt',
    approved: 'Đang đăng',
    hidden: 'Ẩn tin',
    completed: 'Đã trao đổi',
    resolved: 'Đã trao trả'
  };
  const USER_STATUS_LABEL = { active: 'Hoạt động', locked: 'Đã khóa' };
  const ROLE_LABEL = { user: 'Người dùng', admin: 'Quản trị viên' };
  const POST_SOURCES = {
    exchange: 'utc2-reshare-item-exchange-v1',
    lostFound: 'utc2-reshare-lost-found-v1',
    statusOverrides: 'utc2-admin-post-statuses-v1'
  };
  const POST_CODE_COUNTER_KEY = 'utc2-reshare-post-code-counter-v1';
  const LOGIN_ACCOUNT_EMAILS = new Set([
    'admin@st.utc2.edu.vn',
    'nguyenvanan@gmail.com',
  ]);

  /* ---------- 2. DATA LAYER ---------- */
  function readList(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return [];
      const data = JSON.parse(raw);
      // Chỉ giữ các phần tử là object, tránh lỗi khi dữ liệu bị sửa tay hoặc hỏng
      return Array.isArray(data) ? data.filter(x => x && typeof x === 'object') : [];
    } catch (err) {
      console.error('[admin] Không đọc được', key, err);
      return [];
    }
  }

  function writeList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (err) {
      console.error('[admin] Không ghi được', key, err);
      toast('Không thể lưu dữ liệu. Hãy kiểm tra dung lượng hoặc quyền LocalStorage.', 'error');
      return false;
    }
  }

  function getUserRole(user) {
    const role = user && user.role;
    return role === 'admin' ? 'admin' : 'user';
  }

  function allocatePostCode(usedCodes) {
    const savedCounter = localStorage.getItem(POST_CODE_COUNTER_KEY);
    let counter = savedCounter === null ? 0 : Number(savedCounter);
    if (!Number.isInteger(counter) || counter < 0 || counter > 999999) {
      throw new Error('Bộ đếm mã tin không hợp lệ.');
    }

    usedCodes.forEach(code => {
      counter = Math.max(counter, Number(code));
    });
    for (let next = counter + 1; next <= 999999; next += 1) {
      const code = String(next).padStart(6, '0');
      if (usedCodes.has(code)) continue;
      localStorage.setItem(POST_CODE_COUNTER_KEY, String(next));
      usedCodes.add(code);
      return code;
    }
    throw new Error('Đã hết mã tin 6 chữ số.');
  }

  function ensurePostCodes() {
    const exchangePosts = readList(POST_SOURCES.exchange);
    const lostFoundPosts = readList(POST_SOURCES.lostFound);
    const allPosts = exchangePosts.concat(lostFoundPosts);
    const usedCodes = new Set();
    const postsToAssign = [];

    allPosts.forEach(post => {
      const code = post.postCode;
      if (typeof code === 'string' && /^\d{6}$/.test(code) && !usedCodes.has(code)) {
        usedCodes.add(code);
      } else {
        postsToAssign.push(post);
      }
    });

    if (postsToAssign.length) {
      try {
        postsToAssign.forEach(post => {
          post.postCode = allocatePostCode(usedCodes);
        });
        if (exchangePosts.some(post => postsToAssign.includes(post)) &&
          !writeList(POST_SOURCES.exchange, exchangePosts)) {
          throw new Error('Không thể lưu mã tin trao đổi.');
        }
        if (lostFoundPosts.some(post => postsToAssign.includes(post)) &&
          !writeList(POST_SOURCES.lostFound, lostFoundPosts)) {
          throw new Error('Không thể lưu mã tin thất lạc.');
        }
      } catch (err) {
        console.error('[admin] Không thể cấp mã tin 6 chữ số.', err);
        toast('Không thể cấp hoặc lưu mã tin 6 chữ số.', 'error');
        throw err;
      }
    }

    return { exchangePosts, lostFoundPosts };
  }

  function getUsers() {
    const storedUsers = readList(CONFIG.KEYS.USERS);
<<<<<<< Updated upstream
    return storedUsers.map(user => Object.assign({}, user, { role: getUserRole(user) }));
=======
    const users = storedUsers.filter(user =>
      LOGIN_ACCOUNT_EMAILS.has(String(user.email || '').trim().toLowerCase())
    );
    const normalizedUsers = users.map(user =>
      Object.assign({}, user, { role: getUserRole(user) })
    );
    const rolesChanged = normalizedUsers.some((user, index) => user.role !== users[index].role);
    if (users.length !== storedUsers.length || rolesChanged) {
      writeList(CONFIG.KEYS.USERS, normalizedUsers);
    }
    return normalizedUsers;
>>>>>>> Stashed changes
  }
  function getPosts() {
    try {
      localStorage.removeItem(CONFIG.KEYS.POSTS);
    } catch (err) {
      console.error('[admin] Không thể xóa dữ liệu tin đăng cũ.', err);
    }

    const records = ensurePostCodes();
    const overrides = new Map(readList(POST_SOURCES.statusOverrides)
      .filter(item => item && (item.status === 'approved' || item.status === 'hidden'))
      .map(item => [item.id, item.status]));
    const exchangePosts = records.exchangePosts
      .filter(item => typeof item.id === 'string' && typeof item.itemName === 'string')
      .map(item => {
        const id = 'exchange:' + item.id;
        const reviewStatus = overrides.get(id);
        const status = reviewStatus === 'hidden'
          ? 'hidden'
          : reviewStatus === 'approved'
            ? (item.status === 'completed' ? 'completed' : 'approved')
            : 'pending';
        return {
          id,
          postCode: item.postCode,
          sourceKey: POST_SOURCES.exchange,
          sourceRecord: item,
          isApproved: reviewStatus === 'approved',
          title: item.itemName,
          ownerName: item.contactName || '',
          type: 'exchange',
          status,
          createdAt: item.date,
          description: item.description || ''
        };
      });
    const lostFoundPosts = records.lostFoundPosts
      .filter(item => typeof item.id === 'string' && typeof item.itemName === 'string'
        && (item.type === 'lost' || item.type === 'found'))
      .map(item => {
        const id = 'lost-found:' + item.id;
        const reviewStatus = overrides.get(id);
        const status = reviewStatus === 'hidden'
          ? 'hidden'
          : reviewStatus === 'approved'
            ? (item.status === 'resolved' ? 'resolved' : 'approved')
            : 'pending';
        return {
          id,
          postCode: item.postCode,
          sourceKey: POST_SOURCES.lostFound,
          sourceRecord: item,
          isApproved: reviewStatus === 'approved',
          title: item.itemName,
          ownerName: item.contactName || '',
          type: item.type,
          status,
          createdAt: item.date,
          description: item.description || ''
        };
      });
    return exchangePosts.concat(lostFoundPosts);
  }
  const saveUsers = (list) => writeList(CONFIG.KEYS.USERS, list);
  function savePosts(posts) {
    const list = Array.isArray(posts) ? posts : [];
    const exchangePosts = list.filter(post => post.sourceKey === POST_SOURCES.exchange)
      .map(post => post.sourceRecord);
    const lostFoundPosts = list.filter(post => post.sourceKey === POST_SOURCES.lostFound)
      .map(post => post.sourceRecord);
    const overrides = list
      .filter(post => post.status === 'hidden' || post.isApproved)
      .map(post => ({ id: post.id, status: post.status === 'hidden' ? 'hidden' : 'approved' }));

    if (!writeList(POST_SOURCES.exchange, exchangePosts)) return false;
    if (!writeList(POST_SOURCES.lostFound, lostFoundPosts)) return false;
    return writeList(POST_SOURCES.statusOverrides, overrides);
  }

  /* ---------- 3. TIỆN ÍCH ---------- */
  function esc(value) {
    // Chống chèn HTML: mọi dữ liệu người dùng phải qua hàm này trước khi vào innerHTML
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => map[c]);
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN');
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'QT';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    swap: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function toast(message, type) {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.className = 'toast-root';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = 'toast toast--' + (type || 'info');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* Mở hộp thoại dùng chung. Có sẵn: phím Esc, bấm ra ngoài để đóng,
     giữ phím Tab trong hộp thoại, trả focus về nút cũ khi đóng.
     Mọi phần tử có data-act="..." sẽ đóng hộp và gọi onAction("...").
     Esc hoặc bấm nền → onAction("dismiss"). */
  function openModal(html, onAction) {
    const previous = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = html;
    let closed = false;

    function close(act) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      if (previous && previous.focus) previous.focus();
      if (onAction) onAction(act);
    }
    function onKey(e) {
      if (e.key === 'Escape') { close('dismiss'); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(wrap.querySelectorAll('button, [href], input, select, textarea'))
        .filter(el => !el.disabled);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (btn) close(btn.dataset.act);
      else if (e.target === wrap) close('dismiss');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    const focusEl = wrap.querySelector('[data-autofocus]') || wrap.querySelector('button');
    if (focusEl) focusEl.focus();
    return { el: wrap, close: () => close('dismiss') };
  }

  /* Hộp thoại xác nhận. Trả về Promise<boolean>:
       const ok = await UTC2Admin.confirmDialog({...}); */
  function confirmDialog(opts) {
    // Đang có hộp thoại khác (ví dụ bấm đúp) → bỏ qua để không mở chồng nhiều hộp
    if (document.querySelector('.modal-backdrop')) return Promise.resolve(false);
    const o = Object.assign({ title: 'Xác nhận', message: '', confirmText: 'Đồng ý', cancelText: 'Hủy', danger: false }, opts);
    return new Promise(resolve => {
      openModal(
        '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
        '<h2 id="modal-title">' + esc(o.title) + '</h2>' +
        '<p>' + esc(o.message) + '</p>' +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-act="cancel" data-autofocus>' + esc(o.cancelText) + '</button>' +
        '<button type="button" class="btn ' + (o.danger ? 'btn--danger' : 'btn--primary') + '" data-act="ok">' + esc(o.confirmText) + '</button>' +
        '</div></div>',
        act => resolve(act === 'ok')
      );
    });
  }

  /* ---------- 4. LAYOUT (Sidebar + Header) ---------- */
  function getSession() {
    try {
      const raw = localStorage.getItem(CONFIG.KEYS.SESSION);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === 'object' ? data : null;
    } catch (e) { return null; }
  }

  /* Kiểm tra quyền truy cập (chỉ khi REQUIRE_LOGIN = true).*/
  function checkAccess() {
    if (!CONFIG.REQUIRE_LOGIN) return true;
    const session = getSession();
    if (session && session.role === 'admin') return true;
    if (CONFIG.LOGIN_URL) {
      window.location.replace(CONFIG.LOGIN_URL);
    } else {
      document.body.innerHTML = '<p style="padding:32px;font-family:sans-serif">Bạn cần đăng nhập bằng tài khoản quản trị để xem trang này.</p>';
    }
    return false;
  }

  function getAdminInfo() {
    const session = getSession();
    if (session && session.role === 'admin' && session.fullName) {
      return { fullName: session.fullName, email: session.email || '' };
    }
    const admin = getUsers().find(u => u.role === 'admin');
    return admin || { fullName: 'Quản trị viên', email: '' };
  }

  function buildSidebar(page) {
    const groups = [
      { key: 'system', label: 'HỆ THỐNG' },
      { key: 'management', label: 'QUẢN LÝ' }
    ];
    const nav = groups.map(group => {
      const pages = CONFIG.PAGES.filter(p => (p.group || 'system') === group.key);
      if (!pages.length) return '';
      const links = pages.map(p => {
        const active = p.key === page;
        return '<a class="nav-link' + (active ? ' is-active' : '') + '" href="' + esc(p.href) + '" title="' + esc(p.label) + '"' + (active ? ' aria-current="page"' : '') + '>' +
          icon(p.icon) + '<span class="nav-label">' + esc(p.label) + '</span></a>';
      }).join('');
      return '<div class="nav-group"><div class="nav-group__title">' + group.label + '</div>' + links + '</div>';
    }).join('');

    return '' +
      '<div class="brand">' +
      '<img class="brand__logo" src="assets/reshare-mark.png" alt="Logo Reshare">' +
      '<span class="brand__text">UTC2 RESHARE<small>Trang quản trị</small></span>' +
      '</div>' +
      '<nav class="nav" aria-label="Menu quản trị">' + nav + '</nav>' +
      '<a class="nav-link nav-home" href="index.html" title="Về trang chủ">' +
      icon('home') + '<span class="nav-label">Về trang chủ</span></a>' +
      '<button type="button" class="nav-link nav-logout" data-action="logout" title="Đăng xuất">' +
      icon('logout') + '<span class="nav-label">Đăng xuất</span></button>' +
      '<button type="button" class="sidebar-resize" role="separator" aria-orientation="vertical" aria-label="Kéo để thay đổi độ rộng thanh bên" aria-valuemin="200" aria-valuemax="420" aria-valuenow="252" tabindex="0"></button>';
  }

  function buildTopbar(title) {
    const admin = getAdminInfo();
    return '' +
      '<div class="topbar__left">' +
      '<button type="button" class="icon-btn" id="sidebar-toggle" aria-label="Thu gọn hoặc mở rộng thanh bên">' + icon('menu') + '</button>' +
      '<h1 class="page-title">' + esc(title) + '</h1>' +
      '</div>' +
      '<div class="account">' +
      '<button type="button" class="account__btn" id="account-btn" aria-haspopup="true" aria-expanded="false">' +
      '<img class="avatar" src="assets/utc2-logo.jpg" alt="Ảnh đại diện Quản trị viên">' +
      '<span class="account__info"><strong>' + esc(admin.fullName) + '</strong><small>Quản trị viên</small></span>' +
      icon('chevron') +
      '</button>' +
      '<div class="account__menu" id="account-menu" hidden>' +
      '<div class="account__meta">' + esc(admin.email || 'Chưa có email') + '</div>' +
      '<button type="button" class="account__item" data-action="logout">' + icon('logout') + 'Đăng xuất</button>' +
      '</div>' +
      '</div>';
  }

  async function handleLogout() {
    const ok = await confirmDialog({
      title: 'Đăng xuất?',
      message: 'Bạn sẽ thoát khỏi phiên quản trị hiện tại.',
      confirmText: 'Đăng xuất'
    });
    if (!ok) return;
    try { localStorage.removeItem(CONFIG.KEYS.SESSION); } catch (e) { /* bỏ qua */ }
    toast('Đã đăng xuất.', 'success');
    const dest = CONFIG.LOGOUT_URL || CONFIG.LOGIN_URL;
    if (dest) setTimeout(() => { window.location.href = dest; }, 700);
  }

  function bindLayout() {
    const shell = document.getElementById('shell');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');
    const resizeHandle = sidebar.querySelector('.sidebar-resize');
    const toggle = document.getElementById('sidebar-toggle');
    const accBtn = document.getElementById('account-btn');
    const accMenu = document.getElementById('account-menu');
    const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
    const minWidth = 200;
    const defaultWidth = 252;
    const maxWidth = () => Math.max(minWidth, Math.min(420, window.innerWidth - 360));

    function setSidebarWidth(width, persist) {
      const bounded = Math.round(Math.max(minWidth, Math.min(maxWidth(), width)));
      shell.style.setProperty('--sb-w', bounded + 'px');
      resizeHandle.setAttribute('aria-valuenow', String(bounded));
      if (persist) {
        try { localStorage.setItem(CONFIG.KEYS.SIDEBAR_WIDTH, String(bounded)); } catch (e) { /* bỏ qua */ }
      }
      return bounded;
    }

    function getSavedWidth() {
      try {
        const width = Number(localStorage.getItem(CONFIG.KEYS.SIDEBAR_WIDTH));
        return Number.isFinite(width) && width >= minWidth && width <= 420 ? width : defaultWidth;
      } catch (e) { return defaultWidth; }
    }

    try {
      const savedWidth = getSavedWidth();
      shell.style.setProperty('--sb-w', savedWidth + 'px');
      resizeHandle.setAttribute('aria-valuenow', String(savedWidth));
      if (localStorage.getItem(CONFIG.KEYS.SIDEBAR) === '1') {
        shell.classList.add('is-collapsed');
        shell.style.setProperty('--sb-w', '72px');
      }
    } catch (e) { /* bỏ qua */ }

    function closeDrawer() { shell.classList.remove('is-open'); }
    function closeMenu() { accMenu.hidden = true; accBtn.setAttribute('aria-expanded', 'false'); }

    toggle.addEventListener('click', () => {
      if (isMobile()) {
        shell.classList.toggle('is-open');
      } else if (shell.classList.contains('is-collapsed')) {
        shell.classList.remove('is-collapsed');
        setSidebarWidth(getSavedWidth(), false);
        try { localStorage.setItem(CONFIG.KEYS.SIDEBAR, '0'); } catch (e) { /* bỏ qua */ }
      } else {
        const currentWidth = parseFloat(getComputedStyle(shell).gridTemplateColumns) || defaultWidth;
        setSidebarWidth(currentWidth, true);
        shell.classList.add('is-collapsed');
        shell.style.setProperty('--sb-w', '72px');
        try { localStorage.setItem(CONFIG.KEYS.SIDEBAR, '1'); } catch (e) { /* bỏ qua */ }
      }
    });

    resizeHandle.addEventListener('pointerdown', e => {
      if (isMobile()) return;
      e.preventDefault();
      if (shell.classList.contains('is-collapsed')) {
        shell.classList.remove('is-collapsed');
        setSidebarWidth(getSavedWidth(), false);
        try { localStorage.setItem(CONFIG.KEYS.SIDEBAR, '0'); } catch (err) { /* bỏ qua */ }
      }
      shell.classList.add('is-resizing');
      resizeHandle.setPointerCapture(e.pointerId);
      setSidebarWidth(e.clientX, true);
    });
    resizeHandle.addEventListener('pointermove', e => {
      if (shell.classList.contains('is-resizing')) setSidebarWidth(e.clientX, true);
    });
    function stopResize() {
      shell.classList.remove('is-resizing');
    }
    resizeHandle.addEventListener('pointerup', stopResize);
    resizeHandle.addEventListener('pointercancel', stopResize);
    resizeHandle.addEventListener('keydown', e => {
      if (isMobile()) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        if (shell.classList.contains('is-collapsed')) {
          shell.classList.remove('is-collapsed');
          try { localStorage.setItem(CONFIG.KEYS.SIDEBAR, '0'); } catch (err) { /* bỏ qua */ }
        }
        const current = parseFloat(getComputedStyle(shell).gridTemplateColumns) || defaultWidth;
        const next = e.key === 'Home' ? minWidth
          : e.key === 'End' ? maxWidth()
            : current + (e.key === 'ArrowRight' ? 16 : -16);
        setSidebarWidth(next, true);
      }
    });
    overlay.addEventListener('click', closeDrawer);

    accBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = accMenu.hidden;
      accMenu.hidden = !open;
      accBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', e => {
      if (!accMenu.hidden && !accMenu.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeMenu(); closeDrawer(); }
    });
    window.addEventListener('resize', () => { if (!isMobile()) closeDrawer(); });

    // Mọi nút có data-action="logout" (sidebar + menu tài khoản)
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="logout"]')) { closeMenu(); handleLogout(); }
    });
  }

  /* ---------- 5. KHỞI TẠO & API CÔNG KHAI ---------- */
  const queue = [];
  let isReady = false;

  function ready(fn) { isReady ? fn() : queue.push(fn); }

  function init() {
    if (!checkAccess()) return;
    if (!document.getElementById('sidebar') || !document.getElementById('topbar') || !document.getElementById('shell')) {
      console.error('[admin] Thiếu #shell, #sidebar hoặc #topbar trong HTML của trang.');
      return;
    }
    const page = document.body.dataset.page;
    const title = document.body.dataset.title || 'Quản trị';
    document.getElementById('sidebar').innerHTML = buildSidebar(page);
    document.getElementById('topbar').innerHTML = buildTopbar(title);
    bindLayout();
    isReady = true;
    queue.forEach(fn => { try { fn(); } catch (err) { console.error(err); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.UTC2Admin = {
    CONFIG, POST_SOURCES, TYPE_LABEL, POST_STATUS_LABEL, USER_STATUS_LABEL, ROLE_LABEL, getUserRole,
    getUsers, getPosts, saveUsers, savePosts,
    esc, formatDate, icon, toast, openModal, confirmDialog, ready
  };
})();
