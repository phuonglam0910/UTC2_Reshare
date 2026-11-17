(function () {
  'use strict';

  /* --- 1. DỮ LIỆU TÀI KHOẢN MẪU (Thay thế bằng API backend) --- */
  const MOCK_CREDENTIALS = {
    '2051010001': {
      password: 'utc2@123',
      fullName: 'Nguyễn Văn An'
    }
  };

  /* --- 2. TRUY XUẤT CÁC PHẦN TỬ DOM --- */
  // Các màn hình
  const screenLogin        = document.getElementById('screenLogin');
  const screenForgot       = document.getElementById('screenForgot');
  const screenRegister     = document.getElementById('screenRegister');

  // Form Đăng nhập
  const formLogin          = document.getElementById('formLogin');
  const txtMssv            = document.getElementById('txtMssv');
  const txtPassword        = document.getElementById('txtPassword');
  const fieldMssv          = document.getElementById('fieldMssv');
  const fieldPassword      = document.getElementById('fieldPassword');
  const mssvErrorDesc      = document.getElementById('mssvErrorDesc');
  const pwErrorDesc        = document.getElementById('pwErrorDesc');
  const loginAlertBox      = document.getElementById('loginAlertBox');
  const btnSubmitLogin     = document.getElementById('btnSubmitLogin');
  const btnTogglePw        = document.getElementById('btnTogglePw');
  const capsIndicator      = document.getElementById('capsIndicator');
  const chkRememberMssv    = document.getElementById('chkRememberMssv');
  const btnSsoLogin        = document.getElementById('btnSsoLogin');

  // Chuyển màn hình
  const linkToForgot       = document.getElementById('linkToForgot');
  const linkToRegister     = document.getElementById('linkToRegister');
  const btnBackFromForgot   = document.getElementById('btnBackFromForgot');
  const btnBackFromRegister = document.getElementById('btnBackFromRegister');

  // Chuyển cảnh & Trang chủ
  const formSide           = document.getElementById('formSide');
  const circleExpandOverlay= document.getElementById('circleExpandOverlay');
  const welcomeUserGreeting= document.getElementById('welcomeUserGreeting');
  const mainLayout         = document.getElementById('mainLayout');
  const homeShowcaseView   = document.getElementById('homeShowcaseView');
  const btnLogoutPortal    = document.getElementById('btnLogoutPortal');

  /* --- 3. GHI NHỚ MÃ SỐ SINH VIÊN (CHỈ LƯU MSSV, KHÔNG LƯU MẬT KHẨU) --- */
  (function restoreRememberedMssv() {
    const savedMssv = localStorage.getItem('utc2-remember-mssv');
    if (savedMssv) {
      txtMssv.value = savedMssv;
      chkRememberMssv.checked = true;
    }
  })();

  /* --- 4. ĐIỀU HƯỚNG TRƯỢT MÀN HÌNH (Đăng nhập / Quên MK / Đăng ký) --- */
  let activeScreenName = 'login'; // 'login' | 'forgot' | 'register'

  function switchScreen(targetName) {
    if (targetName === activeScreenName) return;

    const screens = {
      login: screenLogin,
      forgot: screenForgot,
      register: screenRegister
    };

    const hierarchy = ['login', 'forgot', 'register'];
    const currentIdx = hierarchy.indexOf(activeScreenName);
    const targetIdx  = hierarchy.indexOf(targetName);
    const movingRight = targetIdx > currentIdx;

    const fromEl = screens[activeScreenName];
    const toEl   = screens[targetName];

    // Ẩn màn hình cũ
    fromEl.classList.remove('is-active');
    fromEl.classList.add(movingRight ? 'is-hidden-left' : 'is-hidden-right');

    // Chuẩn bị màn hình mới
    toEl.classList.remove('is-hidden-left', 'is-hidden-right');
    toEl.classList.add(movingRight ? 'is-hidden-right' : 'is-hidden-left');

    // Kích hoạt animation
    void toEl.offsetWidth; // ép reflow
    toEl.classList.remove('is-hidden-left', 'is-hidden-right');
    toEl.classList.add('is-active');

    activeScreenName = targetName;

    // Xóa thông báo lỗi cũ
    hideBanner(loginAlertBox);
    clearFieldError(fieldMssv, mssvErrorDesc);
    clearFieldError(fieldPassword, pwErrorDesc);

    // Tự động focus vào ô đầu tiên
    const targetInput = toEl.querySelector('input');
    if (targetInput) {
      setTimeout(() => targetInput.focus(), 350);
    }
  }

  linkToForgot.addEventListener('click', (e) => { e.preventDefault(); switchScreen('forgot'); });
  linkToRegister.addEventListener('click', (e) => { e.preventDefault(); switchScreen('register'); });
  btnBackFromForgot.addEventListener('click', (e) => { e.preventDefault(); switchScreen('login'); });
  btnBackFromRegister.addEventListener('click', (e) => { e.preventDefault(); switchScreen('login'); });

  /* --- 5. KIỂM TRA DỮ LIỆU (VALIDATION THỜI GIAN THỰC) --- */
  function validateMssv(value) {
    const val = value.trim();
    if (!val) {
      return 'Vui lòng nhập mã số sinh viên.';
    }
    if (/[^0-9]/.test(val)) {
      return 'Mã số sinh viên chỉ bao gồm chữ số (0–9).';
    }
    if (val.length < 8) {
      return `Mã số sinh viên gồm từ 8 đến 12 số. Bạn mới nhập ${val.length} số.`;
    }
    if (val.length > 12) {
      return 'Mã số sinh viên không vượt quá 12 số.';
    }
    return '';
  }

  function validatePassword(value) {
    if (!value) {
      return 'Vui lòng nhập mật khẩu của bạn.';
    }
    return '';
  }

  function setFieldError(fieldWrapper, errorElement, message) {
    fieldWrapper.classList.add('has-error');
    errorElement.textContent = message;
  }

  function clearFieldError(fieldWrapper, errorElement) {
    fieldWrapper.classList.remove('has-error');
    errorElement.textContent = '';
  }

  function showBanner(bannerEl, message, isShake = false) {
    bannerEl.classList.add('is-shown');
    const textSpan = bannerEl.querySelector('span');
    if (textSpan && message) textSpan.textContent = message;

    if (isShake) {
      bannerEl.classList.remove('shake-anim');
      void bannerEl.offsetWidth; // reflow
      bannerEl.classList.add('shake-anim');
    }
  }

  function hideBanner(bannerEl) {
    bannerEl.classList.remove('is-shown', 'shake-anim');
  }

  // Xử lý tự động lọc chỉ nhận chữ số cho MSSV
  txtMssv.addEventListener('input', function () {
    this.value = this.value.replace(/[^0-9]/g, '');
    const err = validateMssv(this.value);
    if (!err) clearFieldError(fieldMssv, mssvErrorDesc);
  });

  txtMssv.addEventListener('blur', function () {
    const err = validateMssv(this.value);
    if (err) setFieldError(fieldMssv, mssvErrorDesc, err);
    else clearFieldError(fieldMssv, mssvErrorDesc);
  });

  txtPassword.addEventListener('input', function () {
    if (this.value) clearFieldError(fieldPassword, pwErrorDesc);
  });

  txtPassword.addEventListener('blur', function () {
    const err = validatePassword(this.value);
    if (err) setFieldError(fieldPassword, pwErrorDesc, err);
    else clearFieldError(fieldPassword, pwErrorDesc);
  });

  // Kiểm tra Caps Lock
  txtPassword.addEventListener('keyup', function (e) {
    if (typeof e.getModifierState === 'function') {
      const isCaps = e.getModifierState('CapsLock');
      capsIndicator.classList.toggle('is-visible', isCaps);
    }
  });

  txtPassword.addEventListener('blur', function () {
    capsIndicator.classList.remove('is-visible');
  });

  // Ẩn / Hiện mật khẩu
  btnTogglePw.addEventListener('click', function () {
    const isCurrentlyPassword = txtPassword.type === 'password';
    txtPassword.type = isCurrentlyPassword ? 'text' : 'password';
    this.classList.toggle('is-showing', isCurrentlyPassword);
    this.setAttribute('aria-label', isCurrentlyPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    txtPassword.focus();
  });

  /* --- 6. XỬ LÝ SUBMIT ĐĂNG NHẬP VÀ HIỆU ỨNG ĐIỂM NHẤN --- */
  formLogin.addEventListener('submit', function (e) {
    e.preventDefault();
    hideBanner(loginAlertBox);

    const mssvVal = txtMssv.value.trim();
    const pwVal   = txtPassword.value;

    const mssvErr = validateMssv(mssvVal);
    const pwErr   = validatePassword(pwVal);

    if (mssvErr) setFieldError(fieldMssv, mssvErrorDesc, mssvErr);
    if (pwErr)   setFieldError(fieldPassword, pwErrorDesc, pwErr);

    if (mssvErr || pwErr) {
      if (mssvErr) txtMssv.focus();
      else txtPassword.focus();
      return;
    }

    // Bắt đầu trạng thái xoay loading
    btnSubmitLogin.classList.add('is-busy');
    btnSubmitLogin.disabled = true;

    // Giả lập kết nối xác thực
    setTimeout(() => {
      const userAccount = MOCK_CREDENTIALS[mssvVal];

      if (userAccount && userAccount.password === pwVal) {
        // === ĐĂNG NHẬP THÀNH CÔNG ===
        // Ghi nhớ MSSV nếu tick checkbox
        if (chkRememberMssv.checked) {
          localStorage.setItem('utc2-remember-mssv', mssvVal);
        } else {
          localStorage.removeItem('utc2-remember-mssv');
        }

        // Chuyển nút sang tick xanh vẽ dần
        btnSubmitLogin.classList.remove('is-busy');
        btnSubmitLogin.classList.add('is-completed');

        // Kích hoạt hiệu ứng Circle Reveal từ vị trí nút
        setTimeout(() => {
          triggerCircleReveal(userAccount.fullName);
        }, 550);

      } else {
        // === SAI THÔNG TIN ĐĂNG NHẬP ===
        btnSubmitLogin.classList.remove('is-busy');
        btnSubmitLogin.disabled = false;
        showBanner(
          loginAlertBox,
          'Mã số sinh viên hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.',
          true // hiệu ứng rung
        );
        txtPassword.value = '';
        txtPassword.focus();
      }
    }, 1100);
  });

  /* Hiệu ứng Circle Reveal phủ màn hình */
  function triggerCircleReveal(userName) {
    const btnRect = btnSubmitLogin.getBoundingClientRect();
    const centerX = btnRect.left + btnRect.width / 2;
    const centerY = btnRect.top + btnRect.height / 2;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    circleExpandOverlay.style.setProperty('--click-x', `${(centerX / screenW) * 100}%`);
    circleExpandOverlay.style.setProperty('--click-y', `${(centerY / screenH) * 100}%`);

    welcomeUserGreeting.textContent = `Xin chào, ${userName}!`;

    // Form mờ dần và trượt lên
    formSide.classList.add('is-exiting');

    // Mở vòng tròn lan tỏa
    circleExpandOverlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      circleExpandOverlay.classList.add('is-active');
    });

    // Dừng tại trang giữ chỗ Trang Chủ
    setTimeout(() => {
      mainLayout.style.display = 'none';
      circleExpandOverlay.classList.remove('is-active');
      circleExpandOverlay.setAttribute('aria-hidden', 'true');
      homeShowcaseView.classList.add('is-visible');
    }, 2200);
  }

  /* Nút Đăng xuất quay lại màn hình đăng nhập */
  btnLogoutPortal.addEventListener('click', function () {
    homeShowcaseView.classList.remove('is-visible');
    mainLayout.style.display = '';
    formSide.classList.remove('is-exiting');
    btnSubmitLogin.classList.remove('is-busy', 'is-completed');
    btnSubmitLogin.disabled = false;
    txtPassword.value = '';
    hideBanner(loginAlertBox);
    clearFieldError(fieldMssv, mssvErrorDesc);
    clearFieldError(fieldPassword, pwErrorDesc);
    switchScreen('login');

    // Reset thanh tiến trình
    document.getElementById('welcomeMeterFill').style.width = '0%';
    setTimeout(() => txtMssv.focus(), 150);
  });

  /* --- 7. GIẢ LẬP ĐĂNG NHẬP EMAIL SINH VIÊN (SSO) --- */
  btnSsoLogin.addEventListener('click', function () {
    alert('Cổng đăng nhập SSO qua tài khoản Microsoft Office 365 (@utc2.edu.vn) đang được tích hợp. Vui lòng đăng nhập bằng MSSV và mật khẩu.');
  });

})();