import express from 'express';
import dotenv from "dotenv";
import pool from './db.js';
dotenv.config();

//Variables necesarias
const app = express();
const PORT = Number(process.env.PORT) || 3000;

//middlewares
app.use(express.json());

//Metodos
app.get("/", (req, res) => {
    res.send("Hola Node!")
});

app.post("/turnos", async (req, res) => {
  const { cliente, servicio, fecha, hora } = req.body;
  if (!cliente || !servicio || !fecha || !hora) {
    return res.status(400).json({
      error: "Todos los campos son obligatorios",
    });
  }
  try {
    const result = await pool.query(
      `
      INSERT INTO turnos (cliente, servicio, fecha, hora)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [cliente, servicio, fecha, hora]
    );
    res.status(201).json(result.rows[0]);

  } catch (error) {
    // Manejar error de UNIQUE (fecha, hora)
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Ya existe un turno en esa fecha y hora",
      });
    }
    console.error(error);
    res.status(500).json({
      error: "Error interno del servidor",
    });
  }
});

app.get("/turnos", async (req, res) => {
  const { fecha, cliente } = req.query;

  try {
    let query = "SELECT * FROM turnos";
    let values = [];
    let conditions = [];

    if (fecha) {
      values.push(fecha);
      conditions.push(`fecha = $${values.length}`);
    }

    if (cliente) {
      values.push(cliente);
      conditions.push(`cliente ILIKE $${values.length}`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY fecha ASC, hora ASC";

    const resultado = await pool.query(query, values);

    res.status(200).json(resultado.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.get("/turnos/:id", async (req, res) => {
    const id = Number(req.params.id);
    if(isNaN(id)){
        return res.status(400).json({error: "El id debe ser un numero"})
    }
    try {
        const turno = await pool.query(
            `SELECT * FROM turnos
            WHERE id = $1`, [id]
        );
        if(turno.rows.length === 0){
            return res.status(404).json({error: "El turno no existe"})
        }
        res.status(200).json(turno.rows[0])
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Error en el servidor"})
    }
});

app.put("/turnos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { cliente, servicio, fecha, hora } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  if (!cliente || !servicio || !fecha || !hora) {
    return res.status(400).json({ error: "Debe enviar todos los campos" });
  }

  try {
    // Verificar que exista
    const existe = await pool.query(
      "SELECT * FROM turnos WHERE id = $1",
      [id]
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({ error: "El turno no existe" });
    }

    // Validar conflicto (excluyendo el mismo ID)
    const conflicto = await pool.query(
      `SELECT * FROM turnos
       WHERE fecha = $1 AND hora = $2 AND id != $3`,
      [fecha, hora, id]
    );

    if (conflicto.rows.length > 0) {
      return res.status(400).json({
        error: "Ya existe un turno en esa fecha y hora"
      });
    }

    const actualizado = await pool.query(
      `UPDATE turnos
       SET cliente = $1,
           servicio = $2,
           fecha = $3,
           hora = $4
       WHERE id = $5
       RETURNING *`,
      [cliente, servicio, fecha, hora, id]
    );

    res.json(actualizado.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

app.patch("/turnos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { cliente, servicio, fecha, hora } = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    const turnoActual = await pool.query(
      "SELECT * FROM turnos WHERE id = $1",
      [id]
    );

    if (turnoActual.rows.length === 0) {
      return res.status(404).json({ error: "El turno no existe" });
    }

    const turno = turnoActual.rows[0];

    const nuevaFecha = fecha || turno.fecha;
    const nuevaHora = hora || turno.hora;
    const nuevoCliente = cliente || turno.cliente;
    const nuevoServicio = servicio || turno.servicio;

    if (fecha || hora) {
      const conflicto = await pool.query(
        `SELECT * FROM turnos
         WHERE fecha = $1 AND hora = $2 AND id != $3`,
        [nuevaFecha, nuevaHora, id]
      );

      if (conflicto.rows.length > 0) {
        return res.status(400).json({
          error: "Ya existe un turno en esa fecha y hora"
        });
      }
    }

    const actualizado = await pool.query(
      `UPDATE turnos
       SET cliente = $1,
           servicio = $2,
           fecha = $3,
           hora = $4
       WHERE id = $5
       RETURNING *`,
      [nuevoCliente, nuevoServicio, nuevaFecha, nuevaHora, id]
    );

    res.json(actualizado.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});


app.delete("/turnos/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: "El id debe ser un numero válido" });
  }

  try {
    const result = await pool.query(
      `DELETE FROM turnos
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "El turno no existe" });
    }
    res.status(200).json({
      message: "El turno fue eliminado correctamente",
      turno: result.rows[0],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

app.get("/turnos/disponibles", async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: "Debe enviar una fecha" });
  }

  try {
    const result = await pool.query(
      `SELECT hora FROM turnos WHERE fecha = $1`,
      [fecha]
    );

    const horasOcupadas = result.rows.map(t => t.hora);

    const todasLasHoras = [
      "09:00", "10:00", "11:00",
      "12:00", "13:00", "14:00",
      "15:00", "16:00", "17:00"
    ];

    const disponibles = todasLasHoras.filter(
      h => !horasOcupadas.includes(h + ":00")
    );

    res.json({
      fecha,
      disponibles
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});


//Escuhar Puerto
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto: ${PORT}`)
});

//logs de pruebas
//console.log("PORT:", process.env.PORT);
