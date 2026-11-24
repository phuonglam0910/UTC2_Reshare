/* =============================================================
   users.js – Logic trang Quản lý tài khoản
   Chức năng: hiển thị bảng, tìm kiếm, lọc theo vai trò/trạng thái,
   xem chi tiết, khóa / mở khóa (lưu vào LocalStorage).
   ============================================================= */
UTC2Admin.ready(function () {
  'use strict';
  const A = UTC2Admin;
  const $ = (id) => document.getElementById(id);
  const state = { q: '', role: 'all', status: 'all' };

  /* Bỏ dấu + chữ thường để "nguyen" tìm được "Nguyễn" */
  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  function getFiltered(users) {
    const q = normalize(state.q.trim());
    return users.filter(u => {
      if (state.role !== 'all' && A.getUserRole(u) !== state.role) return false;
      if (state.status !== 'all' && u.status !== state.status) return false;
      if (!q) return true;
      return normalize(u.fullName).includes(q) ||
             normalize(u.email).includes(q);
    });
  }

  function rowHtml(u, index) {
    const role = A.getUserRole(u);
    const isAdmin = role === 'admin';
    const locked = u.status === 'locked';
    const lockBtn = isAdmin
      ? '<button type="button" class="btn btn--ghost btn--sm" disabled title="Không thể khóa tài khoản quản trị">Khóa</button>'
      : '<button type="button" class="btn btn--sm ' + (locked ? 'btn--primary' : 'btn--ghost') + '" data-act="toggle" data-id="' + A.esc(u.id) + '">' +
          (locked ? 'Mở khóa' : 'Khóa') + '</button>';

    return '<tr class="' + (locked ? 'row-locked' : '') + '">' +
      '<td class="col-num">' + (index + 1) + '</td>' +
      '<td class="user-name">' + A.esc(u.fullName) + '</td>' +
      '<td class="col-email">' + A.esc(u.email) + '</td>' +
      '<td><span class="chip chip--' + A.esc(role) + '">' + A.esc(A.ROLE_LABEL[role]) + '</span></td>' +
      '<td><span class="chip chip--' + A.esc(u.status) + '">' + A.esc(A.USER_STATUS_LABEL[u.status] || u.status) + '</span></td>' +
      '<td class="col-actions"><div class="actions">' +
        '<button type="button" class="btn btn--ghost btn--sm" data-act="view" data-id="' + A.esc(u.id) + '">Xem</button>' +
        lockBtn +
      '</div></td></tr>';
  }

  function render() {
    const all = A.getUsers();
    const list = getFiltered(all);
    const body = $('users-body');

    if (!all.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">Chưa có tài khoản nào trong hệ thống.</td></tr>';
    } else if (!list.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">Không tìm thấy tài khoản phù hợp. Hãy thử đổi từ khóa hoặc bộ lọc.</td></tr>';
    } else {
      body.innerHTML = list.map(rowHtml).join('');
    }
    $('result-count').textContent = 'Hiển thị ' + list.length + ' / ' + all.length + ' tài khoản';
  }

  /* ---------- Xem chi tiết ---------- */
  function showDetail(id) {
    const u = A.getUsers().find(x => x.id === id);
    if (!u) { A.toast('Không tìm thấy tài khoản này.', 'error'); render(); return; }

    const posts = A.getPosts().filter(p => p.ownerId === u.id);
    const pending = posts.filter(p => p.status === 'pending').length;
    A.openModal(
      '<div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="detail-title">' +
        '<h2 id="detail-title">' + A.esc(u.fullName) + '</h2>' +
        '<dl class="detail">' +
          '<dt>Email</dt><dd>' + A.esc(u.email) + '</dd>' +
          '<dt>Vai trò</dt><dd>' + A.esc(A.ROLE_LABEL[A.getUserRole(u)]) + '</dd>' +
          '<dt>Trạng thái</dt><dd>' + A.esc(A.USER_STATUS_LABEL[u.status] || u.status) + '</dd>' +
          '<dt>Số tin đã đăng</dt><dd>' + posts.length + (pending ? ' (' + pending + ' đang chờ duyệt)' : '') + '</dd>' +
        '</dl>' +
        '<div class="modal__actions"><button type="button" class="btn btn--ghost" data-act="close" data-autofocus>Đóng</button></div>' +
      '</div>'
    );
  }

  /* ---------- Khóa / mở khóa ---------- */
  async function toggleLock(id) {
    const users = A.getUsers();
    const u = users.find(x => x.id === id);
    if (!u) { A.toast('Không tìm thấy tài khoản này.', 'error'); render(); return; }
    if (A.getUserRole(u) === 'admin') { A.toast('Không thể khóa tài khoản quản trị.', 'error'); return; }

    const willLock = u.status !== 'locked';
    if (willLock) {
      const ok = await A.confirmDialog({
        title: 'Khóa tài khoản?',
        message: 'Tài khoản "' + u.fullName + '" sẽ bị khóa. Bạn có thể mở khóa lại bất cứ lúc nào.',
        confirmText: 'Khóa tài khoản',
        danger: true
      });
      if (!ok) return;
    }

    // Đọc lại dữ liệu mới nhất sau khi chờ xác nhận (tránh ghi đè thay đổi từ tab khác)
    const fresh = A.getUsers();
    const target = fresh.find(x => x.id === id);
    if (!target) { A.toast('Tài khoản không còn tồn tại.', 'error'); render(); return; }
    target.status = willLock ? 'locked' : 'active';

    if (A.saveUsers(fresh)) {
      A.toast((willLock ? 'Đã khóa tài khoản ' : 'Đã mở khóa tài khoản ') + target.fullName + '.', 'success');
      render();
    }
  }

  /* ---------- Gắn sự kiện ---------- */
  $('search').addEventListener('input', e => { state.q = e.target.value; render(); });
  $('filter-role').addEventListener('change', e => { state.role = e.target.value; render(); });
  $('filter-status').addEventListener('change', e => { state.status = e.target.value; render(); });
  $('reset-filters').addEventListener('click', () => {
    state.q = ''; state.role = 'all'; state.status = 'all';
    $('search').value = ''; $('filter-role').value = 'all'; $('filter-status').value = 'all';
    render();
  });

  // Một listener cho cả bảng (event delegation) – vẫn hoạt động sau mỗi lần render lại
  $('users-body').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.act === 'view') showDetail(btn.dataset.id);
    if (btn.dataset.act === 'toggle') toggleLock(btn.dataset.id);
  });

  // Tab khác đổi dữ liệu → cập nhật bảng
  window.addEventListener('storage', e => {
    if (e.key === A.CONFIG.KEYS.USERS || e.key === A.CONFIG.KEYS.POSTS) render();
  });

  render();
});
