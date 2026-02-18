const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';
let calendar;
let cacheTurnos = [];

const btnConfiguraciones = document.getElementById("btn-configuraciones");
const configuraciones = document.getElementById("configuraciones");
const contenedorBuscarCliente = document.getElementById("contenedor-buscar-cliente");
const btnBuscarCliente = document.getElementById("btn-buscar-cliente");

const listaHoy = document.getElementById("turnosHoy");
const listaManana = document.getElementById("turnosManana");

const inputNombre = document.getElementById("filtroNombre");
const inputFecha = document.getElementById("filtroFecha");

function abrirContenedores(btn, contenedor) {
  btn.addEventListener("click", () => {
    contenedor.classList.toggle("hidden");
    btn.textContent = contenedor.classList.contains("hidden") ? "➕" : "➖";
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
    title: `${turno.cliente} - ${turno.servicio}`,
    start: `${normalizeTurnoDate(turno)}T${String(turno.hora).slice(0, 8)}`,
  }));
}

/* ============================= */
/* NUEVO RENDER DE LISTAS */
/* ============================= */

function renderListas(turnos) {
  listaHoy.innerHTML = '';
  listaManana.innerHTML = '';

  const hoy = new Date();
  const manana = new Date();
  manana.setDate(hoy.getDate() + 1);

  const hoyStr = hoy.toISOString().slice(0, 10);
  const mananaStr = manana.toISOString().slice(0, 10);

  const turnosHoy = turnos.filter(t => normalizeTurnoDate(t) === hoyStr);
  const turnosManana = turnos.filter(t => normalizeTurnoDate(t) === mananaStr);

  renderItems(turnosHoy, listaHoy);
  renderItems(turnosManana, listaManana);
}

function renderItems(turnos, contenedor) {
  if (turnos.length === 0) {
    contenedor.innerHTML = `<li class="text-slate-400">Sin turnos</li>`;
    return;
  }

  turnos.forEach(turno => {
    const li = document.createElement("li");
    li.className = "bg-slate-50 p-3 rounded-lg flex justify-between items-center";

    li.innerHTML = `
      <div>
        <p class="font-medium">${turno.cliente}</p>
        <p class="text-sm text-slate-500">
          ${turno.servicio} - ${String(turno.hora).slice(0, 5)}
        </p>
      </div>
      <button data-id="${turno.id}" 
        class="cancelarTurno bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">
        Cancelar
      </button>
    `;

    contenedor.appendChild(li);
  });
}

/* ============================= */
/* FILTROS */
/* ============================= */

function aplicarFiltrosLocales() {
  let filtrados = [...cacheTurnos];

  const nombre = inputNombre.value.toLowerCase().trim();
  const fecha = inputFecha.value;

  if (nombre) {
    filtrados = filtrados.filter(t =>
      t.cliente.toLowerCase().includes(nombre)
    );
  }

  if (fecha) {
    filtrados = filtrados.filter(t =>
      normalizeTurnoDate(t) === fecha
    );
  }

  renderListas(filtrados);
  renderCalendar(filtrados);
}

/* ============================= */
/* API */
/* ============================= */

async function fetchTurnos() {
  const response = await fetch(`${API_BASE_URL}/turnos`, {
    method: 'GET',
    headers: authHeaders(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error al cargar turnos');
  return data;
}

async function loadTurnos() {
  const turnos = await fetchTurnos();
  cacheTurnos = turnos;
  renderListas(turnos);
  renderCalendar(turnos);
}

async function cancelarTurno(id) {
  const response = await fetch(`${API_BASE_URL}/turnos/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo cancelar');
  return data;
}

/* ============================= */
/* EVENTOS */
/* ============================= */

function bindEvents() {
  document.getElementById('aplicarFiltros').addEventListener('click', aplicarFiltrosLocales);

  document.getElementById('limpiarFiltros').addEventListener('click', () => {
    inputNombre.value = '';
    inputFecha.value = '';
    renderListas(cacheTurnos);
    renderCalendar(cacheTurnos);
  });

  inputNombre.addEventListener('input', aplicarFiltrosLocales);

  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('.cancelarTurno');
    if (!btn) return;

    const id = btn.dataset.id;
    if (!confirm("¿Cancelar turno?")) return;

    try {
      await cancelarTurno(id);
      showMessage("Turno cancelado correctamente", false);
      await loadTurnos();
    } catch (err) {
      showMessage(err.message, true);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    const confirmar = confirm("¿Seguro que querés cerrar sesión?");

    if (!confirmar) return;

    localStorage.removeItem(TOKEN_KEY);

    setTimeout(() => {
      window.location.href = './login.html';
    }, 500);
  });

}

/* ============================= */
/* CALENDARIO */
/* ============================= */

function renderCalendar(turnos) {
  calendar.removeAllEvents();
  calendar.addEventSource(turnosToEvents(turnos));
}

function initCalendar() {
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: 'dayGridMonth',
    locale: 'es',
    height: 600,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },

    eventClick: async function (info) {
      const id = info.event.id;

      const confirmado = confirm(
        `¿Querés cancelar este turno?\n\n${info.event.title}`
      );

      if (!confirmado) return;

      try {
        await cancelarTurno(id);
        showMessage("Turno cancelado correctamente", false);
        await loadTurnos();
      } catch (error) {
        showMessage(error.message, true);
      }
    }
  });

  calendar.render();
}


/* ============================= */
/* INIT */
/* ============================= */

async function bootstrap() {
  initCalendar();
  bindEvents();
  await loadTurnos();
}

document.addEventListener('DOMContentLoaded', bootstrap);
