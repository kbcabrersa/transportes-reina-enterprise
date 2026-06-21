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
    renderSolicitudes();
    renderKpis();
}

function renderKpis(){
    const activos = clientes.filter(c => c.activo === true || c.activo === "true").length;
    const pendientes = solicitudes.filter(s => s.estado === "PENDIENTE").length;

    setText("dashClientes", activos);
    setText("dashAtenciones", eventos.length);
    setText("dashSolicitudes", pendientes);
    setText("kpiClientes", clientes.length);
    setText("kpiActivos", activos);
    setText("kpiInactivos", clientes.length - activos);
    setText("kpiSolicitudes", pendientes);
}

function setText(id, valor){
    const el = document.getElementById(id);
    if(el) el.textContent = valor;
}

function renderClientes(lista){
    const tbody = document.querySelector("#tablaClientes tbody");
    if(!tbody) return;

    tbody.innerHTML = "";

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

function renderSolicitudes(){
    const tbody = document.getElementById("tablaSolicitudes");
    if(!tbody) return;

    tbody.innerHTML = solicitudes.length
        ? solicitudes.map(s => `
            <tr>
                <td>${formatearFecha(s.fechaSolicitud)}</td>
                <td>${s.nombreCompleto || ""}</td>
                <td>${s.barrio || ""}</td>
                <td>${s.tipoServicio || ""}</td>
                <td>${s.estado || ""}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="5">Sin solicitudes registradas.</td></tr>`;
}

function abrirPerfilCliente(cliente){
    const historial = eventos.filter(ev =>
        String(ev.clienteId || "") === String(cliente.id || "") ||
        String(ev.clienteNombre || "").toLowerCase() === String(cliente.nombre || "").toLowerCase()
    );

    const foto = cliente.fotoDriveId
        ? `https://drive.google.com/thumbnail?sz=w900&id=${cliente.fotoDriveId}`
        : "../assets/banners/banner1.png";

    const modal = document.createElement("div");
    modal.className = "cliente-modal";

    modal.innerHTML = `
        <div class="cliente-perfil ficha-pro">
            <button class="cerrar-modal" onclick="this.closest('.cliente-modal').remove()">×</button>

            <div class="ficha-top">
                <img src="${foto}" class="foto-ficha-pro">

                <div class="ficha-titulo">
                    <h2>${cliente.nombre || "Cliente sin nombre"}</h2>
                    <p>Cliente ID: ${cliente.id || ""}</p>
                    <span class="estado ${cliente.activo === true || cliente.activo === "true" ? "activo" : "inactivo"}">
                        ${cliente.activo === true || cliente.activo === "true" ? "Activo" : "Inactivo"}
                    </span>
                </div>

                <button class="btn-mini naranja" onclick="window.print()">Exportar Ficha PDF</button>
            </div>

            <div class="resumen-cliente">
                <div><span>Cliente desde</span><strong>${fechaCorta(cliente.updatedAt)}</strong></div>
                <div><span>Último pago</span><strong>${ultimoEvento(historial, "pago")}</strong></div>
                <div><span>Última atención</span><strong>${ultimoEvento(historial, "atencion")}</strong></div>
                <div><span>Servicio</span><strong>${cliente.tipoServicio || "Básico"} - Q${cliente.precio || "0"}</strong></div>
            </div>

            <div class="ficha-grid-pro">
                <div class="info-box">
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

                <div class="indicadores-pro">
                    <h3>Indicadores de Desempeño</h3>

                    <div class="indicadores-row">
                        <div class="anillo-pro verde">
                            <span>92%</span>
                            <small>Cumplimiento de Pago</small>
                        </div>

                        <div class="anillo-pro azul">
                            <span>90%</span>
                            <small>Cumplimiento de Servicio</small>
                        </div>

                        <div class="anillo-pro morado">
                            <span>85%</span>
                            <small>Puntualidad de Pago</small>
                        </div>
                    </div>
                </div>
            </div>

            <div class="historial-cliente">
                <h3>Historial de Eventos</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Fecha y Hora</th>
                            <th>Qué hizo</th>
                            <th>Quién lo hizo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            historial.length
                            ? historial.slice(-8).reverse().map(ev => `
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

function ultimoEvento(historial, tipo){
    const ev = historial.filter(e => String(e.tipo || "").toLowerCase().includes(tipo)).pop();
    return ev ? fechaCorta(ev.fecha) : "Sin registro";
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
    return new Date(fecha).toLocaleString("es-GT");
}

function fechaCorta(fecha){
    if(!fecha) return "Sin registro";
    return new Date(fecha).toLocaleDateString("es-GT");
}

document.addEventListener("input", e => {
    if(e.target.id === "buscarCliente"){
        const texto = e.target.value.toLowerCase();
        renderClientes(clientes.filter(c =>
            String(c.nombre || "").toLowerCase().includes(texto) ||
            String(c.ruta || "").toLowerCase().includes(texto) ||
            String(c.lugar || "").toLowerCase().includes(texto)
        ));
    }
});

cargarDatosEnterprise();
