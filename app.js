import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from './db.js';
import authMiddleware from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto_en_prod';
const SALT_ROUNDS = 10;

app.use(express.json());
app.use(cors());

/**
 * Devuelve solo la información pública del usuario.
 */
function buildPublicUser(userRow) {
  return {
    id: userRow.id,
    nombre: userRow.nombre,
    email: userRow.email,
    creado_en: userRow.creado_en,
  };
}

/**
 * Crea un JWT con el id del usuario.
 */
function createUserToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '8h' });
}

app.get('/', (_req, res) => {
  res.send('Hola Node!');
});

// --------------------------
// AUTH
// --------------------------

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

// --------------------------
// TURNOS PROTEGIDOS
// --------------------------

app.post('/turnos', authMiddleware, async (req, res) => {
  const { cliente, servicio, fecha, hora } = req.body;

  if (!cliente || !servicio || !fecha || !hora) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO turnos (cliente, servicio, fecha, hora, usuario_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [cliente, servicio, fecha, hora, req.userId]
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

app.get('/turnos', authMiddleware, async (req, res) => {
  const { fecha, cliente } = req.query;

  try {
    let query = 'SELECT * FROM turnos WHERE usuario_id = $1';
    const values = [req.userId];
    const conditions = [];

    if (fecha) {
      values.push(fecha);
      conditions.push(`fecha = $${values.length}`);
    }

    if (cliente) {
      values.push(cliente);
      conditions.push(`cliente ILIKE $${values.length}`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY fecha ASC, hora ASC';

    const resultado = await pool.query(query, values);
    return res.status(200).json(resultado.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/turnos/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'El id debe ser un número válido' });
  }

  try {
    const turno = await pool.query('SELECT * FROM turnos WHERE id = $1', [id]);

    if (turno.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    if (turno.rows[0].usuario_id !== req.userId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    return res.status(200).json(turno.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/turnos/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { cliente, servicio, fecha, hora } = req.body;

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  if (!cliente || !servicio || !fecha || !hora) {
    return res.status(400).json({ error: 'Debe enviar todos los campos' });
  }

  try {
    const existe = await pool.query('SELECT * FROM turnos WHERE id = $1', [id]);

    if (existe.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    if (existe.rows[0].usuario_id !== req.userId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const conflicto = await pool.query(
      `SELECT id FROM turnos
       WHERE fecha = $1 AND hora = $2 AND id != $3`,
      [fecha, hora, id]
    );

    if (conflicto.rows.length > 0) {
      return res.status(400).json({ error: 'Ya existe un turno en esa fecha y hora' });
    }

    const actualizado = await pool.query(
      `UPDATE turnos
       SET cliente = $1,
           servicio = $2,
           fecha = $3,
           hora = $4
       WHERE id = $5 AND usuario_id = $6
       RETURNING *`,
      [cliente, servicio, fecha, hora, id, req.userId]
    );

    return res.status(200).json(actualizado.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.patch('/turnos/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { cliente, servicio, fecha, hora } = req.body;

  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const turnoActual = await pool.query('SELECT * FROM turnos WHERE id = $1', [id]);

    if (turnoActual.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    if (turnoActual.rows[0].usuario_id !== req.userId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const turno = turnoActual.rows[0];
    const nuevaFecha = fecha || turno.fecha;
    const nuevaHora = hora || turno.hora;
    const nuevoCliente = cliente || turno.cliente;
    const nuevoServicio = servicio || turno.servicio;

    if (fecha || hora) {
      const conflicto = await pool.query(
        `SELECT id FROM turnos
         WHERE fecha = $1 AND hora = $2 AND id != $3`,
        [nuevaFecha, nuevaHora, id]
      );

      if (conflicto.rows.length > 0) {
        return res.status(400).json({ error: 'Ya existe un turno en esa fecha y hora' });
      }
    }

    const actualizado = await pool.query(
      `UPDATE turnos
       SET cliente = $1,
           servicio = $2,
           fecha = $3,
           hora = $4
       WHERE id = $5 AND usuario_id = $6
       RETURNING *`,
      [nuevoCliente, nuevoServicio, nuevaFecha, nuevaHora, id, req.userId]
    );

    return res.status(200).json(actualizado.rows[0]);
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
    const turno = await pool.query('SELECT * FROM turnos WHERE id = $1', [id]);

    if (turno.rows.length === 0) {
      return res.status(404).json({ error: 'El turno no existe' });
    }

    if (turno.rows[0].usuario_id !== req.userId) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await pool.query(
      `DELETE FROM turnos
       WHERE id = $1 AND usuario_id = $2
       RETURNING *`,
      [id, req.userId]
    );

    return res.status(200).json({
      message: 'El turno fue eliminado correctamente',
      turno: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/turnos/disponibles', async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'Debe enviar una fecha' });
  }

  try {
    const result = await pool.query('SELECT hora FROM turnos WHERE fecha = $1', [fecha]);

    const horasOcupadas = result.rows.map((t) => t.hora);
    const todasLasHoras = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

    const disponibles = todasLasHoras.filter((h) => !horasOcupadas.includes(`${h}:00`));

    return res.status(200).json({ fecha, disponibles });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto: ${PORT}`);
});
