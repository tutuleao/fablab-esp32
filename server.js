'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const { createStore, hashPassword, verifyPassword } = require('./lib/store');
const {
  passwordVersion,
  createSessionCookie,
  clearSessionCookie,
  readSessionToken,
  verifySessionToken
} = require('./lib/session');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');

const store = createStore();

const ROOMS = [
  '6A', '6B', '6C',
  '7A', '7B', '7C',
  '8A', '8B', '8C',
  '9A', '9B', '9C',
  '1A', '1B', '1C',
  '2A', '2B', '2C',
  '3A', '3B', '3C'
];

const AVG_TIMES = ['50 min', '1h40min', '2h30min', '3h20min', '4h10min', 'Mais de 4h'];

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri'];

const BREAKS = [
  ['08:40', '09:00'],
  ['15:50', '16:10']
];

const AVAILABILITY = {
  mon: {
    label: 'Segunda-feira',
    short: 'Seg',
    windows: [['08:00', '12:20'], ['13:20', '17:00']]
  },
  tue: {
    label: 'Terça-feira',
    short: 'Ter',
    windows: [['09:20', '12:20'], ['13:20', '18:20']]
  },
  wed: {
    label: 'Quarta-feira',
    short: 'Qua',
    windows: [['08:00', '10:40'], ['13:20', '17:00']]
  },
  thu: {
    label: 'Quinta-feira',
    short: 'Qui',
    windows: [['09:20', '12:20'], ['13:20', '18:20']]
  },
  fri: {
    label: 'Sexta-feira',
    short: 'Sex',
    windows: [['08:00', '12:20'], ['13:20', '17:00']]
  }
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

/* -------------------------------------------------------------------------- */
/* Datas e horários                                                           */
/* -------------------------------------------------------------------------- */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function addDays(date, amount) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const weekday = copy.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function toMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

function toTime(minutes) {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

// Divide um turno em segmentos, removendo os intervalos de 20 minutos.
// Ex.: 08:00–12:20 com intervalo 08:40–09:00 vira 08:00–08:40 e 09:00–12:20.
function splitWindows(windows, breaks = BREAKS) {
  const segments = [];
  for (const [start, end] of windows) {
    let pieces = [[toMinutes(start), toMinutes(end)]];
    for (const [breakStart, breakEnd] of breaks) {
      const bStart = toMinutes(breakStart);
      const bEnd = toMinutes(breakEnd);
      const next = [];
      for (const [pieceStart, pieceEnd] of pieces) {
        if (bEnd <= pieceStart || bStart >= pieceEnd) {
          next.push([pieceStart, pieceEnd]);
          continue;
        }
        if (bStart > pieceStart) next.push([pieceStart, bStart]);
        if (bEnd < pieceEnd) next.push([bEnd, pieceEnd]);
      }
      pieces = next;
    }
    for (const [pieceStart, pieceEnd] of pieces) {
      if (pieceEnd > pieceStart) segments.push([toTime(pieceStart), toTime(pieceEnd)]);
    }
  }
  return segments;
}

// Grade fixa da manhã: os blocos de 50 min são cortados a partir das 07:00.
const MORNING_GRID_START = toMinutes('07:00');

function makeGridSlots(anchor, from, to) {
  const slots = [];
  for (let block = anchor; block < to; block += 50) {
    const startMin = Math.max(block, from);
    const endMin = Math.min(block + 50, to);
    if (endMin > startMin) {
      slots.push({
        start: toTime(startMin),
        end: toTime(endMin),
        minutes: endMin - startMin
      });
    }
  }
  return slots;
}

function makeSlots(windows, breaks = BREAKS) {
  const slots = [];
  for (const [start, end] of windows) {
    const isMorning = toMinutes(start) < 12 * 60;
    const segments = splitWindows([[start, end]], breaks);

    for (const [segmentStart, segmentEnd] of segments) {
      const from = toMinutes(segmentStart);
      const to = toMinutes(segmentEnd);

      if (isMorning) {
        // Manhã: corta os 50 min a partir das 07:00 e só oferece o trecho
        // dentro do horário de funcionamento (ex.: 08:00 ou 09:20).
        // Depois de um intervalo, o corte recomeça no fim do intervalo.
        const priorBreakEnd = breaks
          .map(([, breakEnd]) => toMinutes(breakEnd))
          .filter((value) => value <= from)
          .sort((a, b) => b - a)[0];

        const anchor = priorBreakEnd == null ? MORNING_GRID_START : priorBreakEnd;
        slots.push(...makeGridSlots(anchor, from, to));
        continue;
      }

      // Tarde: mantém o corte a partir do início do turno/segmento,
      // aproveitando restos de pelo menos 40 minutos.
      let cursor = from;
      while (cursor + 50 <= to) {
        slots.push({
          start: toTime(cursor),
          end: toTime(cursor + 50),
          minutes: 50
        });
        cursor += 50;
      }

      const remaining = to - cursor;
      if (remaining >= 40) {
        slots.push({
          start: toTime(cursor),
          end: toTime(to),
          minutes: remaining
        });
      }
    }
  }
  return slots;
}

const SLOTS = Object.fromEntries(
  DAY_ORDER.map((key) => [key, makeSlots(AVAILABILITY[key].windows)])
);

function getWeeks() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = startOfWeek(today);

  return [0, 1, 2, 3].map((index) => {
    const weekStart = addDays(monday, index * 7);
    const days = DAY_ORDER.map((key, dayIndex) => {
      const date = addDays(weekStart, dayIndex);
      return {
        key,
        date: formatDate(date),
        label: AVAILABILITY[key].label,
        short: AVAILABILITY[key].short,
        weekStart: formatDate(weekStart),
        past: date < today
      };
    });

    return {
      index,
      start: formatDate(weekStart),
      end: formatDate(addDays(weekStart, 4)),
      label: index === 0 ? 'Semana atual' : `Semana +${index}`,
      days
    };
  });
}

function allAvailableDays() {
  return getWeeks().flatMap((week) => week.days);
}

function isSlotInPast(date, start) {
  const today = formatDate(new Date());
  if (date < today) return true;
  if (date > today) return false;
  const now = new Date();
  const [hours, minutes] = String(start).split(':').map(Number);
  return hours * 60 + minutes <= now.getHours() * 60 + now.getMinutes();
}

/* -------------------------------------------------------------------------- */
/* Sessões                                                                    */
/* -------------------------------------------------------------------------- */

async function getSession(req) {
  const token = readSessionToken(req);
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await store.findUserById(payload.uid);
  if (!user) return null;

  // Invalida sessões antigas quando a senha é alterada.
  if (payload.pv !== passwordVersion(user)) return null;

  return { user, payload };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role
  };
}

/* -------------------------------------------------------------------------- */
/* Utilitários HTTP                                                           */
/* -------------------------------------------------------------------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function parseJsonBody(raw) {
  if (!raw || !String(raw).trim()) return {};
  return JSON.parse(raw);
}

function readJson(req) {
  // Na Vercel o corpo pode chegar já interpretado pelo runtime.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      return Promise.resolve(parseJsonBody(req.body.toString('utf8')));
    }
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(parseJsonBody(req.body));
      } catch {
        const error = new Error('JSON inválido.');
        error.status = 400;
        return Promise.reject(error);
      }
    }
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        const error = new Error('Conteúdo enviado muito grande.');
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const error = new Error('JSON inválido.');
        error.status = 400;
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

async function requireAuth(req, res, role = null) {
  const session = await getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Sessão expirada. Faça login novamente.' });
    return null;
  }
  if (role && session.user.role !== role) {
    sendJson(res, 403, { error: 'Acesso restrito ao administrador.' });
    return null;
  }
  return session;
}

function sortBookings(bookings) {
  return [...bookings].sort((a, b) => {
    const keyA = `${a.date} ${a.start}`;
    const keyB = `${b.date} ${b.start}`;
    return keyA.localeCompare(keyB);
  });
}

function sortVisits(visits) {
  return [...visits].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

function overlaps(startA, endA, startB, endB) {
  return toMinutes(startA) < toMinutes(endB) && toMinutes(startB) < toMinutes(endA);
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isValidRoom(room) {
  return ROOMS.includes(String(room || '').toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

async function handleLogin(req, res, adminOnly) {
  const body = await readJson(req);
  const username = cleanText(body.username, 40).toLowerCase();
  const password = String(body.password || '');

  if (!username || !password) {
    return sendJson(res, 400, { error: 'Informe usuário e senha.' });
  }

  const user = await store.findUserByUsername(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
  }

  if (adminOnly && user.role !== 'admin') {
    return sendJson(res, 403, { error: 'Esta conta não possui acesso administrativo.' });
  }

  res.setHeader('Set-Cookie', createSessionCookie(user));
  return sendJson(res, 200, {
    user: publicUser(user),
    redirect: adminOnly ? '/admin/dashboard' : '/app'
  });
}

async function handleCreateBooking(req, res, session) {
  const body = await readJson(req);
  const date = String(body.date || '');
  const room = cleanText(body.room, 5).toUpperCase();
  const purpose = cleanText(body.purpose, 200);
  const students = Number(body.students);
  const machineId = cleanText(body.machineId, 80);

  const day = allAvailableDays().find((item) => item.date === date);
  if (!day) {
    return sendJson(res, 400, { error: 'Esta data está fora do período de 4 semanas da agenda.' });
  }
  if (day.past) {
    return sendJson(res, 400, { error: 'Não é possível agendar em uma data que já passou.' });
  }
  if (!Array.isArray(body.slots) || body.slots.length === 0) {
    return sendJson(res, 400, { error: 'Selecione pelo menos um bloco de horário.' });
  }
  if (!isValidRoom(room)) {
    return sendJson(res, 400, { error: 'Selecione uma turma válida.' });
  }
  if (!purpose || purpose.length < 3) {
    return sendJson(res, 400, { error: 'Informe o motivo do agendamento.' });
  }
  if (!Number.isInteger(students) || students < 1 || students > 80) {
    return sendJson(res, 400, { error: 'A quantidade de alunos deve estar entre 1 e 80.' });
  }

  const availableSlots = SLOTS[day.key];
  const selected = [];

  for (const item of body.slots) {
    const start = String((item && item.start) || '');
    const slot = availableSlots.find((candidate) => candidate.start === start);
    if (!slot) {
      return sendJson(res, 400, { error: 'Um dos horários selecionados não está disponível neste dia.' });
    }
    if (isSlotInPast(date, slot.start)) {
      return sendJson(res, 400, { error: 'Um dos horários selecionados já passou. Escolha um horário futuro.' });
    }
    if (!selected.some((candidate) => candidate.start === slot.start)) {
      selected.push({ start: slot.start, end: slot.end, minutes: slot.minutes });
    }
  }

  selected.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  for (let index = 1; index < selected.length; index += 1) {
    if (selected[index - 1].end !== selected[index].start) {
      return sendJson(res, 400, { error: 'Os tempos escolhidos precisam ser consecutivos.' });
    }
  }

  const sameDay = await store.listBookingsByDates([date]);
  const conflict = selected.some((slot) =>
    sameDay.some((booking) =>
      (booking.slots || []).some((booked) =>
        overlaps(slot.start, slot.end, booked.start, booked.end)
      )
    )
  );

  if (conflict) {
    return sendJson(res, 409, { error: 'Um ou mais horários já estão ocupados. Atualize a agenda e tente novamente.' });
  }

  let machine = null;
  if (machineId) {
    machine = await store.findMachine(machineId);
    if (!machine) {
      return sendJson(res, 400, { error: 'A máquina selecionada não existe mais. Atualize a página.' });
    }
  }

  const booking = await store.createBooking({
    userId: session.user.id,
    userName: session.user.name,
    userLogin: session.user.username,
    date,
    weekStart: day.weekStart,
    dayKey: day.key,
    slots: selected,
    start: selected[0].start,
    end: selected[selected.length - 1].end,
    room,
    students,
    purpose,
    machineId: machine ? machine.id : null,
    machineName: machine ? machine.name : null
  });

  return sendJson(res, 201, { booking });
}

async function handleCreateVisit(req, res, session) {
  const body = await readJson(req);
  const room = cleanText(body.room, 5).toUpperCase();
  const purpose = cleanText(body.purpose, 100);
  const students = Number(body.students);
  const avgTime = cleanText(body.avgTime, 30);

  if (!isValidRoom(room)) {
    return sendJson(res, 400, { error: 'Selecione uma turma válida.' });
  }
  if (!purpose || purpose.length < 2) {
    return sendJson(res, 400, { error: 'Informe o propósito do envio de alunos.' });
  }
  if (!Number.isInteger(students) || students < 1 || students > 80) {
    return sendJson(res, 400, { error: 'A quantidade de alunos deve estar entre 1 e 80.' });
  }
  if (!AVG_TIMES.includes(avgTime)) {
    return sendJson(res, 400, { error: 'Selecione um tempo médio válido.' });
  }

  const visit = await store.createVisit({
    userId: session.user.id,
    userName: session.user.name,
    userLogin: session.user.username,
    room,
    purpose,
    students,
    avgTime
  });

  return sendJson(res, 201, { visit });
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'POST' && pathname === '/api/login') {
    return handleLogin(req, res, false);
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    return handleLogin(req, res, true);
  }

  if (req.method === 'POST' && pathname === '/api/logout') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/session') {
    const current = await getSession(req);
    return sendJson(res, 200, { user: current ? publicUser(current.user) : null });
  }

  if (req.method === 'GET' && pathname === '/api/me') {
    const current = await getSession(req);
    if (!current) return sendJson(res, 401, { error: 'Não autenticado.' });
    return sendJson(res, 200, { user: publicUser(current.user) });
  }

  if (req.method === 'GET' && pathname === '/api/config') {
    const current = await requireAuth(req, res);
    if (!current) return;
    return sendJson(res, 200, {
      user: publicUser(current.user),
      rooms: ROOMS,
      avgTimes: AVG_TIMES,
      machines: await store.listMachines(),
      breaks: BREAKS.map(([start, end]) => ({ start, end })),
      availability: Object.fromEntries(
        DAY_ORDER.map((key) => [
          key,
          {
            label: AVAILABILITY[key].label,
            short: AVAILABILITY[key].short,
            windows: AVAILABILITY[key].windows,
            segments: splitWindows(AVAILABILITY[key].windows),
            slots: SLOTS[key]
          }
        ])
      ),
      weeks: getWeeks(),
      today: formatDate(new Date())
    });
  }

  if (req.method === 'GET' && pathname === '/api/bookings') {
    const current = await requireAuth(req, res);
    if (!current) return;

    const weekStart = url.searchParams.get('week');
    if (!weekStart) return sendJson(res, 400, { error: 'Informe a semana desejada.' });

    const week = getWeeks().find((item) => item.start === weekStart);
    if (!week) return sendJson(res, 400, { error: 'Semana fora do período disponível.' });

    const dates = week.days.map((day) => day.date);
    const bookings = sortBookings(await store.listBookingsByDates(dates));
    return sendJson(res, 200, { week, bookings });
  }

  if (req.method === 'POST' && pathname === '/api/bookings') {
    const current = await requireAuth(req, res);
    if (!current) return;
    return handleCreateBooking(req, res, current);
  }

  const bookingDelete = pathname.match(/^\/api\/bookings\/([^/]+)$/);
  if (req.method === 'DELETE' && bookingDelete) {
    const current = await requireAuth(req, res);
    if (!current) return;

    const booking = await store.findBooking(bookingDelete[1]);
    if (!booking) return sendJson(res, 404, { error: 'Agendamento não encontrado.' });
    if (current.user.role !== 'admin' && booking.userId !== current.user.id) {
      return sendJson(res, 403, { error: 'Você só pode cancelar os seus próprios agendamentos.' });
    }

    await store.deleteBooking(booking.id);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/student-visits') {
    const current = await requireAuth(req, res);
    if (!current) return;

    const visits = (await store.listVisitsByUser(current.user.id)).sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))
    );

    return sendJson(res, 200, { visits });
  }

  if (req.method === 'POST' && pathname === '/api/student-visits') {
    const current = await requireAuth(req, res);
    if (!current) return;
    return handleCreateVisit(req, res, current);
  }

  const visitDelete = pathname.match(/^\/api\/student-visits\/([^/]+)$/);
  if (req.method === 'DELETE' && visitDelete) {
    const current = await requireAuth(req, res);
    if (!current) return;

    const visit = await store.findVisit(visitDelete[1]);
    if (!visit) return sendJson(res, 404, { error: 'Registro não encontrado.' });
    if (current.user.role !== 'admin' && visit.userId !== current.user.id) {
      return sendJson(res, 403, { error: 'Você só pode excluir os seus próprios registros.' });
    }

    await store.deleteVisit(visit.id);
    return sendJson(res, 200, { ok: true });
  }

  /* -------------------------------- Admin --------------------------------- */

  if (req.method === 'GET' && pathname === '/api/admin/overview') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;

    const today = formatDate(new Date());
    const [allBookings, allVisits, machines, users] = await Promise.all([
      store.listAllBookings(),
      store.listAllVisits(),
      store.listMachines(),
      store.listUsers()
    ]);

    const upcoming = sortBookings(allBookings.filter((booking) => booking.date >= today));
    const recentVisits = sortVisits(allVisits).slice(0, 8);

    return sendJson(res, 200, {
      stats: {
        totalBookings: allBookings.length,
        upcomingBookings: upcoming.length,
        studentVisits: allVisits.length,
        totalStudents: allVisits.reduce((sum, visit) => sum + Number(visit.students || 0), 0),
        machines: machines.length,
        users: users.length
      },
      upcoming: upcoming.slice(0, 8),
      recentVisits
    });
  }

  if (req.method === 'GET' && pathname === '/api/admin/bookings') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;
    return sendJson(res, 200, { bookings: sortBookings(await store.listAllBookings()) });
  }

  if (req.method === 'GET' && pathname === '/api/admin/student-visits') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;
    return sendJson(res, 200, { visits: sortVisits(await store.listAllVisits()) });
  }

  if (req.method === 'GET' && pathname === '/api/admin/machines') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;
    return sendJson(res, 200, { machines: await store.listMachines() });
  }

  if (req.method === 'POST' && pathname === '/api/admin/machines') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;

    const body = await readJson(req);
    const name = cleanText(body.name, 80);
    if (name.length < 2) {
      return sendJson(res, 400, { error: 'Informe o nome da máquina.' });
    }

    const machine = await store.createMachine(name);
    return sendJson(res, 201, { machine });
  }

  const machineRoute = pathname.match(/^\/api\/admin\/machines\/([^/]+)$/);
  if (machineRoute) {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;

    const machine = await store.findMachine(machineRoute[1]);
    if (!machine) return sendJson(res, 404, { error: 'Máquina não encontrada.' });

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const name = cleanText(body.name, 80);
      if (name.length < 2) {
        return sendJson(res, 400, { error: 'Informe o nome da máquina.' });
      }

      const updated = await store.renameMachine(machine.id, name);
      if (!updated) return sendJson(res, 404, { error: 'Máquina não encontrada.' });
      return sendJson(res, 200, { machine: updated });
    }

    if (req.method === 'DELETE') {
      await store.deleteMachine(machine.id);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (req.method === 'GET' && pathname === '/api/admin/users') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;
    return sendJson(res, 200, {
      users: (await store.listUsers()).map((user) => ({
        ...publicUser(user),
        createdAt: user.createdAt
      }))
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/users') {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;

    const body = await readJson(req);
    const name = cleanText(body.name, 80);
    const username = cleanText(body.username, 40);
    const password = String(body.password || '');

    if (name.length < 2) return sendJson(res, 400, { error: 'Informe o nome do usuário.' });
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
      return sendJson(res, 400, {
        error: 'O usuário deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).'
      });
    }
    if (password.length < 4) {
      return sendJson(res, 400, { error: 'A senha deve ter pelo menos 4 caracteres.' });
    }

    const user = await store.createUser({
      name,
      username,
      passwordHash: hashPassword(password)
    });
    return sendJson(res, 201, { user: publicUser(user) });
  }

  const passwordRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
  if (req.method === 'PATCH' && passwordRoute) {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;

    const user = await store.findUserById(passwordRoute[1]);
    if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });

    const body = await readJson(req);
    const password = String(body.password || '');
    if (password.length < 4) {
      return sendJson(res, 400, { error: 'A nova senha deve ter pelo menos 4 caracteres.' });
    }

    await store.updateUserPassword(user.id, hashPassword(password));
    return sendJson(res, 200, { ok: true });
  }

  const userRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === 'DELETE' && userRoute) {
    const current = await requireAuth(req, res, 'admin');
    if (!current) return;

    const user = await store.findUserById(userRoute[1]);
    if (!user) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
    if (user.id === current.user.id) {
      return sendJson(res, 400, { error: 'Você não pode excluir a sua própria conta.' });
    }
    if (user.role === 'admin') {
      return sendJson(res, 400, { error: 'Contas administrativas não podem ser excluídas por aqui.' });
    }

    await store.deleteUser(user.id);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

/* -------------------------------------------------------------------------- */
/* Arquivos estáticos                                                         */
/* -------------------------------------------------------------------------- */

function serveStatic(req, res, pathname) {
  const pageRoutes = {
    '/': 'index.html',
    '/app': 'app.html',
    '/app.html': 'app.html',
    '/admin': 'admin.html',
    '/admin.html': 'admin.html',
    '/admin/dashboard': 'admin-dashboard.html',
    '/admin-dashboard.html': 'admin-dashboard.html'
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  const relative = pageRoutes[pathname] || pathname.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  const safeRoot = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;

  if (!filePath.startsWith(safeRoot)) {
    return sendHtmlError(res, 404, 'Página não encontrada.');
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      return sendHtmlError(res, 404, 'Página não encontrada.');
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin'
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

function sendHtmlError(res, status, message) {
  const body = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${status} — Rede Fab Lab</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f6f6;font-family:'Segoe UI',Arial,sans-serif;color:#171717}
.box{background:#fff;border:1px solid #e7e7e7;border-top:5px solid #e30613;border-radius:18px;padding:40px;max-width:420px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.07)}
strong{display:block;font-size:64px;line-height:1;color:#e30613;letter-spacing:-.06em}
h1{font-size:22px;margin:14px 0 8px}p{color:#777;font-size:14px;margin:0 0 22px}
a{display:inline-block;background:#e30613;color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 18px;border-radius:10px}
</style></head><body><div class="box"><strong>${status}</strong><h1>${message}</h1><p>Verifique o endereço ou volte para a página inicial.</p><a href="/">Ir para o login</a></div></body></html>`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/* -------------------------------------------------------------------------- */
/* Servidor                                                                   */
/* -------------------------------------------------------------------------- */

async function handler(req, res) {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendJson(res, 400, { error: 'Requisição inválida.' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendJson(res, 400, { error: 'Endereço inválido.' });
  }

  if (pathname.startsWith('/api/')) {
    try {
      await store.init();
      await handleApi(req, res, url);
    } catch (error) {
      if (!res.headersSent) {
        let status = Number(error.status) || 500;
        let message = status >= 500 ? 'Erro interno do servidor.' : error.message;

        if (error.code === '23505') {
          status = 409;
          message = 'Já existe um registro com esses dados.';
        }

        if (status >= 500) console.error('Erro na API:', error);
        sendJson(res, status, { error: message });
      } else {
        console.error('Erro na API:', error);
        res.end();
      }
    }
    return;
  }

  serveStatic(req, res, pathname);
}

async function start() {
  await store.init();
  const server = http.createServer(handler);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`A porta ${PORT} já está em uso. Feche o outro servidor ou execute com outra porta:`);
      console.error(`  set PORT=3001 && node server.js`);
    } else {
      console.error('Erro no servidor:', error);
    }
    process.exitCode = 1;
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('  REDE FAB LAB PRESIDENTE PRUDENTE');
    console.log('  ---------------------------------');
    console.log(`  Site:  http://localhost:${PORT}`);
    console.log(`  Admin: http://localhost:${PORT}/admin`);
    console.log('');
    console.log(`  Banco: ${store.mode === 'supabase' ? 'Supabase' : 'JSON local (data/db.json)'}`);
    console.log('');
    console.log('  Login inicial do professor: professor / fablab123');
    console.log('  Login inicial do admin:     admin / admin123');
    console.log('');
  });
}

if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error('Não foi possível iniciar o servidor:', error);
    process.exitCode = 1;
  });
}

module.exports = handler;
