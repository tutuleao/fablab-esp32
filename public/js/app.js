'use strict';

(() => {
  const state = {
    user: null,
    config: null,
    rooms: [],
    machines: [],
    weeks: [],
    availability: {},
    selectedWeek: 0,
    bookings: [],
    visits: [],
    selection: { date: null, dayKey: null, slots: [] },
    pendingSelection: null,
    activeView: 'agenda'
  };

  const elements = {
    greetingName: document.getElementById('greeting-name'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    adminLink: document.getElementById('admin-link'),
    logout: document.getElementById('logout'),
    todayWeekday: document.getElementById('today-weekday'),
    todayDate: document.getElementById('today-date'),
    weekTabs: document.getElementById('week-tabs'),
    weekTitle: document.getElementById('week-title'),
    weekSubtitle: document.getElementById('week-subtitle'),
    scheduleTable: document.getElementById('schedule-table'),
    selectionBar: document.getElementById('selection-bar'),
    selectionTitle: document.getElementById('selection-title'),
    selectionDetail: document.getElementById('selection-detail'),
    clearSelection: document.getElementById('clear-selection'),
    bookSelection: document.getElementById('book-selection'),
    weekBookings: document.getElementById('week-bookings'),
    weekBookingsCount: document.getElementById('week-bookings-count'),
    visitsBody: document.getElementById('visits-table-body'),
    statsValues: document.querySelectorAll('#stats-grid .stat-value'),
    navButtons: document.querySelectorAll('.nav-btn[data-view]'),
    viewAgenda: document.getElementById('view-agenda'),
    viewAlunos: document.getElementById('view-alunos'),
    openStudentAgenda: document.getElementById('open-student-modal-agenda'),
    openStudent: document.getElementById('open-student-modal'),
    bookingModal: document.getElementById('booking-modal'),
    bookingForm: document.getElementById('booking-form'),
    bookingSummary: document.getElementById('booking-summary'),
    bookingRoom: document.getElementById('booking-room'),
    bookingStudents: document.getElementById('booking-students'),
    bookingPurpose: document.getElementById('booking-purpose'),
    bookingMachine: document.getElementById('booking-machine'),
    bookingError: document.getElementById('booking-error'),
    bookingSubmit: document.getElementById('booking-submit'),
    studentModal: document.getElementById('student-modal'),
    studentForm: document.getElementById('student-form'),
    visitRoom: document.getElementById('visit-room'),
    visitPurpose: document.getElementById('visit-purpose'),
    visitStudents: document.getElementById('visit-students'),
    visitAvgTime: document.getElementById('visit-avg-time'),
    visitError: document.getElementById('visit-error'),
    studentSubmit: document.getElementById('student-submit')
  };

  /* ---------------------------------------------------------------------- */
  /* Inicialização                                                          */
  /* ---------------------------------------------------------------------- */

  async function init() {
    wireEvents();
    renderToday();

    try {
      const me = await FabLab.api('/api/me');
      state.user = me.user;

      const config = await FabLab.api('/api/config');
      state.config = config;
      state.rooms = FabLab.sortRooms(config.rooms);
      state.machines = config.machines || [];
      state.weeks = config.weeks || [];
      state.availability = config.availability || {};

      renderUser();
      fillRoomSelects();
      fillMachineSelect();
      fillAvgTimeSelect();
      renderWeekTabs();

      const firstAvailable = state.weeks.findIndex(weekHasFutureSlots);
      await loadWeek(firstAvailable >= 0 ? firstAvailable : 0);
      await loadVisits();
      updateStats();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.toast(error.message, 'error');
      elements.weekSubtitle.textContent = 'Não foi possível carregar a agenda. Atualize a página.';
    }
  }

  function renderUser() {
    if (!state.user) return;
    elements.userName.textContent = state.user.name;
    elements.greetingName.textContent = FabLab.firstName(state.user.name);
    elements.userAvatar.textContent = FabLab.initials(state.user.name);
    elements.adminLink.hidden = state.user.role !== 'admin';
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
  /* Semanas e selects                                                      */
  /* ---------------------------------------------------------------------- */

  function renderWeekTabs() {
    elements.weekTabs.innerHTML = state.weeks
      .map((week) => {
        const active = week.index === state.selectedWeek;
        return `
          <button type="button" class="week-tab ${active ? 'is-active' : ''}"
            data-week-index="${week.index}" role="tab" aria-selected="${active}">
            <strong>${FabLab.escapeHtml(week.label)}</strong>
            <small>${FabLab.formatDateShort(week.start)} – ${FabLab.formatDateShort(week.end)}</small>
          </button>
        `;
      })
      .join('');
  }

  function fillRoomSelects() {
    const options = [
      '<option value="">Selecione a turma</option>',
      ...state.rooms.map(
        (room) => `<option value="${FabLab.escapeHtml(room)}">${FabLab.escapeHtml(FabLab.roomLabel(room))}</option>`
      )
    ].join('');

    elements.bookingRoom.innerHTML = options;
    elements.visitRoom.innerHTML = options;
  }

  function fillMachineSelect() {
    elements.bookingMachine.innerHTML = [
      '<option value="">Não precisa</option>',
      ...state.machines.map(
        (machine) => `<option value="${FabLab.escapeHtml(machine.id)}">${FabLab.escapeHtml(machine.name)}</option>`
      )
    ].join('');
  }

  function fillAvgTimeSelect() {
    const times = (state.config && state.config.avgTimes) || [];
    elements.visitAvgTime.innerHTML = times
      .map((time) => `<option value="${FabLab.escapeHtml(time)}">${FabLab.escapeHtml(time)}</option>`)
      .join('');
  }

  async function loadWeek(index) {
    const week = state.weeks[index];
    if (!week) return;

    state.selectedWeek = index;
    state.selection = { date: null, dayKey: null, slots: [] };
    renderWeekTabs();
    updateWeekHeading(week);
    elements.weekSubtitle.textContent = 'Carregando horários...';

    try {
      const data = await FabLab.api(`/api/bookings?week=${encodeURIComponent(week.start)}`);
      state.bookings = data.bookings || [];
      updateWeekHeading(week);
      renderSchedule();
      renderWeekBookings();
      updateStats();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.toast(error.message, 'error');
      elements.weekSubtitle.textContent = 'Não foi possível carregar os horários desta semana.';
    }
  }

  function updateWeekHeading(week) {
    elements.weekTitle.textContent = `Agenda • ${week.label}`;
    elements.weekSubtitle.textContent = `${FabLab.formatDateBR(week.start)} a ${FabLab.formatDateBR(week.end)} • manhã em blocos de 50 min a partir das 07:00`;
  }

  /* ---------------------------------------------------------------------- */
  /* Grade de horários                                                      */
  /* ---------------------------------------------------------------------- */

  function timeToMinutes(value) {
    const [hours, minutes] = String(value).split(':').map(Number);
    return hours * 60 + minutes;
  }

  function slotIsPast(day, slot) {
    if (day.past) return true;
    const today = state.config.today;
    if (day.date < today) return true;
    if (day.date > today) return false;
    const now = new Date();
    return timeToMinutes(slot.start) <= now.getHours() * 60 + now.getMinutes();
  }

  function weekHasFutureSlots(week) {
    return week.days.some((day) =>
      (state.availability[day.key] ? state.availability[day.key].slots : []).some(
        (slot) => !slotIsPast(day, slot)
      )
    );
  }

  function isContiguous(slots) {
    for (let index = 1; index < slots.length; index += 1) {
      if (slots[index - 1].end !== slots[index].start) return false;
    }
    return true;
  }

  function bookingAt(date, start) {
    return state.bookings.find(
      (booking) => booking.date === date && booking.slots.some((slot) => slot.start === start)
    );
  }

  function renderSchedule() {
    const week = state.weeks[state.selectedWeek];
    if (!week) return;

    const days = week.days;
    const thead = elements.scheduleTable.querySelector('thead');
    const tbody = elements.scheduleTable.querySelector('tbody');

    thead.innerHTML = `
      <tr>
        <th>Horário</th>
        ${days
          .map(
            (day) => `
              <th class="${day.date === state.config.today ? 'is-today' : ''}"
                  title="${FabLab.escapeHtml(day.label)} — ${FabLab.formatDateBR(day.date)}">
                <strong>${FabLab.escapeHtml(day.short)}</strong>
                <small>${FabLab.formatDateShort(day.date)}</small>
              </th>
            `
          )
          .join('')}
      </tr>
    `;

    const rowMap = new Map();
    for (const day of days) {
      const dayConfig = state.availability[day.key];
      if (!dayConfig) continue;
      for (const slot of dayConfig.slots) {
        if (!rowMap.has(slot.start)) rowMap.set(slot.start, slot.end);
      }
    }

    // Linhas de intervalo (20 min). Só aparecem nos dias em que o intervalo
    // realmente cai dentro de um turno de funcionamento.
    const breakRows = new Map();
    const breaks = (state.config && state.config.breaks) || [];
    for (const item of breaks) {
      const breakStart = timeToMinutes(item.start);
      const breakEnd = timeToMinutes(item.end);
      const applies = days.some((day) => {
        const dayConfig = state.availability[day.key];
        if (!dayConfig || !Array.isArray(dayConfig.windows)) return false;
        return dayConfig.windows.some(
          ([windowStart, windowEnd]) =>
            timeToMinutes(windowStart) < breakEnd && breakStart < timeToMinutes(windowEnd)
        );
      });
      if (applies) breakRows.set(item.start, item.end);
    }

    const rowStarts = [...new Set([...rowMap.keys(), ...breakRows.keys()])].sort(
      (a, b) => timeToMinutes(a) - timeToMinutes(b)
    );

    if (rowStarts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${days.length + 1}" class="table-empty">Nenhum horário disponível nesta semana.</td></tr>`;
      return;
    }

    tbody.innerHTML = rowStarts
      .map((start) => {
        if (breakRows.has(start)) {
          const breakEnd = breakRows.get(start);
          return `
            <tr class="break-row">
              <td>${start} – ${breakEnd}</td>
              <td class="break-cell" colspan="${days.length}">
                <span class="break-tag">Intervalo de 20 min</span>
              </td>
            </tr>
          `;
        }

        const end = rowMap.get(start);
        const cells = days
          .map((day) => {
            const dayConfig = state.availability[day.key];
            const slot = dayConfig && dayConfig.slots.find((item) => item.start === start);
            if (!slot) {
              return '<td><button type="button" class="slot-btn is-empty" disabled aria-label="Sem horário">—</button></td>';
            }

            const booking = bookingAt(day.date, start);
            if (booking) {
              const isOwn = booking.userId === state.user.id;
              const title = `${FabLab.roomLabel(booking.room)} • ${booking.purpose} • ${booking.students} alunos${
                booking.machineName ? ` • ${booking.machineName}` : ''
              } • ${booking.userName}`;
              return `
                <td>
                  <button type="button" class="slot-btn is-booked ${isOwn ? 'is-own' : ''}"
                    data-show-booking="${FabLab.escapeHtml(booking.id)}"
                    title="${FabLab.escapeHtml(title)}">
                    Ocupado<small>${FabLab.escapeHtml(FabLab.roomLabel(booking.room))}</small>
                  </button>
                </td>
              `;
            }

            if (day.past || slotIsPast(day, slot)) {
              return '<td><button type="button" class="slot-btn is-past" disabled aria-label="Horário encerrado">Encerrado</button></td>';
            }

            const selected =
              state.selection.date === day.date &&
              state.selection.slots.some((item) => item.start === start);

            return `
              <td>
                <button type="button" class="slot-btn ${selected ? 'is-selected' : ''}"
                  data-date="${FabLab.escapeHtml(day.date)}"
                  data-day-key="${FabLab.escapeHtml(day.key)}"
                  data-start="${FabLab.escapeHtml(slot.start)}"
                  data-end="${FabLab.escapeHtml(slot.end)}"
                  data-minutes="${FabLab.escapeHtml(slot.minutes)}"
                  aria-pressed="${selected}">
                  ${selected ? 'Selecionado' : 'Livre'}<small>${FabLab.escapeHtml(slot.minutes)} min</small>
                </button>
              </td>
            `;
          })
          .join('');

        return `<tr><td>${start} – ${end}</td>${cells}</tr>`;
      })
      .join('');

    renderSelectionBar();
  }

  function handleSlotClick(button) {
    const date = button.dataset.date;
    const dayKey = button.dataset.dayKey;
    const start = button.dataset.start;
    const end = button.dataset.end;
    const minutes = Number(button.dataset.minutes) || 50;
    if (!date || !start || !end) return;

    if (state.selection.date && state.selection.date !== date) {
      state.selection = { date, dayKey, slots: [] };
    }
    if (!state.selection.date) {
      state.selection = { date, dayKey, slots: [] };
    }

    const index = state.selection.slots.findIndex((slot) => slot.start === start);
    if (index >= 0) {
      state.selection.slots.splice(index, 1);
    } else {
      state.selection.slots.push({ start, end, minutes });
    }

    state.selection.slots.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    if (state.selection.slots.length === 0) {
      state.selection = { date: null, dayKey: null, slots: [] };
    }

    renderSchedule();
    renderSelectionBar();
  }

  function renderSelectionBar() {
    const selection = state.selection;
    const hasSelection = selection.slots.length > 0;

    elements.selectionBar.hidden = !hasSelection;
    if (!hasSelection) return;

    const week = state.weeks[state.selectedWeek];
    const day = week.days.find((item) => item.date === selection.date);
    const contiguous = isContiguous(selection.slots);
    const first = selection.slots[0];
    const last = selection.slots[selection.slots.length - 1];
    const totalMinutes = selection.slots.reduce((sum, slot) => sum + (slot.minutes || 50), 0);

    elements.selectionTitle.textContent = `${day ? day.label : 'Dia'}, ${FabLab.formatDateBR(selection.date)}`;
    elements.selectionDetail.classList.toggle('is-warning', !contiguous);
    elements.selectionDetail.textContent = contiguous
      ? `${first.start} – ${last.end} • ${selection.slots.length} ${FabLab.pluralize(
          selection.slots.length,
          'bloco',
          'blocos'
        )} (${FabLab.durationLabel(totalMinutes)})`
      : 'Selecione tempos consecutivos para formar um único bloco de reserva.';

    elements.bookSelection.disabled = !contiguous;
  }

  function clearSelection() {
    state.selection = { date: null, dayKey: null, slots: [] };
    renderSchedule();
    renderSelectionBar();
  }

  /* ---------------------------------------------------------------------- */
  /* Reservas                                                               */
  /* ---------------------------------------------------------------------- */

  function renderWeekBookings() {
    const week = state.weeks[state.selectedWeek];
    const bookings = state.bookings;
    elements.weekBookingsCount.textContent = String(bookings.length);

    if (!week || bookings.length === 0) {
      elements.weekBookings.innerHTML = `
        <div class="empty-state">
          <strong>Nenhum horário agendado</strong>
          Selecione um tempo livre na grade para reservar o Fab Lab.
        </div>
      `;
      return;
    }

    elements.weekBookings.innerHTML = bookings
      .map((booking) => {
        const day = week.days.find((item) => item.date === booking.date);
        const isOwn = booking.userId === state.user.id;
        return `
          <article class="booking-item ${isOwn ? 'is-own' : ''}">
            <div class="b-top">
              <div>
                <div class="b-time">${FabLab.escapeHtml(day ? day.short : '')} ${FabLab.formatDateShort(
                  booking.date
                )} • ${FabLab.escapeHtml(booking.start)}–${FabLab.escapeHtml(booking.end)}</div>
                <div class="b-title">${FabLab.escapeHtml(FabLab.roomLabel(booking.room))} • ${FabLab.escapeHtml(
                  booking.purpose
                )}</div>
              </div>
              ${isOwn ? '<span class="tag tag-red">Sua reserva</span>' : ''}
            </div>
            <div class="b-meta">
              ${booking.students} ${FabLab.pluralize(booking.students, 'aluno', 'alunos')}
              ${booking.machineName ? ` • ${FabLab.escapeHtml(booking.machineName)}` : ' • Sem máquina'}<br>
              Solicitado por ${FabLab.escapeHtml(booking.userName)}
            </div>
            ${
              isOwn
                ? `<div class="b-actions">
                    <button type="button" class="btn btn-danger-ghost btn-sm" data-cancel-booking="${FabLab.escapeHtml(
                      booking.id
                    )}">Cancelar</button>
                  </div>`
                : ''
            }
          </article>
        `;
      })
      .join('');
  }

  function openBookingModal() {
    if (!state.selection.date || state.selection.slots.length === 0) return;
    if (!isContiguous(state.selection.slots)) {
      FabLab.toast('Selecione tempos consecutivos para agendar.', 'error');
      return;
    }

    const week = state.weeks[state.selectedWeek];
    const day = week.days.find((item) => item.date === state.selection.date);
    const first = state.selection.slots[0];
    const last = state.selection.slots[state.selection.slots.length - 1];
    const totalMinutes = state.selection.slots.reduce((sum, slot) => sum + (slot.minutes || 50), 0);

    state.pendingSelection = {
      date: state.selection.date,
      dayKey: state.selection.dayKey,
      slots: state.selection.slots.map((slot) => ({ ...slot }))
    };

    elements.bookingSummary.innerHTML = `
      <strong>${FabLab.escapeHtml(day ? day.label : 'Dia')}, ${FabLab.formatDateBR(
        state.selection.date
      )}</strong><br>
      ${FabLab.escapeHtml(first.start)} – ${FabLab.escapeHtml(last.end)} •
      ${state.selection.slots.length} ${FabLab.pluralize(
        state.selection.slots.length,
        'bloco',
        'blocos'
      )} (${FabLab.durationLabel(totalMinutes)})
    `;

    elements.bookingRoom.value = '';
    elements.bookingStudents.value = '';
    elements.bookingPurpose.value = '';
    elements.bookingMachine.value = '';
    FabLab.showFormError(elements.bookingError, '');
    FabLab.openDialog(elements.bookingModal);
    document.body.classList.add('no-scroll');
    setTimeout(() => elements.bookingRoom.focus(), 80);
  }

  async function submitBooking(event) {
    event.preventDefault();
    FabLab.showFormError(elements.bookingError, '');

    const selection = state.pendingSelection;
    if (!selection || selection.slots.length === 0) {
      FabLab.showFormError(elements.bookingError, 'Selecione um horário na grade antes de confirmar.');
      return;
    }

    const room = elements.bookingRoom.value;
    const students = Number(elements.bookingStudents.value);
    const purpose = elements.bookingPurpose.value.trim();
    const machineId = elements.bookingMachine.value;

    if (!room) {
      FabLab.showFormError(elements.bookingError, 'Selecione a turma que usará o Fab Lab.');
      return;
    }
    if (!Number.isInteger(students) || students < 1 || students > 80) {
      FabLab.showFormError(elements.bookingError, 'Informe uma quantidade de alunos entre 1 e 80.');
      return;
    }
    if (purpose.length < 3) {
      FabLab.showFormError(elements.bookingError, 'Descreva o motivo do agendamento.');
      return;
    }

    FabLab.setButtonLoading(elements.bookingSubmit, true, 'Agendando...');

    try {
      await FabLab.api('/api/bookings', {
        method: 'POST',
        body: {
          date: selection.date,
          slots: selection.slots,
          room,
          students,
          purpose,
          machineId
        }
      });

      FabLab.closeDialog(elements.bookingModal);
      document.body.classList.remove('no-scroll');
      FabLab.toast('Agendamento confirmado com sucesso.');
      state.pendingSelection = null;
      state.selection = { date: null, dayKey: null, slots: [] };
      await loadWeek(state.selectedWeek);
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.showFormError(elements.bookingError, error.message);
      if (error.status === 409) {
        FabLab.toast('A agenda foi atualizada porque um horário foi ocupado.', 'error');
        FabLab.closeDialog(elements.bookingModal);
        document.body.classList.remove('no-scroll');
        state.pendingSelection = null;
        await loadWeek(state.selectedWeek);
      }
    } finally {
      FabLab.setButtonLoading(elements.bookingSubmit, false);
    }
  }

  async function cancelBooking(id) {
    if (!window.confirm('Deseja cancelar este agendamento?')) return;
    try {
      await FabLab.api(`/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
      FabLab.toast('Agendamento cancelado.');
      await loadWeek(state.selectedWeek);
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Alunos enviados                                                        */
  /* ---------------------------------------------------------------------- */

  async function loadVisits() {
    try {
      const data = await FabLab.api('/api/student-visits');
      state.visits = data.visits || [];
      renderVisits();
      updateStats();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  function renderVisits() {
    if (!state.visits.length) {
      elements.visitsBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty">
            Nenhum aluno enviado ainda. Use o botão “+ Adicionar aluno” para registrar o primeiro envio.
          </td>
        </tr>
      `;
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
            <td class="cell-muted">${FabLab.escapeHtml(visit.userName)}</td>
            <td class="cell-actions">
              <button type="button" class="btn btn-danger-ghost btn-sm" data-delete-visit="${FabLab.escapeHtml(
                visit.id
              )}">Excluir</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  function openStudentModal() {
    elements.visitRoom.value = '';
    elements.visitPurpose.value = '';
    elements.visitStudents.value = '';
    elements.visitAvgTime.value = (state.config && state.config.avgTimes && state.config.avgTimes[0]) || '';
    FabLab.showFormError(elements.visitError, '');
    FabLab.openDialog(elements.studentModal);
    document.body.classList.add('no-scroll');
    setTimeout(() => elements.visitRoom.focus(), 80);
  }

  async function submitStudent(event) {
    event.preventDefault();
    FabLab.showFormError(elements.visitError, '');

    const room = elements.visitRoom.value;
    const purpose = elements.visitPurpose.value.trim();
    const students = Number(elements.visitStudents.value);
    const avgTime = elements.visitAvgTime.value;

    if (!room) {
      FabLab.showFormError(elements.visitError, 'Selecione a sala da turma.');
      return;
    }
    if (purpose.length < 2) {
      FabLab.showFormError(elements.visitError, 'Informe o propósito do envio (projeto ou pesquisa).');
      return;
    }
    if (!Number.isInteger(students) || students < 1 || students > 80) {
      FabLab.showFormError(elements.visitError, 'Informe uma quantidade de alunos entre 1 e 80.');
      return;
    }
    if (!avgTime) {
      FabLab.showFormError(elements.visitError, 'Selecione o tempo médio de permanência.');
      return;
    }

    FabLab.setButtonLoading(elements.studentSubmit, true, 'Enviando...');

    try {
      await FabLab.api('/api/student-visits', {
        method: 'POST',
        body: { room, purpose, students, avgTime }
      });
      FabLab.closeDialog(elements.studentModal);
      document.body.classList.remove('no-scroll');
      FabLab.toast('Alunos enviados e registrados com sucesso.');
      await loadVisits();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.showFormError(elements.visitError, error.message);
    } finally {
      FabLab.setButtonLoading(elements.studentSubmit, false);
    }
  }

  async function deleteVisit(id) {
    if (!window.confirm('Deseja excluir este registro de envio de alunos?')) return;
    try {
      await FabLab.api(`/api/student-visits/${encodeURIComponent(id)}`, { method: 'DELETE' });
      FabLab.toast('Registro excluído.');
      await loadVisits();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace('/');
        return;
      }
      FabLab.toast(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Estatísticas e navegação                                               */
  /* ---------------------------------------------------------------------- */

  function updateStats() {
    const weekBookings = state.bookings.length;
    const studentsSent = state.visits.reduce((sum, visit) => sum + Number(visit.students || 0), 0);
    const studentsScheduled = state.bookings.reduce(
      (sum, booking) => sum + Number(booking.students || 0),
      0
    );

    const values = [weekBookings, studentsSent, studentsScheduled, state.machines.length];
    elements.statsValues.forEach((element, index) => {
      element.textContent = String(values[index] ?? 0);
    });
  }

  function switchView(view) {
    state.activeView = view;
    elements.navButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
    elements.viewAgenda.hidden = view !== 'agenda';
    elements.viewAlunos.hidden = view !== 'alunos';
    if (view === 'alunos' && state.visits.length === 0) loadVisits();
  }

  /* ---------------------------------------------------------------------- */
  /* Eventos                                                                */
  /* ---------------------------------------------------------------------- */

  function wireEvents() {
    FabLab.wireDialogClose(elements.bookingModal);
    FabLab.wireDialogClose(elements.studentModal);

    elements.bookingModal.addEventListener('close', () => {
      elements.bookingForm.reset();
      FabLab.setButtonLoading(elements.bookingSubmit, false);
      document.body.classList.remove('no-scroll');
    });

    elements.studentModal.addEventListener('close', () => {
      elements.studentForm.reset();
      FabLab.setButtonLoading(elements.studentSubmit, false);
      document.body.classList.remove('no-scroll');
    });

    elements.weekTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-week-index]');
      if (!button) return;
      const index = Number(button.dataset.weekIndex);
      if (Number.isInteger(index) && index !== state.selectedWeek) loadWeek(index);
    });

    elements.scheduleTable.querySelector('tbody').addEventListener('click', (event) => {
      const bookingButton = event.target.closest('[data-show-booking]');
      if (bookingButton) {
        const booking = state.bookings.find((item) => item.id === bookingButton.dataset.showBooking);
        if (booking) {
          FabLab.toast(
            `${FabLab.roomLabel(booking.room)} • ${booking.purpose} • ${booking.students} alunos${
              booking.machineName ? ` • ${booking.machineName}` : ''
            } • ${booking.userName}`
          );
        }
        return;
      }

      const slotButton = event.target.closest('.slot-btn[data-date]');
      if (slotButton) handleSlotClick(slotButton);
    });

    elements.clearSelection.addEventListener('click', clearSelection);
    elements.bookSelection.addEventListener('click', openBookingModal);
    elements.bookingForm.addEventListener('submit', submitBooking);
    elements.studentForm.addEventListener('submit', submitStudent);

    elements.openStudentAgenda.addEventListener('click', openStudentModal);
    elements.openStudent.addEventListener('click', openStudentModal);

    elements.weekBookings.addEventListener('click', (event) => {
      const button = event.target.closest('[data-cancel-booking]');
      if (button) cancelBooking(button.dataset.cancelBooking);
    });

    elements.visitsBody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-visit]');
      if (button) deleteVisit(button.dataset.deleteVisit);
    });

    elements.navButtons.forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });

    elements.logout.addEventListener('click', async () => {
      try {
        await FabLab.api('/api/logout', { method: 'POST' });
      } finally {
        window.location.replace('/');
      }
    });
  }

  init();
})();
