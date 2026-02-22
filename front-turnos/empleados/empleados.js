const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';
let calendar;
let cacheTurnos = [];
let cacheBloqueos = [];
let cacheConfig = null;

const btnConfiguraciones = document.getElementById('btn-configuraciones');
const configuraciones = document.getElementById('configuraciones');
const contenedorBuscarCliente = document.getElementById('contenedor-buscar-cliente');
const btnBuscarCliente = document.getElementById('btn-buscar-cliente');

const listaHoy = document.getElementById('turnosHoy');
const listaManana = document.getElementById('turnosManana');

const inputNombre = document.getElementById('filtroNombre');
const inputFecha = document.getElementById('filtroFecha');

function abrirContenedores(btn, contenedor) {
  btn.addEventListener('click', () => {
    contenedor.classList.toggle('hidden');
    btn.textContent = contenedor.classList.contains('hidden') ? '➕' : '➖';
  });
}

abrirContenedores(btnConfiguraciones, configuraciones);
abrirContenedores(btnBuscarCliente, contenedorBuscarCliente);

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

function showMessage(message, isError = true) {
  const box = document.getElementById('mensaje');
  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700');
}

function normalizeTurnoDate(turno) {
  return String(turno.fecha).slice(0, 10);
}

function turnosToEvents(turnos) {
  return turnos.map((turno) => ({
    id: String(turno.id),
    title: `${turno.cliente} ${turno.apellido} (${turno.celular || 'sin celular'}) - ${turno.servicio}`,
    start: `${normalizeTurnoDate(turno)}T${String(turno.hora).slice(0, 8)}`,
    backgroundColor: turno.estado === 'cancelado' ? '#9ca3af' : '#2563eb',
    borderColor: turno.estado === 'cancelado' ? '#6b7280' : '#1d4ed8',
    extendedProps: { estado: turno.estado },
  }));
}

function buildBackgroundEvents(feriados, bloqueos, config = cacheConfig) {
  const feriadosBg = feriados.map((h) => ({
    display: 'background',
    start: h.date,
    allDay: true,
    backgroundColor: '#fee2e2',
    title: 'Feriado',
  }));

  const bloqueosBg = bloqueos.filter((b) => b.activo).map((b) => ({
    display: 'background',
    start: b.fecha,
    allDay: true,
    backgroundColor: '#e5e7eb',
    title: 'Día bloqueado',
  }));

  const diasDeshabilitados = [];
  if (config?.dias_habilitados?.length === 7) {
    for (let i = 0; i < 90; i += 1) {
      const base = new Date();
      base.setHours(0, 0, 0, 0);
      base.setDate(base.getDate() + i);
      const day = base.getDay();
      if (!config.dias_habilitados[day]) {
        diasDeshabilitados.push({
          display: 'background',
          start: base.toISOString().slice(0, 10),
          allDay: true,
          backgroundColor: '#fef3c7',
          title: 'Día deshabilitado por configuración semanal',
        });
      }
    }
  }

  return [...feriadosBg, ...bloqueosBg, ...diasDeshabilitados];
}

function renderListas(turnos) {
  listaHoy.innerHTML = '';
  listaManana.innerHTML = '';

  const hoy = new Date();
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);

  const hoyStr = hoy.toISOString().slice(0, 10);
  const mananaStr = manana.toISOString().slice(0, 10);

  const turnosHoy = turnos.filter((t) => normalizeTurnoDate(t) === hoyStr);
  const turnosManana = turnos.filter((t) => normalizeTurnoDate(t) === mananaStr);

  renderItems(turnosHoy, listaHoy);
  renderItems(turnosManana, listaManana);
}

function renderItems(turnos, contenedor) {
  if (turnos.length === 0) {
    contenedor.innerHTML = '<li class="text-slate-400">Sin turnos</li>';
    return;
  }

  turnos.forEach((turno) => {
    const li = document.createElement('li');
    li.className = `p-3 rounded-lg flex justify-between items-center ${turno.estado === 'cancelado' ? 'bg-slate-200' : 'bg-slate-50'}`;

    li.innerHTML = `
      <div>
        <p class="font-medium">${turno.cliente} ${turno.apellido}</p>
        <p class="text-sm text-slate-500">
          ${turno.servicio} - ${String(turno.hora).slice(0, 5)} - ${turno.estado} - ${turno.celular || 'sin celular'}
        </p>
      </div>
      <button data-id="${turno.id}" 
        class="cancelarTurno bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 ${turno.estado === 'cancelado' ? 'hidden' : ''}">
        Cancelar
      </button>
    `;

    contenedor.appendChild(li);
  });
}

function aplicarFiltrosLocales() {
  let filtrados = [...cacheTurnos];

  const nombre = inputNombre.value.toLowerCase().trim();
  const fecha = inputFecha.value;

  if (nombre) {
    filtrados = filtrados.filter((t) => `${t.cliente} ${t.apellido}`.toLowerCase().includes(nombre));
  }

  if (fecha) {
    filtrados = filtrados.filter((t) => normalizeTurnoDate(t) === fecha);
  }

  renderListas(filtrados);
  renderCalendar(filtrados);
}

async function fetchTurnos() {
  const [activosResp, canceladosResp] = await Promise.all([
    fetch(`${API_BASE_URL}/turnos?estado=activo`, { method: 'GET', headers: authHeaders() }),
    fetch(`${API_BASE_URL}/turnos?estado=cancelado`, { method: 'GET', headers: authHeaders() }),
  ]);

  const activos = await activosResp.json().catch(() => ([]));
  const cancelados = await canceladosResp.json().catch(() => ([]));

  if (!activosResp.ok) throw new Error(activos.error || 'Error al cargar turnos activos');
  if (!canceladosResp.ok) throw new Error(cancelados.error || 'Error al cargar turnos cancelados');

  return [...activos, ...cancelados];
}

async function fetchBloqueos() {
  const response = await fetch(`${API_BASE_URL}/bloqueos`);
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.error || 'Error cargando bloqueos');
  return data;
}

async function fetchConfiguracion() {
  const response = await fetch(`${API_BASE_URL}/configuracion`, { method: 'GET', headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error cargando configuración');
  return data;
}

async function guardarConfiguracion(payload) {
  const response = await fetch(`${API_BASE_URL}/configuracion`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo guardar la configuración');
  return data;
}

async function desbloquearDia(fecha, motivo) {
  const response = await fetch(`${API_BASE_URL}/desbloqueos`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ fecha, motivo }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo desbloquear el día');
  return data;
}

function cargarConfiguracionEnFormulario(config) {
  if (!config) return;
  document.getElementById('horaApertura').value = String(config.hora_apertura || '09:00').slice(0, 5);
  document.getElementById('horaCierre').value = String(config.hora_cierre || '18:00').slice(0, 5);
  document.getElementById('duracionTurno').value = Number(config.duracion_turno || 60);

  for (let i = 0; i < 7; i += 1) {
    const select = document.getElementById(`diaSemana${i}`);
    if (select) {
      select.value = config.dias_habilitados?.[i] ? 'true' : 'false';
    }
  }
}

function leerConfiguracionDesdeFormulario() {
  const dias = [];
  for (let i = 0; i < 7; i += 1) {
    dias.push(document.getElementById(`diaSemana${i}`)?.value === 'true');
  }

  return {
    hora_apertura: document.getElementById('horaApertura').value,
    hora_cierre: document.getElementById('horaCierre').value,
    duracion_turno: Number(document.getElementById('duracionTurno').value),
    dias_habilitados: dias,
  };
}

async function fetchRefreshData() {
  const response = await fetch(`${API_BASE_URL}/refresh`, { method: 'GET', headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error al refrescar datos');
  return data;
}

async function fetchFeriados(year) {
  const response = await fetch(`${API_BASE_URL}/feriados?year=${year}`);
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data.error || 'Error cargando feriados');
  return data;
}

async function loadTurnos() {
  const [turnos, bloqueos, feriados, config] = await Promise.all([
    fetchTurnos(),
    fetchBloqueos(),
    fetchFeriados(new Date().getFullYear()),
    fetchConfiguracion(),
  ]);

  cacheTurnos = turnos;
  cacheBloqueos = bloqueos;
  cacheConfig = config;
  cargarConfiguracionEnFormulario(config);
  renderListas(turnos);
  renderCalendar(turnos, feriados, bloqueos, config);
}

async function validarAdmin() {
  const response = await fetch(`${API_BASE_URL}/me`, {
    method: 'GET',
    headers: authHeaders(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo validar sesión');

  if (data?.usuario?.rol !== 'admin') {
    throw new Error('Acceso denegado. Este panel es solo para admin.');
  }
}

async function cancelarTurno(id) {
  const response = await fetch(`${API_BASE_URL}/turnos/${id}/cancelar`, {
    method: 'PATCH',
    headers: authHeaders(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo cancelar');
  return data;
}

async function crearBloqueo(fecha, motivo) {
  const response = await fetch(`${API_BASE_URL}/bloqueos`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ fecha, motivo }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo bloquear el día');
  return data;
}

function bindEvents() {
  document.getElementById('aplicarFiltros').addEventListener('click', aplicarFiltrosLocales);

  document.getElementById('limpiarFiltros').addEventListener('click', () => {
    inputNombre.value = '';
    inputFecha.value = '';
    renderListas(cacheTurnos);
    renderCalendar(cacheTurnos, [], cacheBloqueos, cacheConfig);
  });

  inputNombre.addEventListener('input', aplicarFiltrosLocales);

  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('.cancelarTurno');
    if (!btn) return;

    const id = btn.dataset.id;
    if (!confirm('¿Cancelar turno?')) return;

    try {
      await cancelarTurno(id);
      showMessage('Turno cancelado correctamente', false);
      await loadTurnos();
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  document.getElementById('guardarConfiguracion').addEventListener('click', async () => {
    try {
      const payload = leerConfiguracionDesdeFormulario();
      cacheConfig = await guardarConfiguracion(payload);
      showMessage('Configuración semanal guardada correctamente', false);
      await loadTurnos();
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.getElementById('bloquearDia').addEventListener('click', async () => {
    const fecha = document.getElementById('fechaBloqueo').value;
    if (!fecha) {
      showMessage('Seleccioná una fecha para bloquear', true);
      return;
    }

    try {
      await crearBloqueo(fecha, 'Bloqueo manual');
      showMessage('Día bloqueado correctamente', false);
      await loadTurnos();
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.getElementById('desbloquearDia').addEventListener('click', async () => {
    const fecha = document.getElementById('fechaBloqueo').value;
    if (!fecha) {
      showMessage('Seleccioná una fecha para desbloquear', true);
      return;
    }

    try {
      await desbloquearDia(fecha, 'Desbloqueo manual');
      showMessage('Día desbloqueado correctamente', false);
      await loadTurnos();
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.getElementById('btn-actualizar-datos').addEventListener('click', async () => {
    try {
      const data = await fetchRefreshData();
      cacheTurnos = data.turnos || [];
      cacheConfig = data.configuracion || cacheConfig;
      renderListas(cacheTurnos);
      renderCalendar(cacheTurnos, [], cacheBloqueos, cacheConfig);
      showMessage('Datos actualizados correctamente', false);
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    const confirmar = confirm('¿Seguro que querés cerrar sesión?');
    if (!confirmar) return;

    localStorage.removeItem(TOKEN_KEY);
    setTimeout(() => {
      window.location.href = './login.html';
    }, 500);
  });
}

function renderCalendar(turnos, feriados = [], bloqueos = cacheBloqueos, config = cacheConfig) {
  calendar.removeAllEvents();
  calendar.addEventSource(turnosToEvents(turnos));
  calendar.addEventSource(buildBackgroundEvents(feriados, bloqueos, config));
}

function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    locale: 'es',
    height: 600,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },

    eventClick: async function (info) {
      if (info.event.display === 'background') return;
      if (info.event.extendedProps.estado === 'cancelado') return;

      const id = info.event.id;

      const confirmado = confirm(`¿Querés cancelar este turno?\n\n${info.event.title}`);
      if (!confirmado) return;

      try {
        await cancelarTurno(id);
        showMessage('Turno cancelado correctamente', false);
        await loadTurnos();
      } catch (error) {
        showMessage(error.message, true);
      }
    }
  });

  calendar.render();
}

async function bootstrap() {
  if (!getToken()) {
    window.location.href = './login.html';
    return;
  }

  initCalendar();
  bindEvents();
  await validarAdmin();
  await loadTurnos();
}

document.addEventListener('DOMContentLoaded', bootstrap);
