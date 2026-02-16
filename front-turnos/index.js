const API_URL = 'http://localhost:3000/api/turnos';
const REFRESH_INTERVAL_MS = 60000;

let calendarInstance;

function setupDarkMode() {
  const html = document.documentElement;
  const btnModoOscuro = document.getElementById('modoOscuroBtn');

  btnModoOscuro?.addEventListener('click', () => {
    html.classList.toggle('dark');
    setTimeout(() => {
      btnModoOscuro.style.background = btnModoOscuro.style.background === 'bisque' ? 'white' : 'bisque';
      btnModoOscuro.style.color = btnModoOscuro.style.color === 'black' ? 'white' : 'black';
      btnModoOscuro.textContent = btnModoOscuro.textContent === '☀️' ? '🌙' : '☀️';
    }, 200);
  });
}

function mostrarAlerta(mensaje, esError = false) {
  const alerta = document.getElementById('alerta');
  if (!alerta) {
    return;
  }

  alerta.textContent = mensaje;
  alerta.classList.remove('hidden');
  alerta.classList.toggle('bg-green-500', !esError);
  alerta.classList.toggle('bg-red-500', esError);

  setTimeout(() => {
    alerta.classList.add('hidden');
  }, 3000);
}

async function fetchTurnos() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`No se pudieron obtener los turnos (${response.status})`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error al consultar turnos:', error);
    mostrarAlerta('❌ Error al cargar turnos', true);
    return [];
  }
}

function mapTurnosToEvents(turnos) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  return turnos
    .map((turno) => {
      const horaNormalizada = turno.hora?.slice(0, 8) || '00:00:00';
      const start = `${turno.fecha}T${horaNormalizada}`;
      const inicioTurno = new Date(start);

      return {
        id: turno.id,
        title: `${turno.cliente} - ${turno.servicio}`,
        start,
        extendedProps: {
          cliente: turno.cliente,
          servicio: turno.servicio,
          fecha: turno.fecha,
          hora: horaNormalizada,
          canDelete: false
        },
        _inicioTurno: inicioTurno
      };
    })
    .filter((evento) => !Number.isNaN(evento._inicioTurno.getTime()) && evento._inicioTurno >= inicioHoy)
    .map(({ _inicioTurno, ...evento }) => evento);
}

function getTodayString() {
  const hoy = new Date();
  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, '0');
  const day = String(hoy.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initCalendar() {
  const calendarElement = document.getElementById('calendar');
  if (!calendarElement) {
    throw new Error('No se encontró el contenedor #calendar');
  }

  const calendar = new FullCalendar.Calendar(calendarElement, {
    initialView: 'timeGridWeek',
    locale: 'es',
    nowIndicator: true,
    slotMinTime: '08:00:00',
    slotMaxTime: '20:00:00',
    allDaySlot: false,
    validRange: {
      start: getTodayString()
    },
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    events: [],
    eventClick: (info) => {
      const { cliente, servicio, fecha, hora } = info.event.extendedProps;
      alert(`Cliente: ${cliente}\nServicio: ${servicio}\nFecha: ${fecha}\nHora: ${hora}`);

      // Estructura preparada para futura eliminación.
      // Ejemplo futuro: solicitar confirmación y llamar DELETE /api/turnos/:id
      const deletePayload = {
        turnoId: info.event.id,
        canDelete: info.event.extendedProps.canDelete
      };
      console.debug('Eliminación pendiente de implementar:', deletePayload);
    }
  });

  calendar.render();
  return calendar;
}

async function refreshCalendarEvents(calendar) {
  const turnos = await fetchTurnos();
  const events = mapTurnosToEvents(turnos);

  calendar.removeAllEvents();
  calendar.addEventSource(events);
}

async function registrarTurno(event) {
  event.preventDefault();

  const cliente = document.getElementById('cliente')?.value?.trim();
  const servicio = document.getElementById('servicio')?.value?.trim();
  const fecha = document.getElementById('fecha')?.value;
  const horaInput = document.getElementById('hora')?.value;

  if (!cliente || !servicio || !fecha || !horaInput) {
    mostrarAlerta('❌ Completá todos los campos', true);
    return;
  }

  const hora = horaInput.length === 5 ? `${horaInput}:00` : horaInput;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cliente, servicio, fecha, hora })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.mensaje || 'Error al guardar turno');
    }

    document.getElementById('form-turno')?.reset();
    mostrarAlerta('✅ Su turno se ha reservado correctamente');
    await refreshCalendarEvents(calendarInstance);
  } catch (error) {
    console.error('Error al reservar turno:', error);
    mostrarAlerta(`❌ ${error.message}`, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupDarkMode();

  try {
    calendarInstance = initCalendar();
    await refreshCalendarEvents(calendarInstance);

    setInterval(() => {
      refreshCalendarEvents(calendarInstance);
    }, REFRESH_INTERVAL_MS);
  } catch (error) {
    console.error('Error al inicializar calendario:', error);
    mostrarAlerta('❌ No se pudo inicializar el calendario', true);
  }

  const form = document.getElementById('form-turno');
  form?.addEventListener('submit', registrarTurno);
});
