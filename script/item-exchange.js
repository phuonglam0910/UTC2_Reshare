(function () {
  'use strict';

  const storageKey = 'utc2-reshare-item-exchange-v1';
  const moderationKey = 'utc2-admin-post-statuses-v1';
  const postCodeCounterKey = 'utc2-reshare-post-code-counter-v1';
  const lostFoundStorageKey = 'utc2-reshare-lost-found-v1';
  const list = document.getElementById('ex-list');
  const emptyState = document.getElementById('ex-empty');
  const emptyTitle = document.getElementById('ex-empty-title');
  const emptyDescription = document.getElementById('ex-empty-description');
  const searchInput = document.getElementById('ex-search');
  const categoryFilter = document.getElementById('ex-category-filter');
  const statusFilter = document.getElementById('ex-status-filter');
  const resultCount = document.getElementById('ex-result-count');
  const storageError = document.getElementById('ex-storage-error');
  const formDialog = document.getElementById('ex-form-dialog');
  const detailDialog = document.getElementById('ex-detail-dialog');
  const listingForm = document.getElementById('ex-listing-form');
  const formError = document.getElementById('ex-form-error');
  let listings = [];
  let approvedIds = new Set();
  let isSubmitting = false;
  let selectedListingId = null;
  let storageReady = true;

  const categoryNames = {
    sach: 'Sách & tài liệu',
    'hoc-tap': 'Dụng cụ học tập',
    'ca-nhan': 'Đồ dùng cá nhân',
    khac: 'Khác'
  };

  function normalize(value) {
    return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }

  function formatDate(value) {
    const date = new Date(value + 'T00:00:00');
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN').format(date);
  }

  function localDateValue() {
    const now = new Date();
    return now.getFullYear() + '-'
      + String(now.getMonth() + 1).padStart(2, '0') + '-'
      + String(now.getDate()).padStart(2, '0');
  }

  function statusLabel(listing) {
    return listing.status === 'completed' ? 'Đã trao đổi' : 'Đang trao đổi';
  }

  function addText(parent, tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value;
    parent.appendChild(element);
    return element;
  }

  function createIcon() {
    const icon = document.createElement('span');
    icon.className = 'ex-card-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3"/></svg>';
    return icon;
  }

  function createCard(listing) {
    const card = document.createElement('article');
    card.className = 'ex-card';
    card.appendChild(createIcon());

    const content = document.createElement('div');
    content.className = 'ex-card-content';
    const meta = document.createElement('div');
    meta.className = 'ex-card-meta';
    addText(meta, 'span', 'ex-card-category', categoryNames[listing.category]);
    addText(meta, 'span', '', '·');
    addText(meta, 'span', '', formatDate(listing.date));
    content.appendChild(meta);
    addText(content, 'h3', '', listing.itemName);
    const wanted = document.createElement('p');
    wanted.className = 'ex-card-wanted';
    const label = document.createElement('strong');
    label.textContent = 'Muốn đổi lấy: ';
    wanted.append(label, document.createTextNode(listing.wantedItem));
    content.appendChild(wanted);
    addText(content, 'p', 'ex-card-location', listing.location);
    card.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'ex-card-actions';
    const status = addText(actions, 'span', 'ex-status' + (listing.status === 'completed' ? ' is-completed' : ''), statusLabel(listing));
    status.setAttribute('aria-label', 'Trạng thái: ' + statusLabel(listing));
    const details = addText(actions, 'button', '', 'Xem chi tiết');
    details.type = 'button';
    details.addEventListener('click', function () { showDetails(listing.id); });
    card.appendChild(actions);
    return card;
  }

  function updateList() {
    const term = normalize(searchInput.value.trim());
    const selectedCategory = categoryFilter.value;
    const selectedStatus = statusFilter.value;
    const visible = listings.filter(function (listing) {
      return approvedIds.has('exchange:' + listing.id);
    }).map(function (listing) {
      return Object.assign({}, listing, { status: listing.status === 'pending' ? 'open' : listing.status });
    });
    const filtered = visible.filter(function (listing) {
      const searchable = normalize(listing.itemName + ' ' + listing.wantedItem);
      return (!term || searchable.includes(term))
        && (selectedCategory === 'all' || listing.category === selectedCategory)
        && (selectedStatus === 'all' || listing.status === selectedStatus);
    });

    list.replaceChildren();
    filtered.forEach(function (listing) { list.appendChild(createCard(listing)); });
    emptyState.hidden = filtered.length > 0;
    resultCount.textContent = 'Hiển thị ' + filtered.length + ' / ' + visible.length + ' tin';
    if (visible.length === 0 && listings.length > 0) {
      emptyTitle.textContent = 'Tin đang chờ kiểm duyệt';
      emptyDescription.textContent = 'Tin sẽ xuất hiện tại đây sau khi được quản trị viên duyệt.';
    } else if (visible.length === 0) {
      emptyTitle.textContent = 'Chưa có tin trao đổi';
      emptyDescription.textContent = 'Đăng tin đầu tiên để món đồ hữu ích có thêm hành trình mới.';
    } else {
      emptyTitle.textContent = 'Chưa có tin phù hợp';
      emptyDescription.textContent = 'Hãy thử từ khóa khác hoặc thay đổi bộ lọc.';
    }
    document.getElementById('ex-empty-create').hidden = !storageReady;
  }

  function showStorageError(message) {
    storageError.textContent = message;
    storageError.hidden = false;
  }

  function refreshApprovals() {
    try {
      const saved = window.localStorage.getItem(moderationKey);
      const parsed = saved === null ? [] : JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(function (item) {
        return !item || typeof item.id !== 'string'
          || (item.status !== 'approved' && item.status !== 'hidden');
      })) {
        throw new Error('Dữ liệu kiểm duyệt đã lưu không đúng định dạng.');
      }
      approvedIds = new Set(parsed.filter(function (item) {
        return item.status === 'approved';
      }).map(function (item) { return item.id; }));
      return true;
    } catch (error) {
      approvedIds = new Set();
      storageReady = false;
      showStorageError('Không thể tải trạng thái kiểm duyệt. Tin chưa xác nhận sẽ không được hiển thị. ' + error.message);
      return false;
    }
  }

  function readListings() {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === null) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(function (listing) {
        return !listing || typeof listing.id !== 'string'
          || typeof listing.itemName !== 'string'
          || typeof listing.wantedItem !== 'string'
          || !Object.prototype.hasOwnProperty.call(categoryNames, listing.category)
          || (listing.status !== 'pending' && listing.status !== 'open' && listing.status !== 'completed')
          || typeof listing.date !== 'string';
      })) {
        throw new Error('Dữ liệu tin trao đổi đã lưu không đúng định dạng.');
      }
      return parsed;
    } catch (error) {
      storageReady = false;
      showStorageError('Không thể tải hoặc đọc tin trao đổi đã lưu trên trình duyệt. ' + error.message);
      return [];
    }
  }

  function saveListings() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(listings));
      storageError.hidden = true;
      storageReady = true;
      return true;
    } catch (error) {
      storageReady = false;
      showStorageError('Không thể lưu tin trao đổi trên trình duyệt. Hãy kiểm tra dung lượng lưu trữ hoặc quyền riêng tư của trình duyệt. ' + error.message);
      return false;
    }
  }

  function addContactLink(parent, kind, value) {
    if (!value) return;
    const link = document.createElement('a');
    if (kind === 'phone') {
      link.href = 'tel:' + value.replace(/[^\d+]/g, '');
      link.textContent = 'Gọi ' + value;
    } else {
      link.href = 'mailto:' + encodeURIComponent(value);
      link.textContent = 'Gửi email';
    }
    parent.appendChild(link);
  }

  function showDetails(id) {
    const listing = listings.find(function (item) { return item.id === id; });
    if (!listing) return;
    selectedListingId = id;
    document.getElementById('ex-detail-error').hidden = true;
    document.getElementById('ex-detail-category').textContent = categoryNames[listing.category];
    document.getElementById('ex-detail-title').textContent = listing.itemName;
    const status = document.getElementById('ex-detail-status');
    status.textContent = statusLabel(listing);
    status.classList.toggle('is-completed', listing.status === 'completed');
    document.getElementById('ex-detail-condition').textContent = listing.condition;
    document.getElementById('ex-detail-wanted').textContent = listing.wantedItem;
    document.getElementById('ex-detail-description').textContent = listing.description || 'Không có mô tả thêm.';
    document.getElementById('ex-detail-location').textContent = listing.location;
    document.getElementById('ex-detail-contact').textContent = listing.contactName;
    const contactActions = document.getElementById('ex-contact-actions');
    contactActions.replaceChildren();
    addContactLink(contactActions, 'phone', listing.phone);
    addContactLink(contactActions, 'email', listing.email);
    const toggleButton = document.getElementById('ex-toggle-status');
    toggleButton.textContent = listing.status === 'completed' ? 'Mở lại tin' : 'Đánh dấu đã trao đổi';
    toggleButton.disabled = !storageReady;
    detailDialog.showModal();
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function makePostCode() {
    function allocate() {
      const usedCodes = new Set();
      [storageKey, lostFoundStorageKey].forEach(function (key) {
        const saved = window.localStorage.getItem(key);
        const records = saved === null ? [] : JSON.parse(saved);
        if (!Array.isArray(records) || records.some(function (record) {
          return !record || typeof record !== 'object';
        })) {
          throw new Error('Dữ liệu tin đăng đã lưu không đúng định dạng.');
        }
        records.forEach(function (record) {
          if (typeof record.postCode === 'string' && /^\d{6}$/.test(record.postCode)) {
            usedCodes.add(record.postCode);
          }
        });
      });

      const savedCounter = window.localStorage.getItem(postCodeCounterKey);
      let counter = savedCounter === null ? 0 : Number(savedCounter);
      if (!Number.isInteger(counter) || counter < 0 || counter > 999999) {
        throw new Error('Bộ đếm mã tin không hợp lệ.');
      }
      usedCodes.forEach(function (code) {
        counter = Math.max(counter, Number(code));
      });
      for (let next = counter + 1; next <= 999999; next += 1) {
        const code = String(next).padStart(6, '0');
        if (usedCodes.has(code)) continue;
        window.localStorage.setItem(postCodeCounterKey, String(next));
        return code;
      }
      throw new Error('Đã hết mã tin 6 chữ số.');
    }

    if (navigator.locks && typeof navigator.locks.request === 'function') {
      return navigator.locks.request(postCodeCounterKey, allocate);
    }
    return Promise.resolve().then(allocate);
  }

  function openForm() {
    if (!storageReady) {
      showStorageError('Chưa thể đăng tin vì bộ nhớ trình duyệt không khả dụng.');
      return;
    }
    formError.hidden = true;
    listingForm.reset();
    formDialog.showModal();
  }

  document.getElementById('ex-open-form').addEventListener('click', openForm);
  document.getElementById('ex-empty-create').addEventListener('click', openForm);
  document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
    button.addEventListener('click', function () {
      [formDialog, detailDialog].forEach(function (dialog) {
        if (dialog.open) dialog.close();
      });
    });
  });
  [formDialog, detailDialog].forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });
  searchInput.addEventListener('input', updateList);
  categoryFilter.addEventListener('change', updateList);
  statusFilter.addEventListener('change', updateList);

  listingForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (isSubmitting) return;
    formError.hidden = true;
    const formData = new FormData(listingForm);
    const phone = String(formData.get('phone') || '').trim();
    const email = String(formData.get('email') || '').trim();
    if (!phone && !email) {
      formError.textContent = 'Vui lòng cung cấp số điện thoại hoặc email để người quan tâm có thể liên hệ.';
      formError.hidden = false;
      return;
    }
    if (phone && !/^\+?[\d\s().-]{8,24}$/.test(phone)) {
      formError.textContent = 'Số điện thoại chưa đúng định dạng. Vui lòng kiểm tra lại.';
      formError.hidden = false;
      return;
    }

    isSubmitting = true;
    let postCode;
    try {
      postCode = await makePostCode();
    } catch (error) {
      isSubmitting = false;
      formError.textContent = 'Không thể cấp mã tin 6 chữ số. ' + error.message;
      formError.hidden = false;
      return;
    }

    const listing = {
      id: makeId(),
      postCode: postCode,
      itemName: String(formData.get('itemName')).trim(),
      wantedItem: String(formData.get('wantedItem')).trim(),
      category: String(formData.get('category')),
      condition: String(formData.get('condition')),
      description: String(formData.get('description') || '').trim(),
      location: String(formData.get('location')).trim(),
      contactName: String(formData.get('contactName')).trim(),
      phone: phone,
      email: email,
      date: localDateValue(),
      status: 'pending'
    };
    listings.unshift(listing);
    if (!saveListings()) {
      listings.shift();
      isSubmitting = false;
      return;
    }
    isSubmitting = false;
    formDialog.close();
    searchInput.value = '';
    categoryFilter.value = 'all';
    statusFilter.value = 'all';
    updateList();
  });

  document.getElementById('ex-toggle-status').addEventListener('click', function () {
    const listing = listings.find(function (item) { return item.id === selectedListingId; });
    if (!listing) return;
    const previousStatus = listing.status;
    listing.status = previousStatus === 'completed' ? 'open' : 'completed';
    if (!saveListings()) {
      listing.status = previousStatus;
      return;
    }
    updateList();
    detailDialog.close();
  });

  window.addEventListener('storage', function (event) {
    if (event.key === moderationKey) {
      refreshApprovals();
      updateList();
    } else if (event.key === storageKey) {
      listings = readListings();
      updateList();
    }
  });

  document.getElementById('ex-year').textContent = String(new Date().getFullYear());
  refreshApprovals();
  listings = readListings();
  updateList();
})();
