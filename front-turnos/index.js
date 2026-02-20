const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';
const HOLIDAY_COLOR = '#fee2e2';
const BLOCKED_COLOR = '#e5e7eb';
const OWN_TURNO_COLOR = '#2563eb';
const RESERVED_TURNO_COLOR = '#9ca3af';

let calendar;
let currentUser = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function showAuthState(message, isError = false) {
  const box = document.getElementById('estadoAuth');
  if (!box) return;

  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

function showTurnoMessage(message, isError = true) {
  const box = document.getElementById('mensaje');
  if (!box) return;

  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

async function apiFetch(path, options = {}, includeAuth = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (includeAuth) {
    const token = getToken();
    if (!token) {
      throw new Error('No hay sesión activa.');
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

function formatHour(hora) {
  return String(hora || '').slice(0, 5);
}

function mapTurnoToEvent(turno) {
  const hora = turno.hora?.slice(0, 8) || '00:00:00';
  const isOwner = Boolean(turno.is_owner);

  return {
    id: String(turno.id),
    title: isOwner ? turno.servicio : 'Reservado',
    start: `${turno.fecha}T${hora}`,
    backgroundColor: isOwner ? OWN_TURNO_COLOR : RESERVED_TURNO_COLOR,
    borderColor: isOwner ? '#1d4ed8' : '#6b7280',
    textColor: '#ffffff',
    extendedProps: {
      isOwner,
      canCancel: Boolean(turno.can_cancel),
      servicio: turno.servicio,
      fecha: turno.fecha,
      hora: formatHour(turno.hora),
    },
  };
}

function buildBackgroundEvents(holidays = [], bloqueos = []) {
  const feriados = holidays.map((holiday) => ({
    display: 'background',
    start: holiday.date,
    allDay: true,
    backgroundColor: HOLIDAY_COLOR,
    title: 'Feriado',
  }));

  const diasBloqueados = bloqueos
    .filter((bloqueo) => bloqueo.activo)
    .map((bloqueo) => ({
      display: 'background',
      start: bloqueo.fecha,
      allDay: true,
      backgroundColor: BLOCKED_COLOR,
      title: 'Día bloqueado',
    }));

  return [...feriados, ...diasBloqueados];
}

function renderTurnosList(turnos) {
  const list = document.getElementById('turnosLista');
  if (!list) return;

  list.innerHTML = '';

  if (!turnos.length) {
    list.innerHTML = '<li class="text-slate-400">Sin turnos registrados.</li>';
    return;
  }

  turnos.forEach((turno) => {
    const isOwner = Boolean(turno.is_owner);
    const item = document.createElement('li');
    item.className = `rounded-lg border p-3 flex items-center justify-between gap-3 ${isOwner ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-100'}`;

    const detail = document.createElement('div');
    detail.innerHTML = `
      <p class="font-medium ${isOwner ? 'text-blue-700' : 'text-slate-600'}">${isOwner ? turno.servicio : 'Reservado'}</p>
      <p class="text-sm text-slate-500">${turno.fecha} · ${formatHour(turno.hora)}</p>
    `;

    item.appendChild(detail);

    if (isOwner) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.dataset.id = String(turno.id);
      cancelButton.className = 'cancelarTurno rounded-md px-3 py-1 text-sm text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-400';
      cancelButton.disabled = !turno.can_cancel;
      cancelButton.textContent = turno.can_cancel ? 'Cancelar' : 'No cancelable (<24h)';
      item.appendChild(cancelButton);
    }

    list.appendChild(item);
  });
}

async function cancelTurno(id) {
  return apiFetch(`/turnos/${id}/cancelar`, { method: 'PATCH' }, true);
}

async function loadTurnosIntoCalendar() {
  const year = new Date().getFullYear();
  const [turnos, feriados, bloqueos] = await Promise.all([
    apiFetch('/turnos', { method: 'GET' }, true),
    apiFetch(`/feriados?year=${year}`),
    apiFetch('/bloqueos'),
  ]);


  const events = turnos.map(mapTurnoToEvent);
  const backgrounds = buildBackgroundEvents(feriados, bloqueos);

  calendar.removeAllEvents();
  calendar.addEventSource(events);
  calendar.addEventSource(backgrounds);
  renderTurnosList(turnos);
}

function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    locale: 'es',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    eventClick: async (info) => {
      if (info.event.display === 'background') return;

      const { isOwner, servicio, fecha, hora, canCancel } = info.event.extendedProps;
      if (!isOwner) return;

      alert(`Turno\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}`);

      if (!canCancel) {
        showTurnoMessage('Solo se puede cancelar con al menos 24 horas de anticipación.', true);
        return;
      }

      const confirmCancel = confirm('¿Querés cancelar tu turno?');
      if (!confirmCancel) return;

      try {
        await cancelTurno(info.event.id);
        showTurnoMessage('Turno cancelado correctamente.', false);
        await loadTurnosIntoCalendar();
      } catch (error) {
        showTurnoMessage(error.message, true);
      }
    },
  });

  calendar.render();
}

async function handleCreateTurno(event) {
  event.preventDefault();

  const servicio = document.getElementById('servicio')?.value?.trim();
  const fecha = document.getElementById('fecha')?.value;
  const horaRaw = document.getElementById('hora')?.value;
  const hora = horaRaw && horaRaw.length === 5 ? `${horaRaw}:00` : horaRaw;

  try {
    await apiFetch('/turnos', {
      method: 'POST',
      body: JSON.stringify({ servicio, fecha, hora }),
    }, true);

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
    if (!confirm('¿Seguro que querés cerrar sesión?')) return;
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'login/login.html';
  });

  document.getElementById('turnosLista')?.addEventListener('click', async (event) => {
    const button = event.target.closest('.cancelarTurno');
    if (!button) return;

    const turnoId = button.dataset.id;
    if (!turnoId) return;

    if (!confirm('¿Querés cancelar tu turno?')) return;

    try {
      await cancelTurno(turnoId);
      showTurnoMessage('Turno cancelado correctamente.', false);
      await loadTurnosIntoCalendar();
    } catch (error) {
      showTurnoMessage(error.message, true);
    }
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
  const token = getToken();
  if (!token) {
    window.location.href = 'login/login.html';
    return;
  }

  setupUiEvents();
  initCalendar();
  generarOpcionesHora();

  try {
    const meData = await apiFetch('/me', { method: 'GET' }, true);
    currentUser = meData.usuario;
    await loadTurnosIntoCalendar();
    showAuthState(`Calendario cargado para ${currentUser?.nombre || 'usuario'}.`);
  } catch (error) {
    showAuthState(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
