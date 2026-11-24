/* =============================================================
   posts.js – Logic trang Quản lý tin đăng
   Chức năng: bảng, tìm theo tiêu đề, lọc loại/trạng thái, xem chi tiết,
   duyệt, ẩn, xóa (có xác nhận). Mọi thay đổi được lưu vào LocalStorage.
   ============================================================= */
UTC2Admin.ready(function () {
  'use strict';
  const A = UTC2Admin;
  const $ = (id) => document.getElementById(id);
  const state = { q: '', type: 'all', status: 'all' };

  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');
  }

  /* Map id → họ tên để hiển thị "Người đăng" */
  function ownerMap() {
    const map = {};
    A.getUsers().forEach(u => { map[u.id] = u; });
    return map;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts.length > 1 ? parts[0].charAt(0) + parts[parts.length - 1].charAt(0) : parts[0].slice(0, 2)).toUpperCase();
  }

  function getFiltered(posts) {
    const q = normalize(state.q.trim());
    return posts
      .filter(p => {
        if (state.type !== 'all' && !state.type.split(',').includes(p.type)) return false;
        if (state.status !== 'all' && p.status !== state.status) return false;
        return !q || normalize(p.title).includes(q);
      })
      // Tin mới nhất lên đầu
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  }

  /* Nút thao tác phụ thuộc trạng thái hiện tại của tin */
  function actionButtons(p) {
    const id = A.esc(p.id);
    const approve = p.status === 'hidden'
      ? '<button type="button" class="btn btn--ok btn--sm" data-act="approve" data-id="' + id + '">Hiện trong quản trị</button>'
      : p.status === 'pending'
        ? '<button type="button" class="btn btn--ok btn--sm" data-act="approve" data-id="' + id + '">Duyệt</button>'
        : '';
    let menu = '<button type="button" class="btn btn--ghost btn--sm" data-act="view" data-id="' + id + '">' + A.icon('file') + 'Xem chi tiết</button>';
    if (p.status !== 'hidden') menu += '<button type="button" class="btn btn--ghost btn--sm" data-act="hide" data-id="' + id + '">Ẩn khỏi quản trị</button>';
    menu += '<button type="button" class="btn btn--danger-ghost btn--sm" data-act="delete" data-id="' + id + '">Xóa tin</button>';
    return approve + '<details class="action-menu"><summary class="action-menu__trigger" aria-label="Thêm thao tác">' +
      A.icon('more') + '</summary><div class="action-menu__list">' + menu + '</div></details>';
  }

  function rowHtml(p, index, owners) {
    const owner = owners[p.ownerId];
    const ownerName = p.ownerName || (owner ? owner.fullName : 'Không rõ');
    return '<tr class="' + (p.status === 'hidden' ? 'row-hidden' : '') + '">' +
      '<td class="col-num">' + (index + 1) + '</td>' +
      '<td class="col-id">' + A.esc(p.id) + '</td>' +
      '<td class="col-title"><span title="' + A.esc(p.title) + '">' + A.esc(p.title) + '</span></td>' +
      '<td class="col-owner"><span class="table-owner"><span class="table-avatar" aria-hidden="true">' + A.esc(initials(ownerName)) + '</span><span>' + A.esc(ownerName) + '</span></span></td>' +
      '<td><span class="chip chip--' + A.esc(p.type) + '">' + A.esc(A.TYPE_LABEL[p.type] || p.type) + '</span></td>' +
      '<td class="col-date">' + A.formatDate(p.createdAt) + '</td>' +
      '<td><span class="chip chip--' + A.esc(p.status) + '">' + A.esc(A.POST_STATUS_LABEL[p.status] || p.status) + '</span></td>' +
      '<td class="col-actions"><div class="actions">' + actionButtons(p) + '</div></td>' +
    '</tr>';
  }

  function render() {
    const all = A.getPosts();
    const list = getFiltered(all);
    const owners = ownerMap();
    const body = $('posts-body');

    if (!all.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">Chưa có tin đăng nào trong hệ thống.</td></tr>';
    } else if (!list.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">Không tìm thấy tin đăng phù hợp. Hãy thử đổi từ khóa hoặc bộ lọc.</td></tr>';
    } else {
      body.innerHTML = list.map((p, i) => rowHtml(p, i, owners)).join('');
    }
    $('result-count').textContent = 'Hiển thị ' + list.length + ' / ' + all.length + ' tin đăng';
  }

  /* ---------- Duyệt / Ẩn ---------- */
  function setStatus(id, status) {
    // Đọc lại dữ liệu mới nhất ngay trước khi ghi
    const posts = A.getPosts();
    const post = posts.find(p => p.id === id);
    if (!post) { A.toast('Không tìm thấy tin đăng này (có thể đã bị xóa).', 'error'); render(); return; }
    const wasHidden = post.status === 'hidden';
    post.status = status === 'approved' && post.status === 'hidden'
      ? post.defaultStatus
      : status;
    if (A.savePosts(posts)) {
      const message = wasHidden && status === 'approved'
        ? 'Đã hiện tin trong quản trị: '
        : status === 'approved' ? 'Đã duyệt tin: ' : 'Đã ẩn tin khỏi quản trị: ';
      A.toast(message + post.title, 'success');
      render();
    }
  }

  /* ---------- Xóa (có xác nhận) ---------- */
  async function removePost(id) {
    const post = A.getPosts().find(p => p.id === id);
    if (!post) { A.toast('Không tìm thấy tin đăng này (có thể đã bị xóa).', 'error'); render(); return; }

    const ok = await A.confirmDialog({
      title: 'Xóa tin đăng?',
      message: 'Tin "' + post.title + '" sẽ bị xóa vĩnh viễn và không thể khôi phục.',
      confirmText: 'Xóa tin',
      danger: true
    });
    if (!ok) return;

    const posts = A.getPosts();                       // đọc lại sau khi chờ xác nhận
    const remain = posts.filter(p => p.id !== id);
    if (remain.length === posts.length) { A.toast('Tin đăng không còn tồn tại.', 'error'); render(); return; }
    if (A.savePosts(remain)) {
      A.toast('Đã xóa tin đăng.', 'success');
      render();
    }
  }

  /* ---------- Xem chi tiết ---------- */
  function showDetail(id) {
    const p = A.getPosts().find(x => x.id === id);
    if (!p) { A.toast('Không tìm thấy tin đăng này.', 'error'); render(); return; }

    let buttons = '<button type="button" class="btn btn--ghost" data-act="close" data-autofocus>Đóng</button>';
    if (p.status !== 'hidden') buttons += '<button type="button" class="btn btn--ghost" data-act="hide">Ẩn khỏi quản trị</button>';
    if (p.status === 'hidden') buttons += '<button type="button" class="btn btn--ok" data-act="approve">Hiện trong quản trị</button>';
    if (p.status === 'pending') buttons += '<button type="button" class="btn btn--ok" data-act="approve">Duyệt tin</button>';

    const modal = A.openModal(
      '<div class="modal modal--wide" role="dialog" aria-modal="true" aria-labelledby="detail-title">' +
        '<h2 id="detail-title">' + A.esc(p.title) + '</h2>' +
        (p.image ? '<img class="post-image" alt="Ảnh minh họa tin đăng" src="' + A.esc(p.image) + '">' : '') +
        '<dl class="detail">' +
          '<dt>Mã tin</dt><dd>' + A.esc(p.id) + '</dd>' +
          '<dt>Người đăng</dt><dd>' + A.esc(p.ownerName || (ownerMap()[p.ownerId] || {}).fullName || 'Không rõ') + '</dd>' +
          '<dt>Loại tin</dt><dd>' + A.esc(A.TYPE_LABEL[p.type] || p.type) + '</dd>' +
          '<dt>Ngày đăng</dt><dd>' + A.formatDate(p.createdAt) + '</dd>' +
          '<dt>Trạng thái</dt><dd>' + A.esc(A.POST_STATUS_LABEL[p.status] || p.status) + '</dd>' +
          '<dt>Mô tả</dt><dd class="detail__desc">' + A.esc(p.description || 'Chưa có mô tả.') + '</dd>' +
        '</dl>' +
        '<div class="modal__actions">' + buttons + '</div>' +
      '</div>',
      act => {
        if (act === 'approve') setStatus(id, 'approved');
        if (act === 'hide') setStatus(id, 'hidden');
      }
    );
    const img = modal.el.querySelector('.post-image');
    if (img) img.addEventListener('error', () => { img.remove(); });   // ảnh lỗi thì bỏ đi, không vỡ giao diện
  }

  /* ---------- Gắn sự kiện ---------- */
  $('search').addEventListener('input', e => { state.q = e.target.value; render(); });
  $('filter-type').addEventListener('change', e => { state.type = e.target.value; render(); });
  $('filter-status').addEventListener('change', e => { state.status = e.target.value; render(); });
  $('reset-filters').addEventListener('click', () => {
    state.q = ''; state.type = 'all'; state.status = 'all';
    $('search').value = ''; $('filter-type').value = 'all'; $('filter-status').value = 'all';
    render();
  });

  $('posts-body').addEventListener('click', e => {
    const menu = e.target.closest('.action-menu');
    if (e.target.closest('.action-menu__trigger')) {
      $('posts-body').querySelectorAll('.action-menu[open]').forEach(item => {
        if (item !== menu) item.open = false;
      });
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (menu) menu.open = false;
    if (btn.dataset.act === 'view') showDetail(id);
    if (btn.dataset.act === 'approve') setStatus(id, 'approved');
    if (btn.dataset.act === 'hide') setStatus(id, 'hidden');
    if (btn.dataset.act === 'delete') removePost(id);
  });

  document.addEventListener('click', e => {
    if (e.target.closest('.action-menu')) return;
    $('posts-body').querySelectorAll('.action-menu[open]').forEach(menu => { menu.open = false; });
  });

  window.addEventListener('storage', e => {
    if (e.key === A.CONFIG.KEYS.USERS ||
        e.key === A.POST_SOURCES.exchange ||
        e.key === A.POST_SOURCES.lostFound ||
        e.key === A.POST_SOURCES.statusOverrides) render();
  });

  /* Áp dụng bộ lọc từ các thẻ thống kê trên dashboard. */
  const params = new URLSearchParams(window.location.search);
  const wantedStatus = params.get('status');
  if (wantedStatus && A.POST_STATUS_LABEL[wantedStatus]) {
    state.status = wantedStatus;
    $('filter-status').value = wantedStatus;
  }
  const wantedTypes = (params.get('type') || '').split(',').filter(Boolean);
  if (wantedTypes.length && wantedTypes.every(type => A.TYPE_LABEL[type])) {
    state.type = wantedTypes.join(',');
    $('filter-type').value = state.type;
  }

  render();
});
