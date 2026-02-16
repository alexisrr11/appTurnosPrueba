document.addEventListener("DOMContentLoaded", () => {
  const registroForm = document.getElementById("registroForm");
  const alerta = document.getElementById("registroAlert");

  registroForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usuario = {
      nombre: document.getElementById('nombre').value,
      apellido: document.getElementById('apellido').value,
      sexo: document.getElementById('sexo').value,
      fechaNacimiento: document.getElementById('fechaNacimiento').value,
      email: document.getElementById('email').value,
      telefono: document.getElementById('telefono').value,
      contraseña: document.getElementById('Contraseña').value
    };

    try {
      const res = await fetch("http://localhost:4000/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(usuario)
      });

      const data = await res.json();

      if (res.ok) {
        alerta.textContent = data.mensaje;
        alerta.classList.remove("hidden");
        alerta.classList.remove("text-red-500");
        alerta.classList.add("text-green-500");
        registroForm.reset();
      } else {
        alerta.textContent = data.mensaje || "Error en el registro";
        alerta.classList.remove("hidden");
        alerta.classList.remove("text-green-500");
        alerta.classList.add("text-red-500");
      }
    } catch (error) {
      alerta.textContent = "Error al conectar con el servidor";
      alerta.classList.remove("hidden");
      alerta.classList.remove("text-green-500");
      alerta.classList.add("text-red-500");
    }
  });
});

function darkMode () {
    const html = document.documentElement;
    const btnModoOscuro = document.getElementById('modoOscuroBtn');

    btnModoOscuro.addEventListener('click', () => {
        html.classList.toggle('dark');
        setTimeout(() => {
          btnModoOscuro.style.background = (btnModoOscuro.style.background === "bisque" ? "black" : "bisque");
          btnModoOscuro.style.color = (btnModoOscuro.style.color === "black" ? "white" : "black");
          btnModoOscuro.textContent = (btnModoOscuro.textContent === "☀️" ? "🌙" : "☀️");
        }, 200);
    });
}
darkMode();