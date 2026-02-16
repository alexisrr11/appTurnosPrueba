const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';

let calendar;
let cacheTurnos = [];

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
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

function normalizeTurnoDate(turno) {
  return String(turno.fecha).slice(0, 10);
}

function turnosToEvents(turnos) {
  return turnos.map((turno) => ({
    id: String(turno.id),
    title: `${turno.cliente} - ${turno.servicio}`,
    start: `${normalizeTurnoDate(turno)}T${String(turno.hora).slice(0, 8)}`,
  }));
}

function renderTable(turnos) {
  const tbody = document.getElementById('tablaTurnos');
  tbody.innerHTML = '';

  if (turnos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-4 text-slate-500">No hay turnos para mostrar.</td></tr>';
    return;
  }

  turnos.forEach((turno) => {
    const row = document.createElement('tr');
    row.className = 'border-b border-slate-100';
    row.innerHTML = `
      <td class="py-2">${turno.cliente}</td>
      <td class="py-2">${turno.servicio}</td>
      <td class="py-2">${normalizeTurnoDate(turno)}</td>
      <td class="py-2">${String(turno.hora).slice(0, 5)}</td>
      <td class="py-2">
        <button data-id="${turno.id}" class="cancelarTurno rounded bg-red-600 text-white px-3 py-1 hover:bg-red-700">
          Cancelar
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function renderCalendar(turnos) {
  calendar.removeAllEvents();
  calendar.addEventSource(turnosToEvents(turnos));
}

async function fetchTurnos(query = '') {
  const response = await fetch(`${API_BASE_URL}/turnos${query}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'No se pudieron cargar turnos');
  }

  return data;
}

async function loadTurnos() {
  const fecha = document.getElementById('filtroFecha').value;
  const query = fecha ? `?fecha=${fecha}` : '';
  const turnos = await fetchTurnos(query);
  cacheTurnos = turnos;
  renderCalendar(turnos);
  renderTable(turnos);
}

async function cancelarTurno(id) {
  const response = await fetch(`${API_BASE_URL}/turnos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo cancelar el turno');
  }

  return data;
}

function wireTableActions() {
  document.getElementById('tablaTurnos').addEventListener('click', async (event) => {
    const button = event.target.closest('.cancelarTurno');
    if (!button) return;

    const id = button.getAttribute('data-id');
    const confirmed = window.confirm('¿Seguro que querés cancelar este turno?');
    if (!confirmed) return;

    try {
      await cancelarTurno(id);
      showMessage('Turno cancelado correctamente.', false);
      await loadTurnos();
    } catch (error) {
      showMessage(error.message, true);
    }
  });
}

async function validateTokenOrRedirect() {
  const token = getToken();
  if (!token) {
    window.location.href = '/empleado/login.html';
    return false;
  }

  const response = await fetch(`${API_BASE_URL}/me`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/empleado/login.html';
    return false;
  }

  return true;
}

function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    locale: 'es',
    height: 600,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
  });
  calendar.render();
}

function bindEvents() {
  document.getElementById('aplicarFiltros').addEventListener('click', loadTurnos);
  document.getElementById('limpiarFiltros').addEventListener('click', async () => {
    document.getElementById('filtroFecha').value = '';
    await loadTurnos();
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/empleado/login.html';
  });

  wireTableActions();
}

async function bootstrap() {
  try {
    const authorized = await validateTokenOrRedirect();
    if (!authorized) return;

    initCalendar();
    bindEvents();
    await loadTurnos();
  } catch (error) {
    showMessage(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
