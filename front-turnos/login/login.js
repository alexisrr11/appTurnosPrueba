const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';

/**
 * Muestra mensajes al usuario (éxito/error) en una sola zona de alertas.
 */
function showMessage(message, isError = true) {
  const alert = document.getElementById('loginAlert');
  if (!alert) return;

  alert.textContent = message;
  alert.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  alert.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  alert.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

/**
 * Hace login contra /login y guarda el JWT.
 */
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo iniciar sesión');
    }

    // Guardamos el token para usarlo luego en endpoints protegidos.
    localStorage.setItem(TOKEN_KEY, data.token);
    showMessage('Login correcto. Redirigiendo...', false);

    setTimeout(() => {
      window.location.href = '../index.html';
    }, 600);
  } catch (error) {
    showMessage(error.message || 'Error de conexión con el backend');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', handleLogin);
});
