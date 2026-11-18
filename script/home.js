(function () {
  'use strict';

  const menuToggle = document.querySelector('.menu-toggle');
  const navigation = document.getElementById('primary-navigation');
  const tabs = Array.from(document.querySelectorAll('[data-listing-type]'));
  const filters = Array.from(document.querySelectorAll('[data-category]'));
  const cards = Array.from(document.querySelectorAll('.listing-card'));
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('site-search');
  const emptyState = document.getElementById('empty-state');
  const searchStatus = document.getElementById('search-status');
  const listingGrid = document.getElementById('listing-grid');
  const lostButton = document.querySelector('[data-open-lost]');
  const currentYear = document.getElementById('current-year');

  let activeType = 'items';
  let activeCategory = 'all';
  let searchTerm = '';

  function updateListings() {
    let visibleCount = 0;

    cards.forEach(function (card) {
      const matchesType = card.dataset.type === activeType;
      const matchesCategory = activeCategory === 'all' || card.dataset.category === activeCategory;
      const searchableText = (card.dataset.search + ' ' + card.textContent).toLocaleLowerCase('vi');
      const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
      const isVisible = matchesType && matchesCategory && matchesSearch;

      card.classList.toggle('is-hidden', !isVisible);
      if (isVisible) visibleCount += 1;
    });

    emptyState.hidden = visibleCount > 0;
    listingGrid.setAttribute('aria-labelledby', activeType === 'lost' ? 'tab-lost' : 'tab-items');
    searchStatus.textContent = visibleCount
      ? 'Tìm thấy ' + visibleCount + ' tin.'
      : 'Không tìm thấy tin phù hợp.';
  }

  function closeNavigation() {
    if (!menuToggle || !navigation) return;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.querySelector('.menu-toggle-label').textContent = 'Mở menu';
    navigation.classList.remove('is-open');
  }

  if (menuToggle && navigation) {
    menuToggle.addEventListener('click', function () {
      const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isOpen));
      menuToggle.querySelector('.menu-toggle-label').textContent = isOpen ? 'Mở menu' : 'Đóng menu';
      navigation.classList.toggle('is-open', !isOpen);
    });

    navigation.addEventListener('click', function (event) {
      if (event.target.closest('a')) closeNavigation();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeNavigation();
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activeType = tab.dataset.listingType;
      tabs.forEach(function (item) {
        const isSelected = item === tab;
        item.classList.toggle('is-active', isSelected);
        item.setAttribute('aria-selected', String(isSelected));
      });

      filters.forEach(function (filter) {
        filter.classList.toggle('is-active', filter.dataset.category === 'all');
        filter.setAttribute('aria-pressed', String(filter.dataset.category === 'all'));
      });
      activeCategory = 'all';
      updateListings();
    });
  });

  filters.forEach(function (filter) {
    filter.addEventListener('click', function () {
      activeCategory = filter.dataset.category;
      filters.forEach(function (item) {
        const isSelected = item === filter;
        item.classList.toggle('is-active', isSelected);
        item.setAttribute('aria-pressed', String(isSelected));
      });
      updateListings();
    });
  });

  searchInput.addEventListener('input', function () {
    searchTerm = searchInput.value.trim().toLocaleLowerCase('vi');
    updateListings();
  });

  searchForm.addEventListener('submit', function (event) {
    event.preventDefault();
    document.getElementById('do-dung').scrollIntoView({ behavior: 'smooth' });
    updateListings();
  });

  lostButton.addEventListener('click', function () {
    const lostTab = document.getElementById('tab-lost');
    activeType = 'lost';
    activeCategory = 'all';
    filters.forEach(function (filter) {
      const isAll = filter.dataset.category === 'all';
      filter.classList.toggle('is-active', isAll);
      filter.setAttribute('aria-pressed', String(isAll));
    });
    tabs.forEach(function (tab) {
      const isSelected = tab === lostTab;
      tab.classList.toggle('is-active', isSelected);
      tab.setAttribute('aria-selected', String(isSelected));
    });
    updateListings();
    document.getElementById('do-dung').scrollIntoView({ behavior: 'smooth' });
  });

  currentYear.textContent = String(new Date().getFullYear());
  updateListings();
})();
