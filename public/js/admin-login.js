'use strict';

(() => {
  const form = document.getElementById('admin-login-form');
  const username = document.getElementById('admin-username');
  const password = document.getElementById('admin-password');
  const errorBox = document.getElementById('admin-login-error');
  const submit = document.getElementById('admin-login-submit');
  const toggle = document.getElementById('admin-toggle-password');

  FabLab.api('/api/session')
    .then((data) => {
      if (data && data.user && data.user.role === 'admin') {
        window.location.replace('/admin/dashboard');
      }
    })
    .catch(() => {
      // Permanece na tela de login administrativo.
    });

  toggle.addEventListener('click', () => {
    const showing = password.type === 'text';
    password.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? 'Mostrar' : 'Ocultar';
    toggle.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    FabLab.showFormError(errorBox, '');

    if (!username.value.trim() || !password.value) {
      FabLab.showFormError(errorBox, 'Informe o usuário e a senha administrativa.');
      return;
    }

    FabLab.setButtonLoading(submit, true, 'Entrando...');

    try {
      const data = await FabLab.api('/api/admin/login', {
        method: 'POST',
        body: {
          username: username.value.trim(),
          password: password.value
        }
      });
      window.location.replace(data.redirect || '/admin/dashboard');
    } catch (error) {
      FabLab.showFormError(errorBox, error.message);
      FabLab.setButtonLoading(submit, false);
      password.focus();
      password.select();
    }
  });
})();
