/**
 * Configura las acciones de los planes de suscripción.
 * Actualmente solo el plan gratuito tiene comportamiento activo.
 */
document.addEventListener("DOMContentLoaded", () => {
  const freePlanButton = document.getElementById("btnPlanFree");

  // Si existe el botón, redirige al registro con el parámetro del plan seleccionado.
  if (freePlanButton) {
    freePlanButton.addEventListener("click", () => {
      window.location.href = "/usuarios/registro.html?plan=free";
    });
  }
});
