function darkMode () {
    const html = document.documentElement;
    const btnModoOscuro = document.getElementById('modoOscuroBtn');

    btnModoOscuro.addEventListener('click', () => {
        html.classList.toggle('dark');
        setTimeout(() => {
          btnModoOscuro.style.background = (btnModoOscuro.style.background === "bisque" ? "White" : "bisque");
          btnModoOscuro.style.color = (btnModoOscuro.style.color === "black" ? "white" : "black");
          btnModoOscuro.textContent = (btnModoOscuro.textContent === "☀️" ? "🌙" : "☀️");
        }, 200);
    });
}
console.log(darkMode());

document.addEventListener("DOMContentLoaded", async () => {
  const lista = document.getElementById("lista-turnos");
  const listaHoy = document.getElementById("turnos-hoy");
  const totalHoy = document.getElementById("total-turnos-hoy");

  try {
    const res = await fetch("http://localhost:4000/turnos");
    let turnos = await res.json();

    filtrarTurnos(turnos);
    // Ordenar turnos de más cercano a más lejano
    turnos.sort((a, b) => {
      const fechaA = new Date(`${a.fecha}T${a.hora}`);
      const fechaB = new Date(`${b.fecha}T${b.hora}`);
      return fechaA - fechaB;
    });

    turnos.forEach(turno => {
      const li = document.createElement("li");
      li.className = "p-3 rounded shadow bg-pink-100 dark:bg-gray-700";
      li.textContent = `${turno.nombre} - ${turno.fecha} a las ${turno.hora}`;
      lista.appendChild(li);
    });

    // 🔸 Obtener fecha de hoy en formato "YYYY-MM-DD" en Argentina
    const hoyArgentina = new Date().toLocaleString("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
    }).split(" ")[0]; // formato ISO: "2025-06-20"

    const turnosHoy = turnos.filter(turno => turno.fecha === hoyArgentina);
    totalHoy.textContent = turnosHoy.length;

    turnosHoy.forEach(turno => {
      const li = document.createElement("li");
      li.className = "p-3 rounded shadow bg-pink-200 dark:bg-gray-700";
      li.textContent = `${turno.nombre} - ${turno.hora}`;
      listaHoy.appendChild(li);
    });

  } catch (error) {
    console.error("Error al cargar turnos:", error);
  }

  function filtrarTurnos(turnos) {
  const lista = document.getElementById("lista-turnos");
  const inputNombre = document.getElementById("busqueda-nombre");
  const inputFecha = document.getElementById("busqueda-fecha");

  // Asegurarse que los inputs existan
  if (!inputNombre || !inputFecha) return;

  // Función que renderiza la lista filtrada
  function aplicarFiltros() {
    const texto = inputNombre.value.toLowerCase();
    const fecha = inputFecha.value;

    const filtrados = turnos.filter(turno => {
      const coincideNombre = turno.nombre.toLowerCase().includes(texto);
      const coincideFecha = fecha === "" || turno.fecha === fecha;
      return coincideNombre && coincideFecha;
    });

    lista.innerHTML = "";
    filtrados.forEach(turno => {
      const li = document.createElement("li");
      li.className = "p-3 rounded shadow bg-pink-100 dark:bg-gray-700";
      li.textContent = `${turno.nombre} - ${turno.fecha} a las ${turno.hora}`;
      lista.appendChild(li);
    });
  }

  // Escuchamos eventos
  inputNombre.addEventListener("input", aplicarFiltros);
  inputFecha.addEventListener("input", aplicarFiltros);

}
});
