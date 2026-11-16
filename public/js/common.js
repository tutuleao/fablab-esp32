'use strict';

const FabLab = (() => {
  let audioContext = null;

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

  function ensureToastStack() {
    let stack = document.getElementById('toast-stack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stack);
    return stack;
  }

  // Som curto gerado no navegador (sem arquivo de áudio).
  function playSound(kind) {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }

      let notes;
      let volume;
      let length;

      if (kind === 'error') {
        notes = [{ frequency: 329.63, at: 0 }, { frequency: 220, at: 0.12 }];
        volume = 0.035;
        length = 0.16;
      } else if (kind === 'open') {
        notes = [{ frequency: 523.25, at: 0 }, { frequency: 783.99, at: 0.065 }];
        volume = 0.022;
        length = 0.1;
      } else {
        notes = [{ frequency: 659.25, at: 0 }, { frequency: 987.77, at: 0.095 }];
        volume = 0.035;
        length = 0.16;
      }

      const start = audioContext.currentTime + 0.02;

      for (const note of notes) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, start + note.at);
        gain.gain.setValueAtTime(0.0001, start + note.at);
        gain.gain.exponentialRampToValueAtTime(volume, start + note.at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + length);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start + note.at);
        oscillator.stop(start + note.at + length + 0.02);
      }
    } catch {
      // O som é um extra: se o navegador bloquear, a notificação continua.
    }
  }

  // Navegadores só liberam áudio depois de uma interação do usuário.
  function primeAudio() {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
    } catch {
      // Sem áudio: o restante da interface continua funcionando.
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', primeAudio, { once: true, passive: true });
    document.addEventListener('keydown', primeAudio, { once: true });
  }

  // Libera o áudio a partir de um clique (usado pelo painel do administrador).
  function unlockSound() {
    primeAudio();
  }

  function isSoundReady() {
    return Boolean(audioContext && audioContext.state === 'running');
  }

  function dismissToast(element) {
    if (!element || element.dataset.leaving === '1') return;
    element.dataset.leaving = '1';
    clearTimeout(element.toastTimer);
    element.classList.remove('is-visible');
    element.classList.remove('show');
    element.classList.add('is-leave');
    const remove = () => element.remove();
    element.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 450);
  }

  function toast(message, type = 'success', options = {}) {
    const stack = ensureToastStack();
    const kind = type === 'error' ? 'error' : 'success';

    const element = document.createElement('div');
    element.className = `toast toast-${kind}`;
    element.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      kind === 'error'
        ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 6.5v7"/><path d="M12 17.3v.2"/></svg>'
        : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

    const text = document.createElement('p');
    text.className = 'toast-text';
    text.textContent = message;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Fechar notificação');
    close.innerHTML =
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.addEventListener('click', () => dismissToast(element));

    element.append(icon, text, close);
    stack.appendChild(element);

    // Mantém no máximo 4 cartões na tela.
    while (stack.children.length > 4) {
      const oldest = stack.firstElementChild;
      clearTimeout(oldest.toastTimer);
      oldest.remove();
    }

    // Força o navegador a aplicar o estado inicial antes da animação.
    void element.offsetWidth;
    element.classList.add('is-visible');
    // Compatibilidade: garante exibição mesmo se o navegador tiver o CSS antigo em cache.
    element.classList.add('show');

    element.toastTimer = setTimeout(
      () => dismissToast(element),
      kind === 'error' ? 6000 : 4500
    );

    if (options.sound !== false) playSound(kind);
    return element;
  }

  function openDialog(dialog) {
    if (!dialog) return;
    const alreadyOpen = dialog.open || dialog.hasAttribute('open');

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }

    // Som curto ao abrir qualquer popup (somente na primeira abertura).
    if (!alreadyOpen) playSound('open');
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
    playSound,
    unlockSound,
    isSoundReady,
    openDialog,
    closeDialog,
    wireDialogClose,
    showFormError,
    setButtonLoading,
    pluralize,
    durationLabel
  };
})();
