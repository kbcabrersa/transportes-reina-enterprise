const API_URL = "https://script.google.com/macros/s/AKfycbwoWQp8s8PvfOLdof3AV3qR9iB4-t_8wnq3R-yKGbEPnzwAoSEThDy6BpB7VBN3xF_-gg/exec";

if(localStorage.getItem("enterpriseAuth") !== "true"){
    window.location.href = "login-enterprise.html";
}

let clientes = [];
let eventos = [];
let solicitudes = [];

function cerrarSesion(){
    localStorage.clear();
    window.location.href = "login-enterprise.html";
}

async function cargarDatosEnterprise(){
    const resClientes = await fetch(API_URL + "?action=clientes");
    clientes = await resClientes.json();

    const resEventos = await fetch(API_URL + "?action=eventos");
    eventos = await resEventos.json();

    const resSolicitudes = await fetch(API_URL + "?action=listarSolicitudes");
    const dataSolicitudes = await resSolicitudes.json();
    solicitudes = dataSolicitudes.solicitudes || [];

    renderClientes(clientes);
    renderDashboardReal();
}

function renderDashboardReal(){
    const activos = clientes.filter(c => c.activo === true || c.activo === "true").length;
    const inactivos = clientes.length - activos;
    const pendientes = solicitudes.filter(s => s.estado === "PENDIENTE").length;
    const eventosHoy = eventos.filter(e => {
        const f = String(e.fecha || "");
        const hoy = new Date().toISOString().slice(0,10);
        return f.startsWith(hoy);
    }).length;

    cambiarTexto("kpiClientes", clientes.length);
    cambiarTexto("kpiActivos", activos);
    cambiarTexto("kpiInactivos", inactivos);
    cambiarTexto("kpiSolicitudes", pendientes);

    cambiarTexto("dashClientes", activos);
    cambiarTexto("dashPuntos", clientes.length);
    cambiarTexto("dashAtenciones", eventosHoy);
    cambiarTexto("dashSolicitudes", pendientes);
}

function cambiarTexto(id, valor){
    const el = document.getElementById(id);
    if(el) el.textContent = valor;
}

function renderClientes(lista){
    const tbody = document.querySelector("#tablaClientes tbody");
    if(!tbody) return;

    tbody.innerHTML = "";

    if(lista.length === 0){
        tbody.innerHTML = `<tr><td colspan="5">No hay clientes registrados.</td></tr>`;
        return;
    }

    lista.forEach(cliente => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${cliente.nombre || ""}</td>
            <td>${cliente.ruta || ""}</td>
            <td>${cliente.lugar || ""}</td>
            <td>${cliente.activo === true || cliente.activo === "true" ? "Activo" : "Inactivo"}</td>
            <td>${formatearFecha(cliente.updatedAt)}</td>
        `;

        tr.addEventListener("click", () => abrirPerfilCliente(cliente));
        tbody.appendChild(tr);
    });
}

function abrirPerfilCliente(cliente){
    const historial = eventos.filter(ev =>
        String(ev.clienteId || "") === String(cliente.id || "") ||
        String(ev.clienteNombre || "").toLowerCase() === String(cliente.nombre || "").toLowerCase()
    );

    const foto = cliente.fotoDriveId
        ? `https://drive.google.com/thumbnail?sz=w600&id=${cliente.fotoDriveId}`
        : "../assets/banners/banner1.png";

    const modal = document.createElement("div");
    modal.className = "cliente-modal";

    modal.innerHTML = `
        <div class="cliente-perfil">
            <button class="cerrar-modal" onclick="this.closest('.cliente-modal').remove()">×</button>

            <div class="perfil-header">
                <div>
                    <h2>${cliente.nombre || "Cliente sin nombre"}</h2>
                    <p>Cliente ID: ${cliente.id || ""}</p>
                    <span class="estado ${cliente.activo === true || cliente.activo === "true" ? "activo" : "inactivo"}">
                        ${cliente.activo === true || cliente.activo === "true" ? "Activo" : "Inactivo"}
                    </span>
                </div>

                <button class="btn-mini naranja" onclick="window.print()">
                    Exportar Ficha PDF
                </button>
            </div>

            <div class="perfil-grid">
                <div class="perfil-datos">
                    <img src="${foto}" class="foto-cliente">

                    <h3>Información del Cliente</h3>
                    <p><strong>Nombre:</strong> ${cliente.nombre || ""}</p>
                    <p><strong>Teléfono:</strong> ${cliente.telefono || ""}</p>
                    <p><strong>Ruta:</strong> ${cliente.ruta || ""}</p>
                    <p><strong>Lugar:</strong> ${cliente.lugar || ""}</p>
                    <p><strong>Día de Pago:</strong> ${cliente.diaPago || ""}</p>
                    <p><strong>Tipo de Servicio:</strong> ${cliente.tipoServicio || ""}</p>
                    <p><strong>Precio:</strong> Q${cliente.precio || "0"}</p>
                    <p><strong>Ubicación:</strong> ${cliente.lat || ""}, ${cliente.lng || ""}</p>
                </div>

                <div class="perfil-indicadores">
                    <h3>Indicadores</h3>
                    <div class="anillo"><span>${historial.length}</span><p>Eventos</p></div>
                    <div class="anillo"><span>${cliente.activo === true || cliente.activo === "true" ? "OK" : "NO"}</span><p>Estado</p></div>
                    <div class="anillo"><span>Q${cliente.precio || "0"}</span><p>Cuota</p></div>
                </div>
            </div>

            <div class="historial-cliente">
                <h3>Historial de Eventos</h3>

                <table>
                    <thead>
                        <tr>
                            <th>Cuándo</th>
                            <th>Qué hizo</th>
                            <th>Quién lo hizo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            historial.length > 0
                            ? historial.map(ev => `
                                <tr>
                                    <td>${formatearFecha(ev.fecha)}</td>
                                    <td>${traducirEvento(ev.tipo)}</td>
                                    <td>${ev.usuario || "Sistema"}</td>
                                </tr>
                            `).join("")
                            : `<tr><td colspan="3">Este cliente aún no tiene historial registrado.</td></tr>`
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function traducirEvento(tipo){
    const t = String(tipo || "").toLowerCase();

    if(t.includes("pago")) return "Registró un pago";
    if(t.includes("cliente_upsert")) return "Creó o actualizó el cliente";
    if(t.includes("foto")) return "Actualizó fotografía";
    if(t.includes("delete")) return "Inactivó el cliente";
    if(t.includes("atencion")) return "Registró atención";
    if(t.includes("no_atendido")) return "Registró no atendido";

    return tipo || "Evento registrado";
}

function formatearFecha(fecha){
    if(!fecha) return "";
    try{
        return new Date(fecha).toLocaleString("es-GT");
    }catch(e){
        return fecha;
    }
}

document.addEventListener("input", e => {
    if(e.target.id === "buscarCliente"){
        const texto = e.target.value.toLowerCase();

        const filtrados = clientes.filter(c =>
            String(c.nombre || "").toLowerCase().includes(texto) ||
            String(c.ruta || "").toLowerCase().includes(texto) ||
            String(c.lugar || "").toLowerCase().includes(texto)
        );

        renderClientes(filtrados);
    }
});

cargarDatosEnterprise();
