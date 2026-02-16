const API_BASE_URL = 'http://localhost:3000';
const TOKEN_KEY = 'turnos_token';

function showMessage(message, isError = true) {
  const box = document.getElementById('mensaje');
  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

async function login(event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo iniciar sesión');
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    showMessage('Login correcto. Redirigiendo...', false);
    setTimeout(() => {
      window.location.href = './empleados.html';
    }, 500);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function bootstrap() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    window.location.href = '/empleado/empleados.html';
    return;
  }

  document.getElementById('loginForm').addEventListener('submit', login);
}

document.addEventListener('DOMContentLoaded', bootstrap);
