const API_BASE_URL = 'http://localhost:3000';
const HORARIOS_BASE = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

let calendar;

function showMessage(text, isError = true) {
  const box = document.getElementById('mensaje');
  box.textContent = text;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Error ${response.status}`);
  }

  return data;
}

function fillTimeOptions(disponibles = []) {
  const select = document.getElementById('hora');
  select.innerHTML = '';

  const list = disponibles.length > 0 ? disponibles : HORARIOS_BASE;
  list.forEach((hora) => {
    const option = document.createElement('option');
    option.value = hora;
    option.textContent = hora;
    select.appendChild(option);
  });
}

async function loadDisponibilidadByDate(fecha) {
  try {
    const data = await apiFetch(`/turnos/publico/disponibilidad?fecha=${fecha}`);
    fillTimeOptions(data.disponibles || []);

    const detalle = document.getElementById('detalleDia');
    const ocupadas = (data.ocupadas || []).join(', ') || 'Sin horarios ocupados';
    detalle.textContent = `Ocupados para ${fecha}: ${ocupadas}`;
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadCalendar() {
  const data = await apiFetch(`/turnos/publico/ocupados?desde=${todayISO()}`);

  const eventosOcupados = (data.ocupados || []).map((item) => ({
    title: `Ocupado ${item.hora}`,
    start: `${item.fecha}T${item.hora}:00`,
    color: '#ef4444',
  }));

  const eventosDisponibles = (data.dias_disponibles || []).map((fecha) => ({
    title: 'Día con disponibilidad',
    start: fecha,
    allDay: true,
    color: '#22c55e',
  }));

  calendar.removeAllEvents();
  calendar.addEventSource([...eventosDisponibles, ...eventosOcupados]);
}

async function submitTurno(event) {
  event.preventDefault();

  const cliente = document.getElementById('cliente').value.trim();
  const servicio = document.getElementById('servicio').value.trim();
  const fecha = document.getElementById('fecha').value;
  const hora = document.getElementById('hora').value;

  try {
    await apiFetch('/turnos/publico', {
      method: 'POST',
      body: JSON.stringify({ cliente, servicio, fecha, hora }),
    });

    showMessage('Turno reservado correctamente.', false);
    document.getElementById('formTurno').reset();
    document.getElementById('fecha').value = todayISO();
    await loadDisponibilidadByDate(document.getElementById('fecha').value);
    await loadCalendar();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    locale: 'es',
    height: 600,
    validRange: { start: todayISO() },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    dateClick: async (info) => {
      document.getElementById('fecha').value = info.dateStr;
      await loadDisponibilidadByDate(info.dateStr);
    },
  });
  calendar.render();
}

async function bootstrap() {
  initCalendar();
  const fechaInput = document.getElementById('fecha');
  fechaInput.min = todayISO();
  fechaInput.value = todayISO();
  fechaInput.addEventListener('change', (e) => loadDisponibilidadByDate(e.target.value));

  document.getElementById('formTurno').addEventListener('submit', submitTurno);

  await loadDisponibilidadByDate(todayISO());
  await loadCalendar();
}

document.addEventListener('DOMContentLoaded', bootstrap);
