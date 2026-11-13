'use strict';

(() => {
  const form = document.getElementById('login-form');
  const username = document.getElementById('username');
  const password = document.getElementById('password');
  const errorBox = document.getElementById('login-error');
  const submit = document.getElementById('login-submit');
  const toggle = document.getElementById('toggle-password');

  FabLab.api('/api/session')
    .then((data) => {
      if (data && data.user) window.location.replace('/app');
    })
    .catch(() => {
      // Visitante ainda não autenticado: permanece na tela de login.
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
      FabLab.showFormError(errorBox, 'Informe o usuário e a senha para entrar.');
      return;
    }

    FabLab.setButtonLoading(submit, true, 'Entrando...');

    try {
      const data = await FabLab.api('/api/login', {
        method: 'POST',
        body: {
          username: username.value.trim(),
          password: password.value
        }
      });
      window.location.replace(data.redirect || '/app');
    } catch (error) {
      FabLab.showFormError(errorBox, error.message);
      FabLab.setButtonLoading(submit, false);
      password.focus();
      password.select();
    }
  });
})();
