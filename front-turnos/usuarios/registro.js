const API_BASE_URL = 'http://localhost:3000';

/**
 * Renderiza alertas de éxito o error en el formulario de registro.
 */
function showMessage(message, isError = true) {
  const alert = document.getElementById('registroAlert');
  if (!alert) return;

  alert.textContent = message;
  alert.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
  alert.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
  alert.classList.add(isError ? 'text-red-700' : 'text-green-700');
}

/**
 * Hace POST /registro usando nombre, email y password.
 * Si el registro es exitoso, redirige a login.
 */
async function handleRegister(event) {
  event.preventDefault();

  const nombre = document.getElementById('nombre')?.value?.trim();
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;

  try {
    const response = await fetch(`${API_BASE_URL}/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo completar el registro');
    }

    showMessage('Registro exitoso. Redirigiendo al login...', false);
    setTimeout(() => {
      window.location.href = '../login/login.html';
    }, 700);
  } catch (error) {
    showMessage(error.message || 'Error al conectar con el backend');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registroForm');
  form?.addEventListener('submit', handleRegister);
});
