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
  const hora = turno.hora?.slice(0, 8) || '00:00:00';
  return {
    id: String(turno.id),
    start: `${turno.fecha}T${hora}`,
    extendedProps: {
      servicio: turno.servicio,
      fecha: turno.fecha,
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
    eventClick: (info) => {
      const event = info.event;
      alert(`Turno: ${event.title}\nFecha: ${event.start.toISOString().slice(0, 10)}\nHora: ${event.start.toISOString().slice(11, 16)}`);
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
    await apiFetch('/turnos/publico', {
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
    const confirmar = confirm("¿Seguro que querés cerrar sesión?");
    if (!confirmar) return;

    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'login/login.html';
  });

}

function generarOpcionesHora() {
  const selectHora = document.getElementById("hora");
  if (!selectHora) return;

  selectHora.innerHTML = "";

  const horaInicio = 9;   // 09:00
  const horaFin = 18;     // 18:00
  const intervalo = 60;   // minutos

  for (let h = horaInicio; h < horaFin; h++) {
    for (let m = 0; m < 60; m += intervalo) {

      const hora = String(h).padStart(2, "0");
      const minuto = String(m).padStart(2, "0");

      const option = document.createElement("option");
      option.value = `${hora}:${minuto}`;
      option.textContent = `${hora}:${minuto}`;

      selectHora.appendChild(option);
    }
  }
}

async function bootstrap() {
  setupUiEvents();
  initCalendar();
  generarOpcionesHora();

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
