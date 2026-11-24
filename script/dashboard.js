/* =============================================================
   dashboard.js – Logic trang Tổng quan
   Toàn bộ con số được TÍNH TỪ LocalStorage mỗi lần hiển thị,
   không có số liệu cố định.
   ============================================================= */
UTC2Admin.ready(function () {
  'use strict';
  const A = UTC2Admin;
  const $ = (id) => document.getElementById(id);
  const num = (n) => Number(n).toLocaleString('vi-VN');

  /* Gom số liệu từ dữ liệu thật.
     Giá trị type/status lạ (do module khác thêm) vẫn nằm trong "tổng",
     chỉ không xuất hiện ở các biểu đồ phân loại. */
  function compute() {
    const users = A.getUsers();
    const posts = A.getPosts();
    const count = (list, field, value) => list.filter(i => i[field] === value).length;

    return {
      users, posts,
      totalUsers: users.length,
      students: users.filter(u => A.getUserRole(u) === 'student').length,
      guests: users.filter(u => A.getUserRole(u) === 'guest').length,
      locked: count(users, 'status', 'locked'),
      totalPosts: posts.length,
      type: {
        exchange: count(posts, 'type', 'exchange'),
        gift: count(posts, 'type', 'gift'),
        lost: count(posts, 'type', 'lost'),
        found: count(posts, 'type', 'found')
      },
      status: {
        approved: count(posts, 'status', 'approved'),
        pending: count(posts, 'status', 'pending'),
        hidden: count(posts, 'status', 'hidden'),
        completed: count(posts, 'status', 'completed'),
        resolved: count(posts, 'status', 'resolved')
      }
    };
  }

  /* Hai chỉ số chính được đặt trước để chiếm vùng hiển thị nổi bật. */
  function renderCards(s) {
    const cards = [
      { cls: 'stat--featured stat--total', icon: 'file', value: s.totalPosts, label: 'Tổng tin đăng',
        link: 'posts.html',
        hint: s.status.approved + ' đang đăng, ' + (s.status.completed + s.status.resolved) + ' đã hoàn tất, ' + s.status.hidden + ' ẩn khỏi quản trị' },
      { cls: 'stat--featured stat--alert', icon: 'clock', value: s.status.pending, label: 'Tin chờ duyệt',
        hint: s.status.pending > 0 ? 'Bấm để xem và duyệt' : 'Không có tin nào cần xử lý', link: 'posts.html?status=pending' },
      { cls: 'stat--users', icon: 'users', value: s.totalUsers, label: 'Tổng tài khoản', link: 'users.html',
        hint: s.students + ' sinh viên UTC2, ' + s.guests + ' khách, ' + s.locked + ' đang khóa' },
      { cls: 'stat--exchange', icon: 'swap', value: s.type.exchange + s.type.gift, label: 'Tin trao đổi / cho tặng', link: 'posts.html?type=exchange%2Cgift',
        hint: s.type.exchange + ' trao đổi, ' + s.type.gift + ' cho tặng' },
      { cls: 'stat--lost', icon: 'search', value: s.type.lost + s.type.found, label: 'Tin thất lạc / nhặt được', link: 'posts.html?type=lost%2Cfound',
        hint: s.type.lost + ' báo mất, ' + s.type.found + ' nhặt được' }
    ];

    const statCards = $('stat-cards');
    statCards.innerHTML = cards.map(c => {
      const inner =
        '<span class="stat__icon">' + A.icon(c.icon) + '</span>' +
        '<div><div class="stat__value">' + num(c.value) + '</div>' +
        '<div class="stat__label">' + A.esc(c.label) + '</div>' +
        '<div class="stat__hint">' + A.esc(c.hint) + '</div></div>';
      return '<a class="stat stat--clickable ' + (c.cls || '') + '" href="' + c.link + '">' + inner + '</a>';
    }).join('');
    statCards.appendChild($('status-card-template').content.cloneNode(true));
  }

  /* Biểu đồ cột: số tin theo loại */
  function renderTypeBars(s) {
    const keys = ['exchange', 'gift', 'lost', 'found'];
    const max = Math.max.apply(null, keys.map(k => s.type[k]).concat(1));
    $('type-chart').innerHTML = keys.map(k => {
      const pct = (s.type[k] / max) * 100;
      return '<li><div class="bars__head"><span>' + A.esc(A.TYPE_LABEL[k]) + '</span><span>' + num(s.type[k]) + '</span></div>' +
        '<div class="bars__track"><div class="bars__fill bars__fill--' + k + '" style="width:' + pct.toFixed(1) + '%"></div></div></li>';
    }).join('');
  }

  /* Biểu đồ tròn thể hiện tỉ lệ tin theo trạng thái. */
  function renderStatusDonut(s) {
    const parts = [
      { key: 'approved', color: '#1b7f55' },
      { key: 'pending', color: '#d49a1f' },
      { key: 'hidden', color: '#8a97ab' },
      { key: 'completed', color: '#4361a8' },
      { key: 'resolved', color: '#6f62a8' }
    ];
    const total = parts.reduce((sum, part) => sum + s.status[part.key], 0);
    const donut = $('status-donut');
    if (total === 0) {
      donut.style.background = '#e8ecf2';
    } else {
      let angle = 0;
      const stops = parts.map(part => {
        const from = angle;
        angle += (s.status[part.key] / total) * 360;
        return part.color + ' ' + from.toFixed(2) + 'deg ' + angle.toFixed(2) + 'deg';
      });
      donut.style.background = 'conic-gradient(' + stops.join(',') + ')';
    }
    $('donut-total').textContent = num(total);

    $('status-legend').innerHTML = parts.map(p =>
      '<li><span class="legend__dot" style="background:' + p.color + '"></span>' +
      '<span>' + A.esc(A.POST_STATUS_LABEL[p.key]) + '</span>' +
      '<span class="legend__num">' + num(s.status[p.key]) + '</span></li>'
    ).join('');
  }

  /* 5 tin chờ duyệt mới nhất */
  function renderPending(s) {
    const owners = {};
    s.users.forEach(u => { owners[u.id] = u.fullName; });

    const list = s.posts
      .filter(p => p.status === 'pending')
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
      .slice(0, 5);

    const box = $('pending-list');
    if (!list.length) {
      box.innerHTML = '<li class="empty">Không có tin nào đang chờ duyệt.</li>';
      return;
    }
    box.innerHTML = list.map(p =>
      '<li class="pending-item">' +
        '<div class="pending-item__main">' +
          '<div class="pending-item__title">' + A.esc(p.title) + '</div>' +
          '<div class="pending-item__meta">' + A.esc(owners[p.ownerId] || 'Không rõ người đăng') + ', ' + A.formatDate(p.createdAt) + '</div>' +
        '</div>' +
        '<span class="chip chip--' + A.esc(p.type) + '">' + A.esc(A.TYPE_LABEL[p.type] || p.type) + '</span>' +
      '</li>'
    ).join('');
  }

  function render() {
    const s = compute();
    renderCards(s);
    renderTypeBars(s);
    renderStatusDonut(s);
    renderPending(s);
  }

  render();

  // Khi trang khác (tab khác) đổi dữ liệu → tự cập nhật lại số liệu
  window.addEventListener('storage', function (e) {
    if (e.key === A.CONFIG.KEYS.USERS ||
        e.key === A.POST_SOURCES.exchange ||
        e.key === A.POST_SOURCES.lostFound ||
        e.key === A.POST_SOURCES.statusOverrides) render();
  });
});
