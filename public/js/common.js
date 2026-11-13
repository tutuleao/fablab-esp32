'use strict';

const FabLab = (() => {
  let toastTimer = null;

  async function api(path, options = {}) {
    const config = {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {})
      }
    };

    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }

    let response;
    try {
      response = await fetch(path, config);
    } catch {
      throw new Error('Não foi possível conectar ao servidor. Verifique se ele está em execução.');
    }

    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text().catch(() => '');
    }

    if (!response.ok) {
      const error = new Error((data && data.error) || 'Não foi possível concluir a operação.');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  function formatDateBR(value) {
    const date = value instanceof Date ? value : parseISODate(value);
    if (!date) return '—';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatDateShort(value) {
    const date = value instanceof Date ? value : parseISODate(value);
    if (!date) return '—';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function formatDateLong(value) {
    const date = value instanceof Date ? value : parseISODate(value);
    if (!date) return '—';
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    });
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function capitalize(value) {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function initials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'Professor(a)';
  }

  function roomLabel(room) {
    const value = String(room || '').toUpperCase();
    const match = value.match(/^(\d)([A-C])$/);
    return match ? `${match[1]}º ${match[2]}` : value;
  }

  const roomOrder = ['6A', '6B', '6C', '7A', '7B', '7C', '8A', '8B', '8C', '9A', '9B', '9C', '1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C'];

  function sortRooms(rooms) {
    return [...rooms].sort((a, b) => {
      const indexA = roomOrder.indexOf(a);
      const indexB = roomOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  function toast(message, type = 'success') {
    const element = document.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', type === 'error');
    element.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      element.classList.remove('show');
    }, 4200);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function wireDialogClose(dialog) {
    if (!dialog) return;
    dialog.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => closeDialog(dialog));
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('no-scroll');
    });
  }

  function showFormError(element, message) {
    if (!element) return;
    if (!message) {
      element.hidden = true;
      element.textContent = '';
      return;
    }
    element.textContent = message;
    element.hidden = false;
  }

  function setButtonLoading(button, loading, loadingText = 'Aguarde...') {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="btn-loader" aria-hidden="true"></span> ${escapeHtml(loadingText)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }

  function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural;
  }

  function durationLabel(totalMinutes) {
    const minutes = Number(totalMinutes) || 0;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${minutes} min`;
    if (rest === 0) return `${hours}h`;
    return `${hours}h${String(rest).padStart(2, '0')}`;
  }

  return {
    api,
    escapeHtml,
    formatDateBR,
    formatDateShort,
    formatDateLong,
    formatDateTime,
    capitalize,
    initials,
    firstName,
    roomLabel,
    sortRooms,
    toast,
    openDialog,
    closeDialog,
    wireDialogClose,
    showFormError,
    setButtonLoading,
    pluralize,
    durationLabel
  };
})();
