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
const HORARIOS_BASE = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

app.use(express.json());
app.use(cors());
app.use(express.static('front-turnos'));
app.use('/empleado', express.static('front-turnos/empleados'));

function buildPublicUser(userRow) {
  return {
    id: userRow.id,
    nombre: userRow.nombre,
    email: userRow.email,
    creado_en: userRow.creado_en,
  };
}

function createUserToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '8h' });
}

function normalizeHour(hora) {
  return String(hora || '').slice(0, 5);
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getPublicOwnerUserId() {
  const user = await pool.query('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1');
  if (user.rows.length === 0) {
    return null;
  }
  return user.rows[0].id;
}

app.get('/', (_req, res) => {
  res.sendFile(new URL('./front-turnos/index.html', import.meta.url).pathname);
});

// AUTH
app.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body;

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

    const nuevoUsuario = await pool.query(
      `INSERT INTO usuarios (nombre, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, nombre, email, creado_en`,
      [nombre.trim(), emailNormalizado, passwordHasheado]
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
      `SELECT id, nombre, email, password, creado_en
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

    const token = createUserToken(usuarioDB.id);

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
    const user = await pool.query('SELECT id, nombre, email, creado_en FROM usuarios WHERE id = $1', [req.userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    return res.status(200).json({ usuario: user.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// CLIENTE PÚBLICO
app.post('/turnos/publico', async (req, res) => {
  const { cliente, servicio, fecha, hora } = req.body;

  if (!cliente || !servicio || !fecha || !hora) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const ownerId = await getPublicOwnerUserId();
    if (!ownerId) {
      return res.status(500).json({ error: 'No hay usuarios administrativos creados para registrar turnos.' });
    }

    const result = await pool.query(
      `INSERT INTO turnos (cliente, servicio, fecha, hora, usuario_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, cliente, servicio, fecha, hora, creado_en`,
      [cliente.trim(), servicio.trim(), fecha, hora, ownerId]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Ya existe un turno en esa fecha y hora' });
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
    const result = await pool.query('SELECT hora FROM turnos WHERE fecha = $1 ORDER BY hora ASC', [fecha]);
    const horasOcupadas = result.rows.map((row) => normalizeHour(row.hora));
    const disponibles = HORARIOS_BASE.filter((h) => !horasOcupadas.includes(h));

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
       WHERE fecha >= $1
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

    const diasDisponibles = Object.keys(ocupadosPorFecha).filter(
      (fecha) => ocupadosPorFecha[fecha].length < HORARIOS_BASE.length
    );

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

// ADMIN / EMPLEADO
app.get('/turnos', authMiddleware, async (req, res) => {
  const { fecha, fechaDesde, fechaHasta } = req.query;

  try {
    let query = 'SELECT id, cliente, servicio, fecha, hora, creado_en FROM turnos';
    const values = [];
    const conditions = [];

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

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY fecha ASC, hora ASC';

    const resultado = await pool.query(query, values);
    const turnos = resultado.rows.map((turno) => ({
      ...turno,
      fecha: normalizeDateISO(turno.fecha),
      hora: normalizeHour(turno.hora),
    }));

    return res.status(200).json(turnos);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.delete('/turnos/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'El id debe ser un número válido' });
  }

  try {
    const result = await pool.query('DELETE FROM turnos WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    return res.status(200).json({
      message: 'El turno fue eliminado correctamente',
      turno: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto: ${PORT}`);
});
