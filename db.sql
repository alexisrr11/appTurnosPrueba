-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de turnos con relación a usuarios
CREATE TABLE IF NOT EXISTS turnos (
  id SERIAL PRIMARY KEY,
  cliente VARCHAR(100) NOT NULL,
  servicio VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fecha, hora)
);

-- Alter para bases ya existentes
ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS usuario_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_turnos_usuario'
  ) THEN
    ALTER TABLE turnos
    ADD CONSTRAINT fk_turnos_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE CASCADE;
  END IF;
END $$;
