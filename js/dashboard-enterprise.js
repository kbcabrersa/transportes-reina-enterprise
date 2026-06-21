const API_URL = "https://script.google.com/macros/s/AKfycbwoWQp8s8PvfOLdof3AV3qR9iB4-t_8wnq3R-yKGbEPnzwAoSEThDy6BpB7VBN3xF_-gg/exec";

if(localStorage.getItem("enterpriseAuth") !== "true"){
    window.location.href = "login-enterprise.html";
}

let clientes = [];
let eventos = [];

function cerrarSesion(){
    localStorage.removeItem("enterpriseAuth");
    localStorage.removeItem("enterpriseUser");
    window.location.href = "login-enterprise.html";
}

async function cargarDatosEnterprise(){
    try{
        const resClientes = await fetch(API_URL + "?action=clientes");
        clientes = await resClientes.json();

        const resEventos = await fetch(API_URL + "?action=eventos");
        eventos = await resEventos.json();

        renderClientes(clientes);
        actualizarKpisClientes();

    }catch(error){
        console.error("Error cargando datos Enterprise:", error);
    }
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
            <td>${cliente.updatedAt || ""}</td>
        `;

        tr.addEventListener("click", () => abrirPerfilCliente(cliente));

        tbody.appendChild(tr);
    });
}

function actualizarKpisClientes(){
    const activos = clientes.filter(c => c.activo === true || c.activo === "true").length;
    const inactivos = clientes.length - activos;

    const kpiClientes = document.querySelector("#kpiClientes");
    const kpiActivos = document.querySelector("#kpiActivos");
    const kpiInactivos = document.querySelector("#kpiInactivos");

    if(kpiClientes) kpiClientes.textContent = clientes.length;
    if(kpiActivos) kpiActivos.textContent = activos;
    if(kpiInactivos) kpiInactivos.textContent = inactivos;
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

                <button class="btn-mini naranja" onclick="exportarFichaCliente()">
                    Exportar Ficha PDF
                </button>
            </div>

            <div class="perfil-grid" id="fichaClientePdf">
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
                    <p><strong>Lat:</strong> ${cliente.lat || ""}</p>
                    <p><strong>Lng:</strong> ${cliente.lng || ""}</p>
                    <p><strong>Actualizado:</strong> ${cliente.updatedAt || ""}</p>
                </div>

                <div class="perfil-indicadores">
                    <h3>Indicadores</h3>

                    <div class="anillo">
                        <span>85%</span>
                        <p>Atenciones</p>
                    </div>

                    <div class="anillo">
                        <span>70%</span>
                        <p>Cobros</p>
                    </div>

                    <div class="anillo">
                        <span>15%</span>
                        <p>Pendientes</p>
                    </div>

                    <div class="anillo">
                        <span>5%</span>
                        <p>Incidencias</p>
                    </div>
                </div>
            </div>

            <div class="historial-cliente">
                <h3>Historial de Eventos</h3>

                <table>
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Detalle</th>
                            <th>Usuario</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            historial.length > 0
                            ? historial.map(ev => `
                                <tr>
                                    <td>${ev.fecha || ""}</td>
                                    <td>${ev.tipo || ""}</td>
                                    <td>${ev.detalle || ""}</td>
                                    <td>${ev.usuario || ""}</td>
                                </tr>
                            `).join("")
                            : `<tr><td colspan="4">Sin historial registrado.</td></tr>`
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function exportarFichaCliente(){
    window.print();
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
