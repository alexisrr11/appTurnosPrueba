const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';

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
  const box = document.getElementById('turnoAlert');
  if (!box) return;

  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

/**
 * Wrapper de fetch:
 * - Siempre usa API en http://localhost:3000
 * - Si includeAuth = true agrega Authorization: Bearer <token>
 * - Devuelve JSON o lanza error con mensaje del backend
 */
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

    // Ejemplo explícito de envío de token JWT al backend.
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }

  return data;
}

function mapTurnoToEvent(turno) {
  const fecha = String(turno.fecha || '').slice(0, 10);
  const hora = String(turno.hora || '').slice(0, 8) || '00:00:00';

  if (!fecha) {
    throw new Error('El turno no tiene una fecha válida para renderizarse en el calendario.');
  }

  return {
    id: String(turno.id),
    title: `${turno.cliente} - ${turno.servicio}`,
    start: `${fecha}T${hora}`,
    extendedProps: {
      cliente: turno.cliente,
      servicio: turno.servicio,
      fecha,
      hora
    }
  };
}

async function loadTurnosIntoCalendar() {
  const turnos = await apiFetch('/turnos', { method: 'GET' }, true);
  const events = turnos.map(mapTurnoToEvent);

  calendar.removeAllEvents();
  calendar.addEventSource(events);
}

async function deleteTurno(turnoId) {
  await apiFetch(`/turnos/${turnoId}`, { method: 'DELETE' }, true);
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
      const event = info.event;
      const ok = window.confirm(`¿Eliminar el turno de ${event.extendedProps.cliente} (${event.extendedProps.servicio})?`);

      if (!ok) return;

      try {
        await deleteTurno(event.id);
        showAuthState('Turno eliminado correctamente.');
      } catch (error) {
        showAuthState(error.message, true);
      }
    }
  });

  calendar.render();
}

function openModal() {
  document.getElementById('modalTurno')?.classList.remove('hidden');
  document.getElementById('modalTurno')?.classList.add('flex');
}

function closeModal() {
  const modal = document.getElementById('modalTurno');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  document.getElementById('formTurno')?.reset();
  document.getElementById('turnoAlert')?.classList.add('hidden');
}

async function handleCreateTurno(event) {
  event.preventDefault();

  const cliente = document.getElementById('cliente')?.value?.trim();
  const servicio = document.getElementById('servicio')?.value?.trim();
  const fecha = document.getElementById('fecha')?.value;
  const horaRaw = document.getElementById('hora')?.value;
  const hora = horaRaw && horaRaw.length === 5 ? `${horaRaw}:00` : horaRaw;

  try {
    await apiFetch('/turnos', {
      method: 'POST',
      body: JSON.stringify({ cliente, servicio, fecha, hora })
    }, true);

    showTurnoMessage('Turno creado correctamente.', false);
    await loadTurnosIntoCalendar();

    setTimeout(() => {
      closeModal();
      showAuthState('Calendario actualizado.');
    }, 500);
  } catch (error) {
    showTurnoMessage(error.message, true);
  }
}

function setupUiEvents() {
  document.getElementById('btnNuevoTurno')?.addEventListener('click', openModal);
  document.getElementById('cerrarModal')?.addEventListener('click', closeModal);
  document.getElementById('cancelarTurno')?.addEventListener('click', closeModal);
  document.getElementById('formTurno')?.addEventListener('submit', handleCreateTurno);

  document.getElementById('btnLogout')?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'login/login.html';
  });
}

async function bootstrap() {
  setupUiEvents();
  initCalendar();

  const token = getToken();
  if (!token) {
    showAuthState('No hay sesión activa. Redirigiendo al login...', true);
    setTimeout(() => {
      window.location.href = 'login/login.html';
    }, 900);
    return;
  }

  try {
    await loadTurnosIntoCalendar();
    showAuthState('Sesión autenticada.');
  } catch (error) {
    showAuthState(error.message, true);

    if (error.message.toLowerCase().includes('token') || error.message.toLowerCase().includes('denegado')) {
      localStorage.removeItem(TOKEN_KEY);
      setTimeout(() => {
        window.location.href = 'login/login.html';
      }, 900);
    }
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
