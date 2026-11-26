(function () {
  'use strict';

  /* --- 1. DỮ LIỆU TÀI KHOẢN MẪU (Thay thế bằng API backend) --- */
  const MOCK_CREDENTIALS = {
    'admin@st.utc2.edu.vn': {
      password: 'admin123**',
      fullName: 'Quản trị viên',
      role: 'admin'
    },
    'nguyenvanan@gmail.com': {
      password: 'utc2@123',
      fullName: 'Nguyễn Văn An',
      role: 'student'
    },
    'tranvanbinh@gmail.com': {
      password: 'utc2@12345',
      fullName: 'Trần Văn Bình',
      role: 'student'
    },
  };

  /* Đồng bộ hồ sơ tài khoản mẫu với danh sách mà trang quản trị sử dụng. */
  function syncMockAccounts() {
    try {
      const raw = localStorage.getItem('utc2_users');
      const users = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(users)) {
        throw new TypeError('Danh sách tài khoản phải là một mảng.');
      }

      const updatedUsers = users.slice();
      Object.keys(MOCK_CREDENTIALS).forEach((email) => {
        const account = MOCK_CREDENTIALS[email];
        const normalizedEmail = email.trim().toLowerCase();
        const index = updatedUsers.findIndex((user) =>
          user && typeof user === 'object' &&
          String(user.email || '').trim().toLowerCase() === normalizedEmail
        );
        const existing = index === -1 ? {} : updatedUsers[index];
        const profile = Object.assign({}, existing);
        delete profile.password;
        Object.assign(profile, {
          id: profile.id || (account.role === 'admin' ? 'admin' : 'login:' + normalizedEmail),
          email: normalizedEmail,
          fullName: account.fullName,
          role: account.role,
          status: profile.status || 'active'
        });

        if (index === -1) updatedUsers.push(profile);
        else updatedUsers[index] = profile;
      });

      localStorage.setItem('utc2_users', JSON.stringify(updatedUsers));
    } catch (error) {
      console.error('[login] Không thể đồng bộ tài khoản với danh sách quản trị.', error);
    }
  }

  syncMockAccounts();

  /* --- 2. TRUY XUẤT CÁC PHẦN TỬ DOM --- */
  // Các màn hình
  const screenLogin = document.getElementById('screenLogin');
  const screenForgot = document.getElementById('screenForgot');
  const screenRegister = document.getElementById('screenRegister');

  // Form Đăng nhập
  const formLogin = document.getElementById('formLogin');
  const txtEmail = document.getElementById('txtEmail');
  const txtPassword = document.getElementById('txtPassword');
  const fieldEmail = document.getElementById('fieldEmail');
  const fieldPassword = document.getElementById('fieldPassword');
  const emailErrorDesc = document.getElementById('emailErrorDesc');
  const pwErrorDesc = document.getElementById('pwErrorDesc');
  const loginAlertBox = document.getElementById('loginAlertBox');
  const btnSubmitLogin = document.getElementById('btnSubmitLogin');
  const btnTogglePw = document.getElementById('btnTogglePw');
  const capsIndicator = document.getElementById('capsIndicator');
  const chkRememberEmail = document.getElementById('chkRememberEmail');
  const btnSsoLogin = document.getElementById('btnSsoLogin');

  // Chuyển màn hình
  const linkToForgot = document.getElementById('linkToForgot');
  const btnBackFromForgot = document.getElementById('btnBackFromForgot');
  const authModeSwitch = document.getElementById('authModeSwitch');
  const authModeTabs = document.querySelectorAll('[data-auth-tab]');

  // Chuyển cảnh & Trang chủ
  const formSide = document.getElementById('formSide');
  const circleExpandOverlay = document.getElementById('circleExpandOverlay');
  const welcomeUserGreeting = document.getElementById('welcomeUserGreeting');
  const mainLayout = document.getElementById('mainLayout');
  const homeShowcaseView = document.getElementById('homeShowcaseView');
  const btnLogoutPortal = document.getElementById('btnLogoutPortal');

  /* --- 3. GHI NHỚ EMAIL (KHÔNG LƯU MẬT KHẨU) --- */
  (function restoreRememberedEmail() {
    const savedEmail = localStorage.getItem('utc2-remember-email');
    if (savedEmail) {
      txtEmail.value = savedEmail;
      chkRememberEmail.checked = true;
    }
  })();

  /* --- 4. ĐIỀU HƯỚNG TRƯỢT MÀN HÌNH (Đăng nhập / Quên MK / Đăng ký) --- */
  let activeScreenName = 'login'; // 'login' | 'forgot' | 'register'
  let screenTransitionTimer = null;

  function switchScreen(targetName) {
    if (targetName === activeScreenName || screenTransitionTimer !== null) return;

    const screens = {
      login: screenLogin,
      forgot: screenForgot,
      register: screenRegister
    };

    const fromEl = screens[activeScreenName];
    const toEl = screens[targetName];
    const hierarchy = ['login', 'forgot', 'register'];
    const movingRight =
      hierarchy.indexOf(targetName) > hierarchy.indexOf(activeScreenName);
    const oldHeight = formSide.querySelector('.form-stage').offsetHeight;

    // Giữ chiều cao hiện tại để khung form không bị nhảy giật.
    const stage = formSide.querySelector('.form-stage');
    stage.style.height = `${oldHeight}px`;

    // Chuẩn bị màn hình đích ở mép đối diện.
    toEl.classList.remove(
      'is-active',
      'is-hidden-left',
      'is-hidden-right',
      'is-leaving-left',
      'is-leaving-right'
    );
    toEl.classList.add(movingRight ? 'is-hidden-right' : 'is-hidden-left');
    toEl.setAttribute('aria-hidden', 'true');

    // Cho màn hình cũ rời chậm theo chiều ngược lại.
    fromEl.classList.remove('is-active');
    fromEl.classList.add(movingRight ? 'is-leaving-left' : 'is-leaving-right');
    fromEl.setAttribute('aria-hidden', 'true');

    // Kích hoạt cặp chuyển cảnh cùng một frame.
    requestAnimationFrame(() => {
      void toEl.offsetWidth;
      toEl.classList.remove('is-hidden-left', 'is-hidden-right');
      toEl.classList.add('is-active');
      toEl.setAttribute('aria-hidden', 'false');

      const targetHeight = toEl.offsetHeight;
      stage.style.height = `${targetHeight}px`;
      activeScreenName = targetName;
    });

    screenTransitionTimer = window.setTimeout(() => {
      fromEl.classList.remove('is-leaving-left', 'is-leaving-right');
      fromEl.classList.add(movingRight ? 'is-hidden-left' : 'is-hidden-right');
      stage.style.height = '';
      screenTransitionTimer = null;
    }, 500);

    authModeTabs.forEach((tab) => {
      const isActive = tab.dataset.authTab === targetName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Cập nhật vị trí khung tròn trượt (Glider indicator)
    if (authModeSwitch) {
      if (targetName === 'forgot') {
        authModeSwitch.classList.add('is-hidden');
      } else {
        authModeSwitch.classList.remove('is-hidden');
        authModeSwitch.setAttribute('data-active', targetName);
      }
    }

    // Xóa thông báo lỗi cũ
    hideBanner(loginAlertBox);
    clearFieldError(fieldEmail, emailErrorDesc);
    clearFieldError(fieldPassword, pwErrorDesc);

    // Tự động focus vào ô đầu tiên
    const targetInput = toEl.querySelector('input');
    if (targetInput) {
      setTimeout(() => targetInput.focus(), 350);
    }
  }

  linkToForgot.addEventListener('click', (e) => { e.preventDefault(); switchScreen('forgot'); });
  btnBackFromForgot.addEventListener('click', (e) => { e.preventDefault(); switchScreen('login'); });
  authModeTabs.forEach((tab) => {
    tab.addEventListener('click', function () {
      switchScreen(this.dataset.authTab);
    });
  });
  if (window.location.hash === '#register') switchScreen('register');

  /* --- 5. KIỂM TRA DỮ LIỆU (VALIDATION THỜI GIAN THỰC) --- */
  function validateEmail(value) {
    const email = value.trim();
    if (!email) {
      return 'Vui lòng nhập email bạn đã đăng ký.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Vui lòng nhập địa chỉ email hợp lệ.';
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

  txtEmail.addEventListener('input', function () {
    const err = validateEmail(this.value);
    if (!err) clearFieldError(fieldEmail, emailErrorDesc);
  });

  txtEmail.addEventListener('blur', function () {
    const err = validateEmail(this.value);
    if (err) setFieldError(fieldEmail, emailErrorDesc, err);
    else clearFieldError(fieldEmail, emailErrorDesc);
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

    const emailVal = txtEmail.value.trim().toLowerCase();
    const pwVal = txtPassword.value;

    const emailErr = validateEmail(emailVal);
    const pwErr = validatePassword(pwVal);

    if (emailErr) setFieldError(fieldEmail, emailErrorDesc, emailErr);
    if (pwErr) setFieldError(fieldPassword, pwErrorDesc, pwErr);

    if (emailErr || pwErr) {
      if (emailErr) txtEmail.focus();
      else txtPassword.focus();
      return;
    }

    // Bắt đầu trạng thái xoay loading
    btnSubmitLogin.classList.add('is-busy');
    btnSubmitLogin.disabled = true;

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailVal, password: pwVal })
    })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể đăng nhập.');
        return data.user;
      })
      .then((userAccount) => {
        if (chkRememberEmail.checked) {
          localStorage.setItem('utc2-remember-email', emailVal);
        } else {
          localStorage.removeItem('utc2-remember-email');
        }
        sessionStorage.setItem('utc2-authenticated', 'true');
        sessionStorage.setItem('utc2-user-name', userAccount.fullName);
        sessionStorage.setItem('utc2-user-email', userAccount.email);
        sessionStorage.setItem('utc2-user-role', userAccount.role);
        localStorage.setItem('utc2_currentUser', JSON.stringify(userAccount));

        btnSubmitLogin.classList.remove('is-busy');
        btnSubmitLogin.classList.add('is-completed');
        setTimeout(() => {
          triggerCircleReveal(
            userAccount.fullName,
            userAccount.role === 'admin' ? 'dashboard.html' : 'index.html'
          );
        }, 550);
      })
      .catch((error) => {
        btnSubmitLogin.classList.remove('is-busy');
        btnSubmitLogin.disabled = false;
        showBanner(loginAlertBox, error.message, true);
        txtPassword.value = '';
        txtPassword.focus();
      });
  });

  /* Hiệu ứng Circle Reveal phủ màn hình */
  function triggerCircleReveal(userName, destination) {
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

    // Chuyển tới trang chủ sau hiệu ứng hoàn tất
    setTimeout(() => {
      circleExpandOverlay.classList.remove('is-active');
      circleExpandOverlay.setAttribute('aria-hidden', 'true');
      window.location.assign(destination);
    }, 2200);
  }

  /* --- Đăng ký tài khoản, lưu vào SQLite trên máy chủ --- */
  const formRegister = document.getElementById('formRegister');
  if (formRegister) {
    formRegister.addEventListener('submit', async function (event) {
      event.preventDefault();

      const fullName = document.getElementById('registerFullName').value.trim();
      const email = document.getElementById('registerEmail').value.trim().toLowerCase();
      const role = document.getElementById('registerRole').value;
      const studentId = document.getElementById('registerStudentId').value.trim();
      const password = document.getElementById('registerPassword').value;
      const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
      const agreeTerms = document.getElementById('chkAgreeTerms');
      const submitButton = document.getElementById('btnSubmitRegister');
      const alertBox = document.getElementById('registerAlertBox');
      const alertMessage = document.getElementById('registerAlertMsg');

      if (fullName.length < 2) {
        showBanner(alertBox, 'Họ và tên tối thiểu 2 ký tự.', true);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showBanner(alertBox, 'Email không đúng định dạng.', true);
        return;
      }
      if (password.length < 8) {
        showBanner(alertBox, 'Mật khẩu phải có tối thiểu 8 ký tự.', true);
        return;
      }
      if (password !== passwordConfirm) {
        showBanner(alertBox, 'Mật khẩu xác nhận không khớp.', true);
        return;
      }
      if (agreeTerms && !agreeTerms.checked) {
        showBanner(alertBox, 'Vui lòng đồng ý với cam kết văn hóa UTC2.', true);
        return;
      }

      submitButton.classList.add('is-busy');
      submitButton.disabled = true;
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, role, studentId, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể tạo tài khoản.');

        const users = JSON.parse(localStorage.getItem('utc2_users') || '[]');
        if (Array.isArray(users) && !users.some(user => user.email === email)) {
          users.push(data.user);
          localStorage.setItem('utc2_users', JSON.stringify(users));
        }

        sessionStorage.setItem('utc2-authenticated', 'true');
        sessionStorage.setItem('utc2-user-name', data.user.fullName);
        sessionStorage.setItem('utc2-user-email', data.user.email);
        sessionStorage.setItem('utc2-user-role', data.user.role);
        localStorage.setItem('utc2_currentUser', JSON.stringify(data.user));

        submitButton.classList.remove('is-busy');
        submitButton.classList.add('is-completed');
        if (alertBox) alertBox.classList.add('is-shown', 'is-visible');
        if (alertMessage) alertMessage.textContent = 'Tạo tài khoản thành công!';

        setTimeout(() => {
          triggerCircleReveal(data.user.fullName, 'index.html');
        }, 850);
      } catch (error) {
        submitButton.classList.remove('is-busy');
        submitButton.disabled = false;
        showBanner(alertBox, error.message, true);
      }
    });
  }

  /* Nút Đăng xuất quay lại màn hình đăng nhập */
  if (btnLogoutPortal && homeShowcaseView) {
    btnLogoutPortal.addEventListener('click', function () {
      homeShowcaseView.classList.remove('is-visible');
      mainLayout.style.display = '';
      formSide.classList.remove('is-exiting');
      btnSubmitLogin.classList.remove('is-busy', 'is-completed');
      btnSubmitLogin.disabled = false;
      txtPassword.value = '';
      hideBanner(loginAlertBox);
      clearFieldError(fieldEmail, emailErrorDesc);
      clearFieldError(fieldPassword, pwErrorDesc);
      switchScreen('login');

      document.getElementById('welcomeMeterFill').style.width = '0%';
      setTimeout(() => txtEmail.focus(), 150);
    });
  }

  /* --- 7. GIẢ LẬP ĐĂNG NHẬP EMAIL SINH VIÊN (SSO) --- */
  btnSsoLogin.addEventListener('click', function () {
    alert('Cổng đăng nhập bằng email sinh viên UTC2 (@utc2.edu.vn) chưa được kết nối với máy chủ.');
  });

})();