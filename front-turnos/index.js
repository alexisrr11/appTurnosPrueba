const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';
const HOLIDAY_COLOR = '#fee2e2';
const BLOCKED_COLOR = '#e5e7eb';

let calendar;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function showAuthState(message, isError = false) {
  const box = document.getElementById('estadoAuth');
  if (!box) return;

  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-yellow-100', 'text-yellow-700');

  if (isError) {
    box.classList.add('bg-red-100', 'text-red-700');
  } else {
    box.classList.add('bg-green-100', 'text-green-700');
  }
}

function showTurnoMessage(message, isError = true) {
  const box = document.getElementById('turnoAlert') || document.getElementById('mensaje');
  if (!box) return;

  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

async function apiFetch(path, options = {}, includeAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (includeAuth) {
    const token = getToken();
    if (!token) {
      throw new Error('No hay token. Iniciá sesión nuevamente.');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }

  return data;
}

function mapTurnoToEvent(turno) {
  const hora = turno.hora?.slice(0, 8) || '00:00:00';
  return {
    id: String(turno.id),
    title: `${turno.cliente} ${turno.apellido} - ${turno.servicio}`,
    start: `${turno.fecha}T${hora}`,
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  };
}

function buildBackgroundEvents(holidays = [], bloqueos = []) {
  const feriados = holidays.map((holiday) => ({
    display: 'background',
    start: holiday.date,
    end: holiday.date,
    allDay: true,
    backgroundColor: HOLIDAY_COLOR,
    title: 'Feriado',
  }));

  const diasBloqueados = bloqueos
    .filter((bloqueo) => bloqueo.activo)
    .map((bloqueo) => ({
      display: 'background',
      start: bloqueo.fecha,
      end: bloqueo.fecha,
      allDay: true,
      backgroundColor: BLOCKED_COLOR,
      title: 'Día bloqueado',
    }));

  return [...feriados, ...diasBloqueados];
}

async function loadTurnosIntoCalendar() {
  const year = new Date().getFullYear();
  const [turnos, feriados, bloqueos] = await Promise.all([
    apiFetch('/turnos', { method: 'GET' }, true),
    apiFetch(`/feriados?year=${year}`),
    apiFetch('/bloqueos')
  ]);

  const events = turnos.map(mapTurnoToEvent);
  const backgrounds = buildBackgroundEvents(feriados, bloqueos);

  calendar.removeAllEvents();
  calendar.addEventSource(events);
  calendar.addEventSource(backgrounds);
}

async function cancelarTurno(turnoId) {
  await apiFetch(`/turnos/${turnoId}/cancelar`, { method: 'PATCH' }, true);
  await loadTurnosIntoCalendar();
}

function initCalendar() {
  const calendarEl = document.getElementById('calendar');

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    locale: 'es',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    eventClick: async (info) => {
      if (info.event.display === 'background') return;
      const event = info.event;
      const confirmar = confirm(`¿Querés cancelar tu turno?\n${event.title}`);
      if (!confirmar) return;

      try {
        await cancelarTurno(event.id);
        showTurnoMessage('Turno cancelado correctamente.', false);
      } catch (error) {
        showTurnoMessage(error.message, true);
      }
    }
  });

  calendar.render();
}

async function handleCreateTurno(event) {
  event.preventDefault();

  const cliente = document.getElementById('cliente')?.value?.trim();
  const apellido = document.getElementById('apellido')?.value?.trim();
  const servicio = document.getElementById('servicio')?.value?.trim();
  const fecha = document.getElementById('fecha')?.value;
  const horaRaw = document.getElementById('hora')?.value;
  const hora = horaRaw && horaRaw.length === 5 ? `${horaRaw}:00` : horaRaw;

  try {
    await apiFetch('/turnos/publico', {
      method: 'POST',
      body: JSON.stringify({ cliente, apellido, servicio, fecha, hora })
    });

    showTurnoMessage('Turno creado correctamente.', false);
    await loadTurnosIntoCalendar();
    document.getElementById('formTurno')?.reset();
  } catch (error) {
    showTurnoMessage(error.message, true);
  }
}

function setupUiEvents() {
  document.getElementById('formTurno')?.addEventListener('submit', handleCreateTurno);

  document.getElementById('btnLogout')?.addEventListener('click', () => {
    const confirmar = confirm('¿Seguro que querés cerrar sesión?');
    if (!confirmar) return;

    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'login/login.html';
  });
}

function generarOpcionesHora() {
  const selectHora = document.getElementById('hora');
  if (!selectHora) return;

  selectHora.innerHTML = '';

  for (let h = 9; h < 18; h += 1) {
    const hora = String(h).padStart(2, '0');
    const option = document.createElement('option');
    option.value = `${hora}:00`;
    option.textContent = `${hora}:00`;
    selectHora.appendChild(option);
  }
}

async function bootstrap() {
  setupUiEvents();
  initCalendar();
  generarOpcionesHora();

  try {
    await loadTurnosIntoCalendar();
    showAuthState('Calendario cargado.');
  } catch (error) {
    showAuthState(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
