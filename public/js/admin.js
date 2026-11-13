'use strict';

(() => {
  const state = {
    user: null,
    overview: null,
    bookings: [],
    visits: [],
    machines: [],
    users: []
  };

  const elements = {
    adminName: document.getElementById('admin-name'),
    adminAvatar: document.getElementById('admin-avatar'),
    adminLogout: document.getElementById('admin-logout'),
    todayWeekday: document.getElementById('admin-today-weekday'),
    todayDate: document.getElementById('admin-today-date'),
    statsValues: document.querySelectorAll('#admin-stats-grid .stat-value'),
    tabs: document.querySelectorAll('.admin-tab[data-admin-view]'),
    views: {
      overview: document.getElementById('admin-view-overview'),
      bookings: document.getElementById('admin-view-bookings'),
      visits: document.getElementById('admin-view-visits'),
      machines: document.getElementById('admin-view-machines'),
      users: document.getElementById('admin-view-users')
    },
    overviewBookingsCount: document.getElementById('overview-bookings-count'),
    overviewUpcoming: document.getElementById('overview-upcoming'),
    overviewVisits: document.getElementById('overview-visits'),
    bookingsBody: document.getElementById('admin-bookings-body'),
    bookingsCount: document.getElementById('admin-bookings-count'),
    visitsBody: document.getElementById('admin-visits-body'),
    visitsCount: document.getElementById('admin-visits-count'),
    machinesCount: document.getElementById('admin-machines-count'),
    machineList: document.getElementById('machine-list'),
    machineForm: document.getElementById('machine-form'),
    machineName: document.getElementById('machine-name'),
    machineSubmit: document.getElementById('machine-submit'),
    usersCount: document.getElementById('admin-users-count'),
    userList: document.getElementById('user-list'),
    userForm: document.getElementById('user-form'),
    userName: document.getElementById('new-user-name'),
    username: document.getElementById('new-username'),
    userPassword: document.getElementById('new-user-password'),
    userFormError: document.getElementById('user-form-error'),
    userSubmit: document.getElementById('user-submit')
  };

  function localISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function dateBox(value) {
    let date;
    if (value instanceof Date) {
      date = value;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
      date = new Date(`${value}T12:00:00`);
    } else {
      date = new Date(value);
    }
    if (Number.isNaN(date.getTime())) return { day: '—', month: '' };
    return {
      day: String(date.getDate()).padStart(2, '0'),
      month: date
        .toLocaleDateString('pt-BR', { month: 'short' })
        .replace('.', '')
        .toUpperCase()
    };
  }

  async function init() {
    renderToday();
    wireEvents();

    try {
      const me = await FabLab.api('/api/me');
      if (!me.user || me.user.role !== 'admin') {
        window.location.replace('/app');
        return;
      }

      state.user = me.user;
      elements.adminName.textContent = state.user.name;
      elements.adminAvatar.textContent = FabLab.initials(state.user.name);

      await Promise.all([loadOverview(), loadBookings(), loadVisits(), loadMachines(), loadUsers()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  function renderToday() {
    const now = new Date();
    elements.todayWeekday.textContent = FabLab.capitalize(
      now.toLocaleDateString('pt-BR', { weekday: 'long' })
    );
    elements.todayDate.textContent = now.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Carregamento dos dados                                                 */
  /* ---------------------------------------------------------------------- */

  async function loadOverview() {
    const data = await FabLab.api('/api/admin/overview');
    state.overview = data;
    renderStats();
    renderOverview();
  }

  async function loadBookings() {
    const data = await FabLab.api('/api/admin/bookings');
    state.bookings = data.bookings || [];
    renderBookings();
  }

  async function loadVisits() {
    const data = await FabLab.api('/api/admin/student-visits');
    state.visits = data.visits || [];
    renderVisits();
  }

  async function loadMachines() {
    const data = await FabLab.api('/api/admin/machines');
    state.machines = data.machines || [];
    renderMachines();
  }

  async function loadUsers() {
    const data = await FabLab.api('/api/admin/users');
    state.users = data.users || [];
    renderUsers();
  }

  async function refreshAll() {
    await Promise.all([loadOverview(), loadBookings(), loadVisits(), loadMachines(), loadUsers()]);
  }

  /* ---------------------------------------------------------------------- */
  /* Visão geral                                                            */
  /* ---------------------------------------------------------------------- */

  function renderStats() {
    const stats = (state.overview && state.overview.stats) || {};
    const values = [
      stats.upcomingBookings ?? 0,
      stats.totalStudents ?? 0,
      stats.machines ?? 0,
      stats.users ?? 0
    ];
    elements.statsValues.forEach((element, index) => {
      element.textContent = String(values[index]);
    });
  }

  function renderOverview() {
    const upcoming = (state.overview && state.overview.upcoming) || [];
    const visits = (state.overview && state.overview.recentVisits) || [];

    elements.overviewBookingsCount.textContent = String(
      (state.overview && state.overview.stats ? state.overview.stats.upcomingBookings : 0) || 0
    );

    if (upcoming.length === 0) {
      elements.overviewUpcoming.innerHTML = `
        <div class="empty-state"><strong>Nenhuma reserva futura</strong>Os próximos agendamentos aparecerão aqui.</div>
      `;
    } else {
      elements.overviewUpcoming.innerHTML = upcoming
        .map((booking) => {
          const box = dateBox(booking.date);
          return `
            <div class="overview-row">
              <div class="overview-date"><strong>${box.day}</strong>${box.month}</div>
              <div class="overview-info">
                <strong>${FabLab.escapeHtml(booking.start)}–${FabLab.escapeHtml(booking.end)} • ${FabLab.escapeHtml(
                  FabLab.roomLabel(booking.room)
                )} • ${FabLab.escapeHtml(booking.purpose)}</strong>
                <span>${booking.students} alunos${booking.machineName ? ` • ${FabLab.escapeHtml(booking.machineName)}` : ''} • ${FabLab.escapeHtml(
                  booking.userName
                )}</span>
              </div>
              <span class="tag tag-red">Reserva</span>
            </div>
          `;
        })
        .join('');
    }

    if (visits.length === 0) {
      elements.overviewVisits.innerHTML = `
        <div class="empty-state"><strong>Nenhum envio registrado</strong>Os envios de alunos aparecerão aqui.</div>
      `;
    } else {
      elements.overviewVisits.innerHTML = visits
        .map((visit) => {
          const box = dateBox(visit.createdAt);
          return `
            <div class="overview-row">
              <div class="overview-date"><strong>${box.day}</strong>${box.month}</div>
              <div class="overview-info">
                <strong>${FabLab.escapeHtml(FabLab.roomLabel(visit.room))} • ${FabLab.escapeHtml(visit.purpose)}</strong>
                <span>${visit.students} alunos • ${FabLab.escapeHtml(visit.avgTime)} • ${FabLab.escapeHtml(
                  visit.userName
                )}</span>
              </div>
              <span class="tag">Envio</span>
            </div>
          `;
        })
        .join('');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Agendamentos                                                           */
  /* ---------------------------------------------------------------------- */

  function renderBookings() {
    elements.bookingsCount.textContent = `${state.bookings.length} ${FabLab.pluralize(
      state.bookings.length,
      'reserva',
      'reservas'
    )}`;

    if (state.bookings.length === 0) {
      elements.bookingsBody.innerHTML =
        '<tr><td colspan="8" class="table-empty">Nenhum agendamento cadastrado.</td></tr>';
      return;
    }

    const today = localISODate(new Date());
    const sorted = [...state.bookings].sort((a, b) => {
      const aFuture = a.date >= today;
      const bFuture = b.date >= today;
      if (aFuture !== bFuture) return aFuture ? -1 : 1;
      const keyA = `${a.date} ${a.start}`;
      const keyB = `${b.date} ${b.start}`;
      return aFuture ? keyA.localeCompare(keyB) : keyB.localeCompare(keyA);
    });

    elements.bookingsBody.innerHTML = sorted
      .map((booking) => {
        const isPast = booking.date < today;
        return `
          <tr>
            <td class="cell-time">
              ${FabLab.formatDateBR(booking.date)}
              ${isPast ? '<br><span class="tag">Passado</span>' : ''}
            </td>
            <td class="cell-time"><span class="tag tag-line">${FabLab.escapeHtml(
              booking.start
            )}–${FabLab.escapeHtml(booking.end)}</span></td>
            <td class="cell-strong">${FabLab.escapeHtml(FabLab.roomLabel(booking.room))}</td>
            <td>${booking.students}</td>
            <td>${FabLab.escapeHtml(booking.purpose)}</td>
            <td>${booking.machineName ? FabLab.escapeHtml(booking.machineName) : '<span class="cell-muted">Sem máquina</span>'}</td>
            <td class="cell-muted">${FabLab.escapeHtml(booking.userName)}<br>@${FabLab.escapeHtml(
              booking.userLogin
            )}</td>
            <td class="cell-actions">
              <button type="button" class="btn btn-danger-ghost btn-sm" data-admin-cancel-booking="${FabLab.escapeHtml(
                booking.id
              )}">Cancelar</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  async function adminCancelBooking(id) {
    if (!window.confirm('Cancelar este agendamento? O horário voltará a ficar livre.')) return;
    try {
      await FabLab.api(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      FabLab.toast('Agendamento cancelado.');
      await Promise.all([loadOverview(), loadBookings()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Alunos enviados                                                        */
  /* ---------------------------------------------------------------------- */

  function renderVisits() {
    elements.visitsCount.textContent = `${state.visits.length} ${FabLab.pluralize(
      state.visits.length,
      'registro',
      'registros'
    )}`;

    if (state.visits.length === 0) {
      elements.visitsBody.innerHTML =
        '<tr><td colspan="7" class="table-empty">Nenhum envio de alunos registrado.</td></tr>';
      return;
    }

    elements.visitsBody.innerHTML = state.visits
      .map(
        (visit) => `
          <tr>
            <td class="cell-time">${FabLab.formatDateTime(visit.createdAt)}</td>
            <td class="cell-strong">${FabLab.escapeHtml(FabLab.roomLabel(visit.room))}</td>
            <td><span class="tag tag-red">${FabLab.escapeHtml(visit.purpose)}</span></td>
            <td>${visit.students}</td>
            <td>${FabLab.escapeHtml(visit.avgTime)}</td>
            <td class="cell-muted">${FabLab.escapeHtml(visit.userName)}<br>@${FabLab.escapeHtml(
              visit.userLogin
            )}</td>
            <td class="cell-actions">
              <button type="button" class="btn btn-danger-ghost btn-sm" data-admin-delete-visit="${FabLab.escapeHtml(
                visit.id
              )}">Excluir</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  async function adminDeleteVisit(id) {
    if (!window.confirm('Excluir este registro de envio de alunos?')) return;
    try {
      await FabLab.api(`/api/student-visits/${encodeURIComponent(id)}`, { method: 'DELETE' });
      FabLab.toast('Registro excluído.');
      await Promise.all([loadOverview(), loadVisits()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Máquinas                                                               */
  /* ---------------------------------------------------------------------- */

  function renderMachines() {
    elements.machinesCount.textContent = `${state.machines.length} ${FabLab.pluralize(
      state.machines.length,
      'máquina',
      'máquinas'
    )}`;

    if (state.machines.length === 0) {
      elements.machineList.innerHTML = `
        <div class="empty-state"><strong>Nenhuma máquina cadastrada</strong>Adicione a primeira máquina usando o campo acima.</div>
      `;
      return;
    }

    elements.machineList.innerHTML = state.machines
      .map(
        (machine) => `
          <div class="machine-row" data-machine-row="${FabLab.escapeHtml(machine.id)}">
            <input type="text" value="${FabLab.escapeHtml(machine.name)}" maxlength="80" aria-label="Nome da máquina">
            <div class="machine-actions">
              <button type="button" class="btn btn-outline btn-sm" data-save-machine="${FabLab.escapeHtml(
                machine.id
              )}">Salvar</button>
              <button type="button" class="btn btn-danger-ghost btn-sm" data-remove-machine="${FabLab.escapeHtml(
                machine.id
              )}">Remover</button>
            </div>
          </div>
        `
      )
      .join('');
  }

  async function addMachine(event) {
    event.preventDefault();
    const name = elements.machineName.value.trim();
    if (!name) {
      FabLab.toast('Informe o nome da máquina.', 'error');
      return;
    }

    FabLab.setButtonLoading(elements.machineSubmit, true, 'Adicionando...');
    try {
      await FabLab.api('/api/admin/machines', { method: 'POST', body: { name } });
      elements.machineName.value = '';
      FabLab.toast('Máquina cadastrada.');
      await Promise.all([loadMachines(), loadOverview()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    } finally {
      FabLab.setButtonLoading(elements.machineSubmit, false);
    }
  }

  async function saveMachine(id) {
    const row = elements.machineList.querySelector(`[data-machine-row="${CSS.escape(id)}"]`);
    if (!row) return;
    const input = row.querySelector('input');
    const name = input.value.trim();
    if (!name) {
      FabLab.toast('O nome da máquina não pode ficar vazio.', 'error');
      return;
    }

    const button = row.querySelector('[data-save-machine]');
    FabLab.setButtonLoading(button, true, 'Salvando...');
    try {
      await FabLab.api(`/api/admin/machines/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { name }
      });
      FabLab.toast('Máquina atualizada.');
      await Promise.all([loadMachines(), loadOverview()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
      FabLab.setButtonLoading(button, false);
    }
  }

  async function removeMachine(id) {
    if (!window.confirm('Remover esta máquina? Ela deixará de aparecer nos próximos agendamentos.')) return;
    try {
      await FabLab.api(`/api/admin/machines/${encodeURIComponent(id)}`, { method: 'DELETE' });
      FabLab.toast('Máquina removida.');
      await Promise.all([loadMachines(), loadOverview()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Usuários                                                               */
  /* ---------------------------------------------------------------------- */

  function renderUsers() {
    elements.usersCount.textContent = `${state.users.length} ${FabLab.pluralize(
      state.users.length,
      'usuário',
      'usuários'
    )}`;

    if (state.users.length === 0) {
      elements.userList.innerHTML =
        '<div class="empty-state"><strong>Nenhum usuário</strong>Cadastre a primeira conta de professor.</div>';
      return;
    }

    elements.userList.innerHTML = state.users
      .map(
        (user) => `
          <div class="user-row">
            <span class="avatar">${FabLab.escapeHtml(FabLab.initials(user.name))}</span>
            <div class="user-row-info">
              <div class="user-row-name">${FabLab.escapeHtml(user.name)}</div>
              <div class="user-row-login">@${FabLab.escapeHtml(user.username)} · ${
                user.role === 'admin' ? 'Administrador' : 'Professor'
              }</div>
            </div>
            <span class="tag ${user.role === 'admin' ? 'tag-dark' : 'tag-red'}">${
              user.role === 'admin' ? 'ADMIN' : 'PROFESSOR'
            }</span>
            <button type="button" class="btn btn-outline btn-sm" data-reset-password="${FabLab.escapeHtml(
              user.id
            )}">Senha</button>
            ${
              user.role === 'admin'
                ? ''
                : `<button type="button" class="btn btn-danger-ghost btn-sm" data-delete-user="${FabLab.escapeHtml(
                    user.id
                  )}">Excluir</button>`
            }
          </div>
        `
      )
      .join('');
  }

  async function addUser(event) {
    event.preventDefault();
    FabLab.showFormError(elements.userFormError, '');

    const name = elements.userName.value.trim();
    const username = elements.username.value.trim();
    const password = elements.userPassword.value;

    if (name.length < 2) {
      FabLab.showFormError(elements.userFormError, 'Informe o nome completo do professor.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      FabLab.showFormError(
        elements.userFormError,
        'O usuário deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).'
      );
      return;
    }
    if (password.length < 4) {
      FabLab.showFormError(elements.userFormError, 'A senha deve ter pelo menos 4 caracteres.');
      return;
    }

    FabLab.setButtonLoading(elements.userSubmit, true, 'Cadastrando...');
    try {
      await FabLab.api('/api/admin/users', {
        method: 'POST',
        body: { name, username, password }
      });
      elements.userForm.reset();
      FabLab.toast('Usuário cadastrado com sucesso.');
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.showFormError(elements.userFormError, error.message);
    } finally {
      FabLab.setButtonLoading(elements.userSubmit, false);
    }
  }

  async function resetPassword(id) {
    const user = state.users.find((item) => item.id === id);
    if (!user) return;

    const password = window.prompt(`Defina a nova senha para ${user.name} (@${user.username}):`);
    if (password === null) return;
    if (password.length < 4) {
      FabLab.toast('A nova senha deve ter pelo menos 4 caracteres.', 'error');
      return;
    }
    const confirmation = window.prompt('Repita a nova senha para confirmar:');
    if (confirmation === null) return;
    if (password !== confirmation) {
      FabLab.toast('As senhas informadas não coincidem.', 'error');
      return;
    }

    try {
      await FabLab.api(`/api/admin/users/${encodeURIComponent(id)}/password`, {
        method: 'PATCH',
        body: { password }
      });
      FabLab.toast(`Senha de ${user.name} redefinida.`);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Excluir esta conta de professor?')) return;
    try {
      await FabLab.api(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      FabLab.toast('Usuário excluído.');
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.replace('/admin');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Navegação e eventos                                                    */
  /* ---------------------------------------------------------------------- */

  function switchView(view) {
    elements.tabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.adminView === view);
    });
    Object.entries(elements.views).forEach(([key, section]) => {
      section.hidden = key !== view;
    });
  }

  function wireEvents() {
    elements.tabs.forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.adminView));
    });

    elements.adminLogout.addEventListener('click', async () => {
      try {
        await FabLab.api('/api/logout', { method: 'POST' });
      } finally {
        window.location.replace('/admin');
      }
    });

    elements.bookingsBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-cancel-booking]');
      if (button) adminCancelBooking(button.dataset.adminCancelBooking);
    });

    elements.visitsBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-admin-delete-visit]');
      if (button) adminDeleteVisit(button.dataset.adminDeleteVisit);
    });

    elements.machineForm.addEventListener('submit', addMachine);

    elements.machineList.addEventListener('click', (event) => {
      const save = event.target.closest('[data-save-machine]');
      if (save) {
        saveMachine(save.dataset.saveMachine);
        return;
      }
      const remove = event.target.closest('[data-remove-machine]');
      if (remove) removeMachine(remove.dataset.removeMachine);
    });

    elements.machineList.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.matches('input')) {
        event.preventDefault();
        const row = event.target.closest('[data-machine-row]');
        if (row) saveMachine(row.dataset.machineRow);
      }
    });

    elements.userForm.addEventListener('submit', addUser);

    elements.userList.addEventListener('click', (event) => {
      const reset = event.target.closest('[data-reset-password]');
      if (reset) {
        resetPassword(reset.dataset.resetPassword);
        return;
      }
      const button = event.target.closest('[data-delete-user]');
      if (button) deleteUser(button.dataset.deleteUser);
    });
  }

  init();
})();
