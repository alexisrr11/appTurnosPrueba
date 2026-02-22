const API_BASE_URL = 'http://localhost:3000';

function showMessage(message, isError = true) {
  const box = document.getElementById('mensaje');
  box.textContent = message;
  box.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  box.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  box.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

async function register(event) {
  event.preventDefault();

  const nombre = document.getElementById('nombre').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const celular = document.getElementById('celular').value.trim();

  try {
    const response = await fetch(`${API_BASE_URL}/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password, celular }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo registrar la cuenta');
    }

    showMessage('Registro correcto. Redirigiendo al login...', false);
    setTimeout(() => {
      window.location.href = '/empleado/login.html';
    }, 700);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function bootstrap() {
  document.getElementById('registroForm').addEventListener('submit', register);
}

document.addEventListener('DOMContentLoaded', bootstrap);
