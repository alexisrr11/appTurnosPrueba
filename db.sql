-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin','user')) DEFAULT 'user',
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de turnos con relación a usuarios
CREATE TABLE IF NOT EXISTS turnos (
  id SERIAL PRIMARY KEY,
  cliente VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  servicio VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  estado VARCHAR(20) CHECK (estado IN ('activo','cancelado','completado')) DEFAULT 'activo',
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS turnos_unicos_activos
ON turnos (fecha, hora)
WHERE estado = 'activo';

CREATE TABLE IF NOT EXISTS dias_bloqueados (
  id SERIAL PRIMARY KEY,
  fecha DATE UNIQUE NOT NULL,
  motivo VARCHAR(255),
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alter para bases ya existentes (sin perder datos)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellido VARCHAR(100);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) CHECK (rol IN ('admin','user')) DEFAULT 'user';
UPDATE usuarios SET apellido = '' WHERE apellido IS NULL;
UPDATE usuarios SET rol = 'user' WHERE rol IS NULL;
ALTER TABLE usuarios ALTER COLUMN apellido SET DEFAULT '';
ALTER TABLE usuarios ALTER COLUMN apellido SET NOT NULL;
ALTER TABLE usuarios ALTER COLUMN rol SET DEFAULT 'user';
ALTER TABLE usuarios ALTER COLUMN rol SET NOT NULL;
ALTER TABLE usuarios ALTER COLUMN apellido DROP DEFAULT;

ALTER TABLE turnos ADD COLUMN IF NOT EXISTS usuario_id INTEGER;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS apellido VARCHAR(100);
UPDATE turnos SET apellido = cliente WHERE apellido IS NULL OR apellido = '';
ALTER TABLE turnos ALTER COLUMN apellido SET NOT NULL;
ALTER TABLE turnos
ADD COLUMN IF NOT EXISTS estado VARCHAR(20)
CHECK (estado IN ('activo','cancelado','completado')) DEFAULT 'activo';

DO $$
DECLARE c_name text;
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

-- Limpieza futura (NO ejecutar automáticamente):
-- DELETE FROM turnos
-- WHERE creado_en < NOW() - INTERVAL '3 years';
