import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from './db.js';
import authMiddleware from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto_en_prod';
const SALT_ROUNDS = 10;
const DEFAULT_CONFIG = {
  hora_apertura: '09:00',
  hora_cierre: '18:00',
  duracion_turno: 60,
  dias_habilitados: [false, true, true, true, true, true, false],
};

const holidayCache = new Map();

app.use(express.json());
app.use(cors());
app.use(express.static('front-turnos'));
app.use('/empleado', express.static('front-turnos/empleados'));

function buildPublicUser(userRow) {
  return {
    id: userRow.id,
    nombre: userRow.nombre,
    email: userRow.email,
    apellido: userRow.apellido,
    rol: userRow.rol,
    creado_en: userRow.creado_en,
  };
}

function createUserToken(userId, rol) {
  return jwt.sign({ userId, rol }, JWT_SECRET, { expiresIn: '8h' });
}

function normalizeHour(hora) {
  return String(hora || '').slice(0, 5);
}


function getDayIndex(fecha) {
  const parsed = new Date(`${normalizeDateISO(fecha)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getDay();
}

function generateHoursBetween(apertura, cierre, duracion) {
  const startHour = normalizeHour(apertura);
  const endHour = normalizeHour(cierre);
  const slotDuration = Number(duracion);

  const [startH = 0, startM = 0] = startHour.split(':').map(Number);
  const [endH = 0, endM = 0] = endHour.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (slotDuration <= 0 || endMinutes <= startMinutes) {
    return [];
  }

  const slots = [];
  for (let current = startMinutes; current + slotDuration <= endMinutes; current += slotDuration) {
    const hh = String(Math.floor(current / 60)).padStart(2, '0');
    const mm = String(current % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }

  return slots;
}

function normalizeDateISO(fecha) {
  if (!fecha) return '';

  if (fecha instanceof Date && !Number.isNaN(fecha.getTime())) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const raw = String(fecha).trim();

  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return raw;
}

function getTodayInISO() {
  return normalizeDateISO(new Date());
}

async function getPublicOwnerUserId() {
  const user = await pool.query("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id ASC LIMIT 1");
  if (user.rows.length > 0) {
    return user.rows[0].id;
  }

  const fallbackUser = await pool.query('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1');
  if (fallbackUser.rows.length === 0) {
    return null;
  }

  return fallbackUser.rows[0].id;
}

async function getOrCreateBusinessConfig(ownerUserId) {
  if (!ownerUserId) {
    return {
      id: null,
      owner_user_id: null,
      ...DEFAULT_CONFIG,
    };
  }

  const existingConfig = await pool.query(
    `SELECT id, owner_user_id, hora_apertura, hora_cierre, duracion_turno
     FROM configuraciones_negocio
     WHERE owner_user_id = $1
     LIMIT 1`,
    [ownerUserId]
  );

  let configRow = existingConfig.rows[0];

  if (!configRow) {
    const inserted = await pool.query(
      `INSERT INTO configuraciones_negocio (owner_user_id, hora_apertura, hora_cierre, duracion_turno)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_user_id, hora_apertura, hora_cierre, duracion_turno`,
      [ownerUserId, DEFAULT_CONFIG.hora_apertura, DEFAULT_CONFIG.hora_cierre, DEFAULT_CONFIG.duracion_turno]
    );
    configRow = inserted.rows[0];
  }

  for (let day = 0; day < 7; day += 1) {
    await pool.query(
      `INSERT INTO configuracion_dias_semana (configuracion_id, dia_semana, habilitado)
       VALUES ($1, $2, $3)
       ON CONFLICT (configuracion_id, dia_semana)
       DO NOTHING`,
      [configRow.id, day, DEFAULT_CONFIG.dias_habilitados[day]]
    );
  }

  const normalizedDaysResult = await pool.query(
    `SELECT dia_semana, habilitado
     FROM configuracion_dias_semana
     WHERE configuracion_id = $1
     ORDER BY dia_semana ASC`,
    [configRow.id]
  );

  const diasHabilitados = Array(7).fill(false);
  normalizedDaysResult.rows.forEach((row) => {
    diasHabilitados[Number(row.dia_semana)] = Boolean(row.habilitado);
  });

  return {
    id: configRow.id,
    owner_user_id: configRow.owner_user_id,
    hora_apertura: normalizeHour(configRow.hora_apertura),
    hora_cierre: normalizeHour(configRow.hora_cierre),
    duracion_turno: Number(configRow.duracion_turno),
    dias_habilitados: diasHabilitados,
  };
}

async function getCurrentBusinessConfig() {
  const ownerUserId = await getPublicOwnerUserId();
  return getOrCreateBusinessConfig(ownerUserId);
}

async function fetchHolidaysByYear(year) {
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 3000) {
    throw new Error('Año inválido');
  }

  if (holidayCache.has(parsedYear)) {
    return holidayCache.get(parsedYear);
  }

  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${parsedYear}/AR`);
  if (!response.ok) {
    throw new Error('No se pudieron obtener los feriados');
  }

  const holidays = await response.json();
  holidayCache.set(parsedYear, holidays);
  return holidays;
}

async function isHoliday(fecha) {
  const isoDate = normalizeDateISO(fecha);
  const year = Number(isoDate.slice(0, 4));
  const holidays = await fetchHolidaysByYear(year);
  return holidays.some((holiday) => holiday.date === isoDate);
}

async function isWithinConfiguredHours(hora) {
  const config = await getCurrentBusinessConfig();
  const validHours = generateHoursBetween(config.hora_apertura, config.hora_cierre, config.duracion_turno);
  return validHours.includes(normalizeHour(hora));
}

async function isManuallyBlockedDay(fecha) {
  const result = await pool.query(
    'SELECT id FROM dias_bloqueados WHERE fecha = $1 AND activo = true LIMIT 1',
    [normalizeDateISO(fecha)]
  );
  return result.rows.length > 0;
}

async function isManuallyUnlockedDay(fecha) {
  const result = await pool.query(
    'SELECT id FROM dias_desbloqueados WHERE fecha = $1 AND activo = true LIMIT 1',
    [normalizeDateISO(fecha)]
  );
  return result.rows.length > 0;
}

function isDayDisabledBySchedule(fecha, config) {
  const dayIndex = getDayIndex(fecha);
  if (dayIndex === null) {
    return true;
  }

  return !config.dias_habilitados[dayIndex];
}

async function isBusinessClosed(fecha) {
  const config = await getCurrentBusinessConfig();
  const unlocked = await isManuallyUnlockedDay(fecha);

  if (unlocked) {
    return false;
  }

  if (await isManuallyBlockedDay(fecha)) {
    return true;
  }

  return isDayDisabledBySchedule(fecha, config);
}

async function validateTurnoCreation({ fecha, hora, estado = 'activo' }) {
  if (estado !== 'activo') {
    return 'Solo se pueden crear turnos con estado activo';
  }

  if (!(await isWithinConfiguredHours(hora))) {
    return 'El horario solicitado está fuera del horario configurado';
  }

  if (await isBusinessClosed(fecha)) {
    return 'El negocio se encuentra cerrado en el día solicitado';
  }

  if (await isHoliday(fecha)) {
    return 'No se pueden crear turnos en feriados';
  }


  return null;
}

function buildTurnoDateTime(fecha, hora) {
  const dateIso = normalizeDateISO(fecha);
  const timeIso = normalizeHour(hora) || '00:00';
  return new Date(`${dateIso}T${timeIso}:00`);
}

function canCancelWithAnticipation(fecha, hora) {
  const turnoDate = buildTurnoDateTime(fecha, hora);
  if (Number.isNaN(turnoDate.getTime())) {
    return false;
  }

  const msDiff = turnoDate.getTime() - Date.now();
  return msDiff >= 24 * 60 * 60 * 1000;
}

async function hasWeeklyTurnoLimitReached(userId, fecha) {
  const requestedDate = normalizeDateISO(fecha);
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM turnos
     WHERE usuario_id = $1
       AND estado = 'activo'
       AND fecha >= date_trunc('week', $2::date)::date
       AND fecha < (date_trunc('week', $2::date)::date + INTERVAL '7 day')`,
    [userId, requestedDate]
  );

  return Number(result.rows[0]?.total || 0) >= 2;
}

async function ensureDatabaseUpdates() {
  await pool.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellido VARCHAR(100)');
  await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) CHECK (rol IN ('admin','user')) DEFAULT 'user'");
  await pool.query("UPDATE usuarios SET apellido = '' WHERE apellido IS NULL");
  await pool.query("UPDATE usuarios SET rol = 'user' WHERE rol IS NULL");
  await pool.query("ALTER TABLE usuarios ALTER COLUMN apellido SET DEFAULT ''");
  await pool.query('ALTER TABLE usuarios ALTER COLUMN apellido SET NOT NULL');
  await pool.query("ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'user'");
  await pool.query('ALTER TABLE usuarios ALTER COLUMN rol SET NOT NULL');
  await pool.query('ALTER TABLE usuarios ALTER COLUMN apellido DROP DEFAULT');

  await pool.query('ALTER TABLE turnos ADD COLUMN IF NOT EXISTS apellido VARCHAR(100)');
  await pool.query("UPDATE turnos SET apellido = cliente WHERE apellido IS NULL OR apellido = ''");
  await pool.query('ALTER TABLE turnos ALTER COLUMN apellido SET NOT NULL');
  await pool.query(
    "ALTER TABLE turnos ADD COLUMN IF NOT EXISTS estado VARCHAR(20) CHECK (estado IN ('activo','cancelado','completado')) DEFAULT 'activo'"
  );

  await pool.query(`
    DO $$
    DECLARE c_name text;
    BEGIN
      SELECT conname INTO c_name
      FROM pg_constraint
      WHERE conrelid = 'turnos'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(fecha, hora)%'
      LIMIT 1;

      IF c_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE turnos DROP CONSTRAINT %I', c_name);
      END IF;
    END $$;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS turnos_unicos_activos
    ON turnos (fecha, hora)
    WHERE estado = 'activo'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dias_bloqueados (
      id SERIAL PRIMARY KEY,
      fecha DATE UNIQUE NOT NULL,
      motivo VARCHAR(255),
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuraciones_negocio (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      hora_apertura TIME NOT NULL,
      hora_cierre TIME NOT NULL,
      duracion_turno INTEGER NOT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(owner_user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS configuracion_dias_semana (
      id SERIAL PRIMARY KEY,
      configuracion_id INTEGER NOT NULL REFERENCES configuraciones_negocio(id) ON DELETE CASCADE,
      dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
      habilitado BOOLEAN NOT NULL,
      UNIQUE (configuracion_id, dia_semana)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dias_desbloqueados (
      id SERIAL PRIMARY KEY,
      fecha DATE UNIQUE NOT NULL,
      motivo VARCHAR(255),
      activo BOOLEAN DEFAULT true,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const ownerUserId = await getPublicOwnerUserId();
  await getOrCreateBusinessConfig(ownerUserId);
}

async function getUserById(userId) {
  const user = await pool.query('SELECT id, nombre, apellido, email, rol, creado_en FROM usuarios WHERE id = $1', [userId]);
  return user.rows[0] || null;
}

function ensureAdmin(req, res) {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado. Solo admin.' });
    return false;
  }
  return true;
}

function getTurnosCleanupQuery() {
  return "DELETE FROM turnos WHERE creado_en < NOW() - INTERVAL '3 years'";
}

app.get('/', (_req, res) => {
  res.sendFile(new URL('./front-turnos/index.html', import.meta.url).pathname);
});

app.get('/feriados', async (req, res) => {
  const year = req.query.year || new Date().getFullYear();

  try {
    const holidays = await fetchHolidaysByYear(year);
    return res.status(200).json(holidays);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// AUTH
app.post('/registro', async (req, res) => {
  const { nombre, apellido, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'nombre, email y password son obligatorios' });
  }

  try {
    const emailNormalizado = email.trim().toLowerCase();
    const usuarioExistente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [emailNormalizado]);

    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({ error: 'Ese email ya está registrado' });
    }

    const passwordHasheado = await bcrypt.hash(password, SALT_ROUNDS);

    const admins = await pool.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
    const rolNuevoUsuario = admins.rows.length === 0 ? 'admin' : 'user';

    const nuevoUsuario = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, email, password, rol)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, apellido, email, rol, creado_en`,
      [nombre.trim(), (apellido || '').trim(), emailNormalizado, passwordHasheado, rolNuevoUsuario]
    );

    return res.status(201).json({
      message: 'Usuario registrado correctamente',
      usuario: buildPublicUser(nuevoUsuario.rows[0]),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son obligatorios' });
  }

  try {
    const emailNormalizado = email.trim().toLowerCase();

    const usuario = await pool.query(
      `SELECT id, nombre, apellido, email, rol, password, creado_en
       FROM usuarios
       WHERE email = $1`,
      [emailNormalizado]
    );

    if (usuario.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuarioDB = usuario.rows[0];
    const passwordOk = await bcrypt.compare(password, usuarioDB.password);

    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = createUserToken(usuarioDB.id, usuarioDB.rol);

    return res.status(200).json({
      token,
      usuario: buildPublicUser(usuarioDB),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({ usuario: user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// CLIENTE PÚBLICO
app.post('/turnos/publico', async (req, res) => {
  return res.status(403).json({ error: 'Endpoint deshabilitado. Debe autenticarse y usar POST /turnos.' });
});


app.post('/turnos', authMiddleware, async (req, res) => {
  const { servicio, fecha, hora, estado } = req.body;

  if (!servicio || !fecha || !hora) {
    return res.status(400).json({ error: 'servicio, fecha y hora son obligatorios' });
  }

  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const validationError = await validateTurnoCreation({ fecha, hora, estado });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (req.user.rol !== 'admin') {
      const weeklyLimitReached = await hasWeeklyTurnoLimitReached(req.user.id, fecha);
      if (weeklyLimitReached) {
        return res.status(400).json({ error: 'Solo puede reservar hasta 2 turnos por semana' });
      }
    }

    const result = await pool.query(
      `INSERT INTO turnos (cliente, apellido, servicio, fecha, hora, estado, usuario_id)
       VALUES ($1, $2, $3, $4, $5, 'activo', $6)
       RETURNING id, cliente, apellido, servicio, fecha, hora, estado, creado_en`,
      [user.nombre, user.apellido, servicio.trim(), fecha, hora, req.user.id]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un turno activo en esa fecha y hora' });
    }

    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/turnos/publico/disponibilidad', async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'Debe enviar una fecha' });
  }

  try {
    if (await isBusinessClosed(fecha)) {
      return res.status(200).json({ fecha, ocupadas: [], disponibles: [] });
    }

    const config = await getCurrentBusinessConfig();
    const horasBase = generateHoursBetween(config.hora_apertura, config.hora_cierre, config.duracion_turno);
    const result = await pool.query("SELECT hora FROM turnos WHERE fecha = $1 AND estado = 'activo' ORDER BY hora ASC", [fecha]);
    const horasOcupadas = result.rows.map((row) => normalizeHour(row.hora));
    const disponibles = horasBase.filter((h) => !horasOcupadas.includes(h));

    return res.status(200).json({
      fecha,
      ocupadas: horasOcupadas,
      disponibles,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/turnos/publico/ocupados', async (req, res) => {
  const desde = String(req.query.desde || getTodayInISO());

  try {
    const result = await pool.query(
      `SELECT fecha, hora
       FROM turnos
       WHERE fecha >= $1 AND estado = 'activo'
       ORDER BY fecha ASC, hora ASC`,
      [desde]
    );

    const ocupados = result.rows.map((row) => ({
      fecha: normalizeDateISO(row.fecha),
      hora: normalizeHour(row.hora),
    }));

    const ocupadosPorFecha = ocupados.reduce((acc, item) => {
      if (!acc[item.fecha]) {
        acc[item.fecha] = [];
      }
      acc[item.fecha].push(item.hora);
      return acc;
    }, {});

    const config = await getCurrentBusinessConfig();
    const horasBase = generateHoursBetween(config.hora_apertura, config.hora_cierre, config.duracion_turno);
    const diasDisponibles = Object.keys(ocupadosPorFecha).filter((fecha) => ocupadosPorFecha[fecha].length < horasBase.length);

    return res.status(200).json({
      desde,
      dias_disponibles: diasDisponibles,
      ocupados,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/bloqueos', async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, fecha, motivo, activo, creado_en FROM dias_bloqueados ORDER BY fecha ASC');
    const bloqueos = result.rows.map((item) => ({ ...item, fecha: normalizeDateISO(item.fecha) }));
    return res.status(200).json(bloqueos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/bloqueos', authMiddleware, async (req, res) => {
  const { fecha, motivo } = req.body;
  if (!fecha) {
    return res.status(400).json({ error: 'fecha es obligatoria' });
  }

  try {
    if (!ensureAdmin(req, res)) return;

    const result = await pool.query(
      `INSERT INTO dias_bloqueados (fecha, motivo, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (fecha)
       DO UPDATE SET motivo = EXCLUDED.motivo, activo = true
       RETURNING id, fecha, motivo, activo, creado_en`,
      [fecha, motivo || null]
    );

    await pool.query('UPDATE dias_desbloqueados SET activo = false WHERE fecha = $1', [normalizeDateISO(fecha)]);

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/bloqueos/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { activo, motivo } = req.body;

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'El id debe ser válido' });
  }

  try {
    if (!ensureAdmin(req, res)) return;

    const result = await pool.query(
      `UPDATE dias_bloqueados
       SET activo = COALESCE($1, activo),
           motivo = COALESCE($2, motivo)
       WHERE id = $3
       RETURNING id, fecha, motivo, activo, creado_en`,
      [typeof activo === 'boolean' ? activo : null, motivo ?? null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Bloqueo no encontrado' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/configuracion', authMiddleware, async (req, res) => {
  try {
    const config = await getCurrentBusinessConfig();
    return res.status(200).json(config);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/configuracion', authMiddleware, async (req, res) => {
  const { hora_apertura, hora_cierre, duracion_turno, dias_habilitados } = req.body;

  if (!hora_apertura || !hora_cierre || !duracion_turno || !Array.isArray(dias_habilitados) || dias_habilitados.length !== 7) {
    return res.status(400).json({ error: 'Debe enviar hora_apertura, hora_cierre, duracion_turno y dias_habilitados (7 días)' });
  }

  const duracion = Number(duracion_turno);
  if (!Number.isInteger(duracion) || duracion <= 0) {
    return res.status(400).json({ error: 'duracion_turno debe ser un entero mayor a 0' });
  }

  if (!generateHoursBetween(hora_apertura, hora_cierre, duracion).length) {
    return res.status(400).json({ error: 'La combinación de horarios y duración no genera turnos válidos' });
  }

  try {
    if (!ensureAdmin(req, res)) return;
    const ownerUserId = await getPublicOwnerUserId();
    const config = await getOrCreateBusinessConfig(ownerUserId);

    await pool.query(
      `UPDATE configuraciones_negocio
       SET hora_apertura = $1,
           hora_cierre = $2,
           duracion_turno = $3,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [normalizeHour(hora_apertura), normalizeHour(hora_cierre), duracion, config.id]
    );

    for (let day = 0; day < 7; day += 1) {
      await pool.query(
        `INSERT INTO configuracion_dias_semana (configuracion_id, dia_semana, habilitado)
         VALUES ($1, $2, $3)
         ON CONFLICT (configuracion_id, dia_semana)
         DO UPDATE SET habilitado = EXCLUDED.habilitado`,
        [config.id, day, Boolean(dias_habilitados[day])]
      );
    }

    const updatedConfig = await getCurrentBusinessConfig();
    return res.status(200).json(updatedConfig);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/desbloqueos', authMiddleware, async (req, res) => {
  const { fecha, motivo } = req.body;
  if (!fecha) {
    return res.status(400).json({ error: 'fecha es obligatoria' });
  }

  try {
    if (!ensureAdmin(req, res)) return;

    await pool.query('UPDATE dias_bloqueados SET activo = false WHERE fecha = $1', [normalizeDateISO(fecha)]);
    const result = await pool.query(
      `INSERT INTO dias_desbloqueados (fecha, motivo, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (fecha)
       DO UPDATE SET motivo = EXCLUDED.motivo, activo = true
       RETURNING id, fecha, motivo, activo, creado_en`,
      [fecha, motivo || 'Desbloqueo manual']
    );

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/desbloqueos', authMiddleware, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const result = await pool.query('SELECT id, fecha, motivo, activo, creado_en FROM dias_desbloqueados ORDER BY fecha ASC');
    const desbloqueos = result.rows.map((item) => ({ ...item, fecha: normalizeDateISO(item.fecha) }));
    return res.status(200).json(desbloqueos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ADMIN / EMPLEADO
app.get('/turnos', authMiddleware, async (req, res) => {
  const { fecha, fechaDesde, fechaHasta, estado } = req.query;

  try {
    let query = 'SELECT id, cliente, apellido, servicio, fecha, hora, estado, creado_en, usuario_id FROM turnos';
    const values = [];
    const conditions = [];

    if (req.user.rol === 'admin') {
      values.push(estado || 'activo');
      conditions.push(`estado = $${values.length}`);
    } else {
      values.push('activo');
      conditions.push(`estado = $${values.length}`);
    }

    if (fecha) {
      values.push(fecha);
      conditions.push(`fecha = $${values.length}`);
    }

    if (fechaDesde) {
      values.push(fechaDesde);
      conditions.push(`fecha >= $${values.length}`);
    }

    if (fechaHasta) {
      values.push(fechaHasta);
      conditions.push(`fecha <= $${values.length}`);
    }

    query += ` WHERE ${conditions.join(' AND ')}`;
    query += ' ORDER BY fecha ASC, hora ASC';

    const resultado = await pool.query(query, values);
    const turnos = resultado.rows.map((turno) => {
      const isOwner = turno.usuario_id === req.user.id;
      const normalizedTurno = {
        id: turno.id,
        cliente: req.user.rol === 'admin' || isOwner ? turno.cliente : 'Reservado',
        apellido: req.user.rol === 'admin' ? turno.apellido : '',
        servicio: turno.servicio,
        fecha: normalizeDateISO(turno.fecha),
        hora: normalizeHour(turno.hora),
        estado: turno.estado,
        creado_en: turno.creado_en,
      };

      if (req.user.rol !== 'admin') {
        return {
          ...normalizedTurno,
          is_owner: isOwner,
          can_cancel: isOwner && canCancelWithAnticipation(turno.fecha, turno.hora),
        };
      }

      return normalizedTurno;
    });

    return res.status(200).json(turnos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/turnos/:id/cancelar', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'El id debe ser un número válido' });
  }

  try {
    if (req.user.rol === 'admin') {
      const result = await pool.query(
        "UPDATE turnos SET estado = 'cancelado' WHERE id = $1 RETURNING id, cliente, apellido, servicio, fecha, hora, estado",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'El turno no existe' });
      }

      return res.status(200).json({ message: 'Turno cancelado correctamente', turno: result.rows[0] });
    }

    const turnoResult = await pool.query(
      'SELECT id, cliente, apellido, servicio, fecha, hora, estado, usuario_id FROM turnos WHERE id = $1',
      [id]
    );

    if (turnoResult.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    const turno = turnoResult.rows[0];

    if (turno.usuario_id !== req.user.id) {
      return res.status(403).json({ error: 'Solo puede cancelar sus propios turnos' });
    }

    if (turno.estado !== 'activo') {
      return res.status(400).json({ error: 'Solo se pueden cancelar turnos activos' });
    }

    if (!canCancelWithAnticipation(turno.fecha, turno.hora)) {
      return res.status(400).json({ error: 'Solo se puede cancelar con al menos 24 horas de anticipación' });
    }

    const result = await pool.query(
      "UPDATE turnos SET estado = 'cancelado' WHERE id = $1 RETURNING id, cliente, apellido, servicio, fecha, hora, estado",
      [id]
    );

    return res.status(200).json({ message: 'Turno cancelado correctamente', turno: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/turnos/:id/completar', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'El id debe ser un número válido' });
  }

  try {
    const result = await pool.query(
      "UPDATE turnos SET estado = 'completado' WHERE id = $1 RETURNING id, cliente, apellido, servicio, fecha, hora, estado",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    return res.status(200).json({ message: 'Turno completado correctamente', turno: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

async function startServer() {
  await ensureDatabaseUpdates();
  // Limpieza automática preparada para futuro:
  // await pool.query(getTurnosCleanupQuery());

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto: ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('No se pudo iniciar la app:', error);
  process.exit(1);
});
