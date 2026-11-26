(function () {
  'use strict';

  const storageKey = 'utc2-reshare-lost-found-v1';
  const moderationKey = 'utc2-admin-post-statuses-v1';
  const postCodeCounterKey = 'utc2-reshare-post-code-counter-v1';
  const exchangeStorageKey = 'utc2-reshare-item-exchange-v1';
  const list = document.getElementById('lf-list');
  const emptyState = document.getElementById('lf-empty');
  const emptyTitle = document.getElementById('lf-empty-title');
  const emptyDescription = document.getElementById('lf-empty-description');
  const searchInput = document.getElementById('lf-search');
  const typeFilter = document.getElementById('lf-type-filter');
  const statusFilter = document.getElementById('lf-status-filter');
  const resultCount = document.getElementById('lf-result-count');
  const storageError = document.getElementById('lf-storage-error');
  const formDialog = document.getElementById('lf-form-dialog');
  const detailDialog = document.getElementById('lf-detail-dialog');
  const reportForm = document.getElementById('lf-report-form');
  const formError = document.getElementById('lf-form-error');
  const detailError = document.getElementById('lf-detail-error');
  let reports = [];
  let approvedIds = new Set();
  let isSubmitting = false;
  let selectedReportId = null;
  let storageReady = true;

  function normalize(value) {
    return value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }

  function escapeText(element, value) {
    element.textContent = value;
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

  function statusLabel(report) {
    if (report.status === 'resolved') return 'Đã trao trả';
    return report.type === 'lost' ? 'Đang tìm' : 'Đang tìm chủ nhân';
  }

  function makeIcon(type) {
    const wrapper = document.createElement('span');
    wrapper.className = 'lf-card-icon' + (type === 'found' ? ' is-found' : '');
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = type === 'found'
      ? '<svg viewBox="0 0 24 24"><path d="M12 21s7-4.4 7-11V5l-7-3-7 3v5c0 6.6 7 11 7 11Z"/><path d="m9 12 2 2 4-4"/></svg>'
      : '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4M8 10h5m-2.5-2.5v5"/></svg>';
    return wrapper;
  }

  function addText(parent, tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value;
    parent.appendChild(element);
    return element;
  }

  function createCard(report) {
    const card = document.createElement('article');
    card.className = 'lf-card';
    card.appendChild(makeIcon(report.type));

    const content = document.createElement('div');
    content.className = 'lf-card-content';
    const meta = document.createElement('div');
    meta.className = 'lf-card-meta';
    addText(meta, 'span', 'lf-kind' + (report.type === 'found' ? ' is-found' : ''), report.type === 'lost' ? 'Báo mất' : 'Nhặt được');
    addText(meta, 'span', '', '·');
    addText(meta, 'span', '', formatDate(report.date));
    content.appendChild(meta);
    addText(content, 'h3', '', report.itemName);
    addText(content, 'p', 'lf-card-location', report.location);
    card.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'lf-card-actions';
    const status = addText(actions, 'span', 'lf-status' + (report.status === 'resolved' ? ' is-resolved' : ''), statusLabel(report));
    status.setAttribute('aria-label', 'Trạng thái: ' + statusLabel(report));
    const details = addText(actions, 'button', '', 'Xem chi tiết');
    details.type = 'button';
    details.addEventListener('click', function () {
      showDetails(report.id);
    });
    card.appendChild(actions);
    return card;
  }

  function updateList() {
    const term = normalize(searchInput.value.trim());
    const selectedType = typeFilter.value;
    const selectedStatus = statusFilter.value;
    const visible = reports.filter(function (report) {
      return approvedIds.has('lost-found:' + report.id);
    }).map(function (report) {
      return Object.assign({}, report, { status: report.status === 'pending' ? 'open' : report.status });
    });
    const filtered = visible.filter(function (report) {
      return (!term || normalize(report.itemName).includes(term))
        && (selectedType === 'all' || report.type === selectedType)
        && (selectedStatus === 'all' || report.status === selectedStatus);
    });

    list.replaceChildren();
    filtered.forEach(function (report) {
      list.appendChild(createCard(report));
    });
    emptyState.hidden = filtered.length > 0;
    resultCount.textContent = 'Hiển thị ' + filtered.length + ' / ' + visible.length + ' tin';
    if (visible.length === 0 && reports.length > 0) {
      emptyTitle.textContent = 'Tin đang chờ kiểm duyệt';
      emptyDescription.textContent = 'Tin sẽ xuất hiện tại đây sau khi được quản trị viên duyệt.';
    } else if (visible.length === 0) {
      emptyTitle.textContent = 'Chưa có tin thất lạc';
      emptyDescription.textContent = 'Hãy đăng tin báo mất hoặc nhặt được để cộng đồng UTC2 cùng hỗ trợ.';
    } else {
      emptyTitle.textContent = 'Chưa có tin phù hợp';
      emptyDescription.textContent = 'Hãy thử từ khóa khác hoặc thay đổi bộ lọc.';
    }
    document.getElementById('lf-empty-create').hidden = !storageReady;
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

  function readReports() {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === null) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(function (report) {
        return !report || typeof report.id !== 'string'
          || typeof report.itemName !== 'string'
          || (report.type !== 'lost' && report.type !== 'found')
          || (report.status !== 'pending' && report.status !== 'open' && report.status !== 'resolved')
          || typeof report.date !== 'string';
      })) {
        throw new Error('Dữ liệu tin đăng đã lưu không đúng định dạng.');
      }
      return parsed;
    } catch (error) {
      storageReady = false;
      showStorageError('Không thể tải hoặc đọc tin đăng đã lưu trên trình duyệt. ' + error.message);
      return [];
    }
  }

  function saveReports() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(reports));
      storageError.hidden = true;
      storageReady = true;
      return true;
    } catch (error) {
      storageReady = false;
      showStorageError('Không thể lưu tin đăng trên trình duyệt. Hãy kiểm tra dung lượng lưu trữ hoặc quyền riêng tư của trình duyệt. ' + error.message);
      return false;
    }
  }

  function showDetails(id) {
    const report = reports.find(function (item) { return item.id === id; });
    if (!report) return;
    selectedReportId = id;
    detailError.hidden = true;
    escapeText(document.getElementById('lf-detail-type'), report.type === 'lost' ? 'Tin báo mất' : 'Tin nhặt được');
    escapeText(document.getElementById('lf-detail-title'), report.itemName);
    const detailStatus = document.getElementById('lf-detail-status');
    escapeText(detailStatus, statusLabel(report));
    detailStatus.classList.toggle('is-resolved', report.status === 'resolved');
    escapeText(document.getElementById('lf-detail-description'), report.description);
    escapeText(document.getElementById('lf-detail-location'), report.location);
    escapeText(document.getElementById('lf-detail-date'), formatDate(report.date));
    escapeText(document.getElementById('lf-detail-contact'), report.contactName);

    const contactActions = document.getElementById('lf-contact-actions');
    contactActions.replaceChildren();
    if (report.phone) {
      const phoneLink = document.createElement('a');
      phoneLink.href = 'tel:' + report.phone.replace(/[^\d+]/g, '');
      phoneLink.textContent = 'Gọi ' + report.phone;
      contactActions.appendChild(phoneLink);
    }
    if (report.email) {
      const emailLink = document.createElement('a');
      emailLink.href = 'mailto:' + encodeURIComponent(report.email);
      emailLink.textContent = 'Gửi email';
      contactActions.appendChild(emailLink);
    }
    const toggleButton = document.getElementById('lf-toggle-status');
    toggleButton.textContent = report.status === 'resolved' ? 'Mở lại tin' : 'Đánh dấu đã trao trả';
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
      [exchangeStorageKey, storageKey].forEach(function (key) {
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

  function closeDialogs() {
    [formDialog, detailDialog].forEach(function (dialog) {
      if (dialog.open) dialog.close();
    });
  }

  function openForm() {
    if (!storageReady) {
      showStorageError('Chưa thể đăng tin vì bộ nhớ trình duyệt không khả dụng.');
      return;
    }
    formError.hidden = true;
    reportForm.reset();
    reportForm.elements.date.value = localDateValue();
    formDialog.showModal();
  }

  document.getElementById('lf-open-form').addEventListener('click', openForm);
  document.getElementById('lf-empty-create').addEventListener('click', openForm);
  document.querySelectorAll('[data-close-dialog]').forEach(function (button) {
    button.addEventListener('click', closeDialogs);
  });
  [formDialog, detailDialog].forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });
  searchInput.addEventListener('input', updateList);
  typeFilter.addEventListener('change', updateList);
  statusFilter.addEventListener('change', updateList);

  reportForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (isSubmitting) return;
    formError.hidden = true;
    const formData = new FormData(reportForm);
    const phone = String(formData.get('phone') || '').trim();
    const email = String(formData.get('email') || '').trim();
    if (!phone && !email) {
      formError.textContent = 'Vui lòng cung cấp số điện thoại hoặc email để người khác liên hệ.';
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

    const report = {
      id: makeId(),
      postCode: postCode,
      type: String(formData.get('type')),
      itemName: String(formData.get('itemName')).trim(),
      description: String(formData.get('description')).trim(),
      location: String(formData.get('location')).trim(),
      date: String(formData.get('date')),
      contactName: String(formData.get('contactName')).trim(),
      phone: phone,
      email: email,
      status: 'pending'
    };
    reports.unshift(report);
    if (!saveReports()) {
      reports.shift();
      isSubmitting = false;
      return;
    }
    isSubmitting = false;
    formDialog.close();
    searchInput.value = '';
    typeFilter.value = 'all';
    statusFilter.value = 'all';
    updateList();
  });

  document.getElementById('lf-toggle-status').addEventListener('click', function () {
    const report = reports.find(function (item) { return item.id === selectedReportId; });
    if (!report) return;
    const previousStatus = report.status;
    report.status = previousStatus === 'resolved' ? 'open' : 'resolved';
    if (!saveReports()) {
      report.status = previousStatus;
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
      reports = readReports();
      updateList();
    }
  });

  document.getElementById('lf-year').textContent = String(new Date().getFullYear());
  refreshApprovals();
  reports = readReports();
  updateList();
})();
