'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* -------------------------------------------------------------------------- */
/* Senhas e seed                                                              */
/* -------------------------------------------------------------------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function makeSeed() {
  return {
    users: [
      {
        name: 'Administrador',
        username: 'admin',
        role: 'admin',
        passwordHash: hashPassword('admin123')
      },
      {
        name: 'Professor(a)',
        username: 'professor',
        role: 'user',
        passwordHash: hashPassword('fablab123')
      }
    ],
    machines: [
      'Impressora 3D',
      'Cortadora a laser',
      'Plotter de recorte',
      'Fresadora CNC',
      'Scanner 3D'
    ].map((name) => ({ name }))
  };
}

function conflictError(message) {
  const error = new Error(message);
  error.code = '23505';
  return error;
}

/* -------------------------------------------------------------------------- */
/* Conversores (Supabase snake_case <-> app camelCase)                        */
/* -------------------------------------------------------------------------- */

function userFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    passwordHash: row.password_hash,
    createdAt: row.created_at
  };
}

function machineFromRow(row) {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function bookingFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userLogin: row.user_login,
    date: row.date,
    weekStart: row.week_start,
    dayKey: row.day_key,
    slots: Array.isArray(row.slots) ? row.slots : [],
    start: row.start_time,
    end: row.end_time,
    room: row.room,
    students: row.students,
    purpose: row.purpose,
    machineId: row.machine_id,
    machineName: row.machine_name,
    createdAt: row.created_at
  };
}

function bookingToRow(booking) {
  return {
    user_id: booking.userId,
    user_name: booking.userName,
    user_login: booking.userLogin,
    date: booking.date,
    week_start: booking.weekStart,
    day_key: booking.dayKey,
    slots: booking.slots,
    start_time: booking.start,
    end_time: booking.end,
    room: booking.room,
    students: booking.students,
    purpose: booking.purpose,
    machine_id: booking.machineId || null,
    machine_name: booking.machineName || null
  };
}

function visitFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userLogin: row.user_login,
    room: row.room,
    purpose: row.purpose,
    students: row.students,
    avgTime: row.avg_time,
    createdAt: row.created_at
  };
}

function visitToRow(visit) {
  return {
    user_id: visit.userId,
    user_name: visit.userName,
    user_login: visit.userLogin,
    room: visit.room,
    purpose: visit.purpose,
    students: visit.students,
    avg_time: visit.avgTime
  };
}

/* -------------------------------------------------------------------------- */
/* Backend local (JSON) — usado quando o Supabase não está configurado        */
/* -------------------------------------------------------------------------- */

function createLocalStore() {
  let db = null;
  let initPromise = null;

  function save() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = `${DB_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(db, null, 2), 'utf8');
    try {
      fs.renameSync(temp, DB_FILE);
    } catch {
      fs.copyFileSync(temp, DB_FILE);
      fs.unlinkSync(temp);
    }
  }

  function normalize() {
    if (!db || typeof db !== 'object') db = {};
    if (!Array.isArray(db.users) || db.users.length === 0) {
      const seed = makeSeed();
      db.users = seed.users.map((user) => ({
        ...user,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      }));
      db.machines = Array.isArray(db.machines) && db.machines.length
        ? db.machines
        : seed.machines.map((machine) => ({
            ...machine,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString()
          }));
    }
    if (!Array.isArray(db.machines)) db.machines = [];
    if (!Array.isArray(db.bookings)) db.bookings = [];
    if (!Array.isArray(db.studentVisits)) db.studentVisits = [];
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = Promise.resolve().then(() => {
      try {
        db = fs.existsSync(DB_FILE)
          ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
          : {};
      } catch (error) {
        console.error('Não foi possível ler o banco local. Criando um novo.', error.message);
        db = {};
      }
      normalize();
      save();
    });
    return initPromise;
  }

  return {
    mode: 'local',
    init,
    ensureSeed: init,

    async findUserByUsername(username) {
      return (
        db.users.find(
          (user) => String(user.username).toLowerCase() === String(username).toLowerCase()
        ) || null
      );
    },
    async findUserById(id) {
      return db.users.find((user) => user.id === id) || null;
    },
    async listUsers() {
      return [...db.users];
    },
    async createUser({ name, username, passwordHash }) {
      const login = String(username).toLowerCase();
      if (
        db.users.some(
          (user) => String(user.username).toLowerCase() === login
        )
      ) {
        throw conflictError('Já existe um usuário com esse login.');
      }
      const user = {
        id: crypto.randomUUID(),
        name,
        username: login,
        role: 'user',
        passwordHash,
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      save();
      return user;
    },
    async updateUserPassword(id, passwordHash) {
      const user = db.users.find((item) => item.id === id);
      if (!user) return false;
      user.passwordHash = passwordHash;
      save();
      return true;
    },
    async deleteUser(id) {
      db.users = db.users.filter((user) => user.id !== id);
      save();
    },

    async listMachines() {
      return [...db.machines];
    },
    async findMachine(id) {
      return db.machines.find((machine) => machine.id === id) || null;
    },
    async createMachine(name) {
      if (db.machines.some((machine) => machine.name.toLowerCase() === name.toLowerCase())) {
        throw conflictError('Já existe uma máquina com esse nome.');
      }
      const machine = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
      db.machines.push(machine);
      save();
      return machine;
    },
    async renameMachine(id, name) {
      const machine = db.machines.find((item) => item.id === id);
      if (!machine) return null;
      if (
        db.machines.some(
          (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        throw conflictError('Já existe uma máquina com esse nome.');
      }
      machine.name = name;
      for (const booking of db.bookings) {
        if (booking.machineId === id) booking.machineName = name;
      }
      save();
      return machine;
    },
    async deleteMachine(id) {
      db.machines = db.machines.filter((machine) => machine.id !== id);
      save();
    },

    async listBookingsByDates(dates) {
      const set = new Set(dates);
      return db.bookings.filter((booking) => set.has(booking.date));
    },
    async listUpcomingBookings(today) {
      return db.bookings.filter((booking) => booking.date >= today);
    },
    async listAllBookings() {
      return [...db.bookings];
    },
    async findBooking(id) {
      return db.bookings.find((booking) => booking.id === id) || null;
    },
    async createBooking(booking) {
      const record = {
        ...booking,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      db.bookings.push(record);
      save();
      return record;
    },
    async deleteBooking(id) {
      db.bookings = db.bookings.filter((booking) => booking.id !== id);
      save();
    },

    async listVisitsByUser(userId) {
      return db.studentVisits.filter((visit) => visit.userId === userId);
    },
    async listAllVisits() {
      return [...db.studentVisits];
    },
    async findVisit(id) {
      return db.studentVisits.find((visit) => visit.id === id) || null;
    },
    async createVisit(visit) {
      const record = {
        ...visit,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString()
      };
      db.studentVisits.push(record);
      save();
      return record;
    },
    async deleteVisit(id) {
      db.studentVisits = db.studentVisits.filter((visit) => visit.id !== id);
      save();
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Backend Supabase                                                          */
/* -------------------------------------------------------------------------- */

function createSupabaseStore(url, serviceRoleKey) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let initPromise = null;

  function unwrap({ data, error }) {
    if (error) {
      const thrown = new Error(error.message);
      thrown.code = error.code;
      throw thrown;
    }
    return data;
  }

  async function ensureSeed() {
    const { count: userCount, error: userError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true });
    if (userError) throw new Error(userError.message);

    if (!userCount) {
      const seed = makeSeed();
      const { error } = await supabase.from('users').insert(
        seed.users.map((user) => ({
          name: user.name,
          username: user.username,
          role: user.role,
          password_hash: user.passwordHash
        }))
      );
      if (error && error.code !== '23505') throw new Error(error.message);
    }

    const { count: machineCount, error: machineError } = await supabase
      .from('machines')
      .select('id', { count: 'exact', head: true });
    if (machineError) throw new Error(machineError.message);
    if (!machineCount) {
      const seed = makeSeed();
      const { error } = await supabase
        .from('machines')
        .insert(seed.machines.map((machine) => ({ name: machine.name })));
      if (error && error.code !== '23505') throw new Error(error.message);
    }
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = ensureSeed().catch((error) => {
      initPromise = null;
      throw error;
    });
    return initPromise;
  }

  return {
    mode: 'supabase',
    init,
    ensureSeed: init,

    async findUserByUsername(username) {
      const data = unwrap(
        await supabase
          .from('users')
          .select('*')
          .eq('username', String(username).toLowerCase())
          .maybeSingle()
      );
      return data ? userFromRow(data) : null;
    },
    async findUserById(id) {
      const data = unwrap(
        await supabase.from('users').select('*').eq('id', id).maybeSingle()
      );
      return data ? userFromRow(data) : null;
    },
    async listUsers() {
      const data = unwrap(
        await supabase.from('users').select('*').order('created_at', { ascending: true })
      );
      return (data || []).map(userFromRow);
    },
    async createUser({ name, username, passwordHash }) {
      const data = unwrap(
        await supabase
          .from('users')
          .insert({ name, username: String(username).toLowerCase(), role: 'user', password_hash: passwordHash })
          .select('*')
          .single()
      );
      return userFromRow(data);
    },
    async updateUserPassword(id, passwordHash) {
      const data = unwrap(
        await supabase
          .from('users')
          .update({ password_hash: passwordHash })
          .eq('id', id)
          .select('id')
      );
      return Array.isArray(data) && data.length > 0;
    },
    async deleteUser(id) {
      unwrap(await supabase.from('users').delete().eq('id', id));
    },

    async listMachines() {
      const data = unwrap(
        await supabase.from('machines').select('*').order('created_at', { ascending: true })
      );
      return (data || []).map(machineFromRow);
    },
    async findMachine(id) {
      const data = unwrap(
        await supabase.from('machines').select('*').eq('id', id).maybeSingle()
      );
      return data ? machineFromRow(data) : null;
    },
    async createMachine(name) {
      const data = unwrap(
        await supabase.from('machines').insert({ name }).select('*').single()
      );
      return machineFromRow(data);
    },
    async renameMachine(id, name) {
      const data = unwrap(
        await supabase.from('machines').update({ name }).eq('id', id).select('*').maybeSingle()
      );
      if (!data) return null;
      unwrap(
        await supabase.from('bookings').update({ machine_name: name }).eq('machine_id', id)
      );
      return machineFromRow(data);
    },
    async deleteMachine(id) {
      unwrap(await supabase.from('machines').delete().eq('id', id));
    },

    async listBookingsByDates(dates) {
      if (!dates || dates.length === 0) return [];
      const data = unwrap(
        await supabase
          .from('bookings')
          .select('*')
          .in('date', dates)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
      );
      return (data || []).map(bookingFromRow);
    },
    async listUpcomingBookings(today) {
      const data = unwrap(
        await supabase
          .from('bookings')
          .select('*')
          .gte('date', today)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
      );
      return (data || []).map(bookingFromRow);
    },
    async listAllBookings() {
      const data = unwrap(
        await supabase
          .from('bookings')
          .select('*')
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
      );
      return (data || []).map(bookingFromRow);
    },
    async findBooking(id) {
      const data = unwrap(
        await supabase.from('bookings').select('*').eq('id', id).maybeSingle()
      );
      return data ? bookingFromRow(data) : null;
    },
    async createBooking(booking) {
      const data = unwrap(
        await supabase.from('bookings').insert(bookingToRow(booking)).select('*').single()
      );
      return bookingFromRow(data);
    },
    async deleteBooking(id) {
      unwrap(await supabase.from('bookings').delete().eq('id', id));
    },

    async listVisitsByUser(userId) {
      const data = unwrap(
        await supabase
          .from('student_visits')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      );
      return (data || []).map(visitFromRow);
    },
    async listAllVisits() {
      const data = unwrap(
        await supabase
          .from('student_visits')
          .select('*')
          .order('created_at', { ascending: false })
      );
      return (data || []).map(visitFromRow);
    },
    async findVisit(id) {
      const data = unwrap(
        await supabase.from('student_visits').select('*').eq('id', id).maybeSingle()
      );
      return data ? visitFromRow(data) : null;
    },
    async createVisit(visit) {
      const data = unwrap(
        await supabase.from('student_visits').insert(visitToRow(visit)).select('*').single()
      );
      return visitFromRow(data);
    },
    async deleteVisit(id) {
      unwrap(await supabase.from('student_visits').delete().eq('id', id));
    }
  };
}

/* -------------------------------------------------------------------------- */

function createStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return createSupabaseStore(url, key);
  return createLocalStore();
}

module.exports = {
  createStore,
  hashPassword,
  verifyPassword,
  makeSeed
};
