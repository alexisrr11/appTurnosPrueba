ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS celular VARCHAR(20);

CREATE TABLE IF NOT EXISTS negocios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  fecha_inicio_prueba DATE NOT NULL,
  fecha_fin_prueba DATE NOT NULL,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS negocio_id INTEGER REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS negocio_id INTEGER REFERENCES negocios(id) ON DELETE CASCADE;

ALTER TABLE configuraciones_negocio DROP CONSTRAINT IF EXISTS configuraciones_negocio_owner_user_id_key;
ALTER TABLE configuraciones_negocio ADD COLUMN IF NOT EXISTS negocio_id INTEGER REFERENCES negocios(id) ON DELETE CASCADE;

ALTER TABLE dias_bloqueados ADD COLUMN IF NOT EXISTS negocio_id INTEGER REFERENCES negocios(id) ON DELETE CASCADE;
ALTER TABLE dias_desbloqueados ADD COLUMN IF NOT EXISTS negocio_id INTEGER REFERENCES negocios(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS turnos_unicos_activos;
CREATE UNIQUE INDEX IF NOT EXISTS turnos_unicos_activos
ON turnos (fecha, hora, negocio_id)
WHERE estado = 'activo';
