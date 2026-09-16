if(localStorage.getItem("enterpriseAuth") !== "true"){
    window.location.href = "login-enterprise.html";
}

let clientes = [];
let eventos = [];
let solicitudes = [];
let atenciones = [];
let noAtendidos = [];
let jornadasOperativas = [];
let jornadasCobro = [];
let firebaseEnterprise = {};
let seleccionOperativa = new Set();
let ordenOperativo = [];
let mapaEdicion = null;
let mapaOperacion = null;
let capaOperacion = null;
let seleccionCobro = new Set();
let ordenCobro = [];
let modoJornadaCobro = "ASIGNADA";
let pagosReconstruidos = [];
let mapaCobro = null;
let capaCobro = null;

let paginaClientes = 1;
const CLIENTES_POR_PAGINA = 20;
let clientesFiltradosActuales = [];

const datosGraficas = {};


async function cargarDatosEnterprise(){
    try{
        const {
            obtenerClientes,
            obtenerPagos,
            obtenerEventosOperativos,
            obtenerSolicitudes,
            obtenerAsignacionesOperativas,
            obtenerJornadasCobro,
            actualizarCliente,
            registrarPagoManual,
            guardarJornadaOperativa,
            guardarJornadaCobro
        } = await import("/js/firebase-service.js?v=20260916-1");

        firebaseEnterprise = {
            actualizarCliente,
            registrarPagoManual,
            guardarJornadaOperativa,
            guardarJornadaCobro
        };

        const [c, p, operativo, s, jornadas, cobrosJornadas] = await Promise.all([
            obtenerClientes(),
            obtenerPagos(),
            obtenerEventosOperativos(),
            obtenerSolicitudes(),
            obtenerAsignacionesOperativas(),
            obtenerJornadasCobro()
        ]);

        clientes = Array.isArray(c) ? c : [];

        // Firestore ya guarda los pagos con el formato que
        // espera el dashboard: tipo="pago" y fecha.
        eventos = Array.isArray(p) ? p : [];

        solicitudes = Array.isArray(s) ? s : [];
        jornadasOperativas = Array.isArray(jornadas) ? jornadas : [];
        jornadasCobro = Array.isArray(cobrosJornadas) ? cobrosJornadas : [];

        const operaciones = Array.isArray(operativo) ? operativo : [];

        // El dashboard antiguo espera fecha y tipos
        // "atencion" / "no_atendido". Firestore usa
        // fechaHora y ATENDIDO / NO_ATENDIDO.
        atenciones = operaciones
            .filter(ev => String(ev.tipo || "").toUpperCase() === "ATENDIDO")
            .map(ev => ({
                ...ev,
                fecha: ev.fechaHora,
                tipoOriginal: ev.tipo,
                tipo: "atencion"
            }));

        noAtendidos = operaciones
            .filter(ev => String(ev.tipo || "").toUpperCase() === "NO_ATENDIDO")
            .map(ev => ({
                ...ev,
                fecha: ev.fechaHora,
                tipoOriginal: ev.tipo,
                tipo: "no_atendido"
            }));

        renderKpis();
        renderDashboard();
        renderClientesPaginados(clientes);
        renderSolicitudes();
        renderCobros();
        prepararOperativo();
        prepararJornadasCobro();
        registrarClickGraficas();

        console.info("Enterprise cargado desde Firebase", {
            clientes: clientes.length,
            pagos: eventos.length,
            atenciones: atenciones.length,
            noAtendidos: noAtendidos.length,
            solicitudes: solicitudes.length
        });

    }catch(error){
        console.error("Error cargando Firebase Enterprise:", error);
        alert("No se pudieron cargar los datos de Firebase.");
    }
}

function cerrarSesion(){
    localStorage.clear();
    window.location.href = "login-enterprise.html";
}

function renderKpis(){
    const activos = clientes.filter(c=>activo(c)).length;
    const pendientes = solicitudes.filter(s=>String(s.estado||"").toUpperCase()==="PENDIENTE").length;
    const cobrosMes = eventos
        .filter(e=>esPago(e) && esMesActual(e.fecha))
        .reduce((a,e)=>a + Number(e.monto || 0),0);

    setText("dashClientes", activos);
    setText("dashEventos", eventos.length);
    setText("dashCobros", "Q" + cobrosMes.toFixed(0));
    setText("dashSolicitudes", pendientes);
}

function renderDashboard(){
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const anioActual = hoy.getFullYear();
    const mesPasadoFecha = new Date(anioActual, mesActual - 1, 1);
    const mesPasado = mesPasadoFecha.getMonth();
    const anioPasado = mesPasadoFecha.getFullYear();

    const pagosActual = eventos.filter(e=>esPago(e)&&mismoMes(e.fecha,mesActual,anioActual));
    const pagosPasado = eventos.filter(e=>esPago(e)&&mismoMes(e.fecha,mesPasado,anioPasado));

    const atActual = atenciones.filter(a=>mismoMes(a.fecha,mesActual,anioActual));
    const atPasado = atenciones.filter(a=>mismoMes(a.fecha,mesPasado,anioPasado));
    const noActual = noAtendidos.filter(a=>mismoMes(a.fecha,mesActual,anioActual));
    const noPasado = noAtendidos.filter(a=>mismoMes(a.fecha,mesPasado,anioPasado));

    const volActual = sumarVolumen(atActual);
    const volPasado = sumarVolumen(atPasado);

    const incActual = incidencias(atActual);
    const incPasado = incidencias(atPasado);

    const clientesNuevos = clientes.filter(c=>mismoMes(c.updatedAt,mesActual,anioActual)).length;
    const clientesFuera = clientes.filter(c=>!activo(c)&&mismoMes(c.updatedAt,mesActual,anioActual)).length;
    const clientesQuedan = clientes.filter(c=>activo(c)).length;

    setText("resumenClientes", "Clientes: " + clientesQuedan);
    setText("resumenMovimiento", `Ingresaron: ${clientesNuevos} | Se fueron: ${clientesFuera} | Se quedaron: ${clientesQuedan}`);
    setText("resumenVolumen", "Volumen: " + (volActual.litros/1000).toFixed(2) + " m³");
    setText("resumenPeso", `Peso estimado: ${Math.round(volActual.min)} - ${Math.round(volActual.max)} kg`);

    barras("chartCobros", ["Mes pasado","Mes actual"], [sumaMonto(pagosPasado), sumaMonto(pagosActual)]);
    barras("chartAtenciones", ["At. pasado","No pasado","At. actual","No actual"], [atPasado.length,noPasado.length,atActual.length,noActual.length]);
    lineas("chartVolumen", ["Mes pasado","Mes actual"], [(volPasado.litros/1000),(volActual.litros/1000)]);
    barras("chartIncidencias", ["Chat. ant","Veg. ant","Mueb. ant","Carn. ant","Chat. act","Veg. act","Mueb. act","Carn. act"], [
        incPasado.chatarra, incPasado.vegetacion, incPasado.muebles, incPasado.carnicos,
        incActual.chatarra, incActual.vegetacion, incActual.muebles, incActual.carnicos
    ]);
    barras("chartClientes", ["Ingresaron","Se fueron","Se quedaron"], [clientesNuevos,clientesFuera,clientesQuedan]);
}

function renderClientesPaginados(lista){
    clientesFiltradosActuales = lista;
    const tbody = document.querySelector("#tablaClientes tbody");
    if(!tbody) return;

    tbody.innerHTML = "";

    const inicio = (paginaClientes - 1) * CLIENTES_POR_PAGINA;
    const pagina = lista.slice(inicio, inicio + CLIENTES_POR_PAGINA);

    if(pagina.length === 0){
        tbody.innerHTML = `<tr><td colspan="8">Sin clientes para mostrar.</td></tr>`;
    }

    pagina.forEach(c=>{
        const tr = document.createElement("tr");
        const historialCliente = eventosCliente(c);
        tr.innerHTML = `
            <td>${escapeHTML(c.nombre || "")}</td>
            <td>${escapeHTML(c.telefono || "")}</td>
            <td>${escapeHTML(c.ruta || "")}</td>
            <td>${escapeHTML(c.lugar || "")}</td>
            <td>${ultimoEvento(historialCliente, "pago")}</td>
            <td>${ultimoEvento(historialCliente, "atencion")}</td>
            <td>${activo(c) ? "Activo" : "Inactivo"}</td>
            <td><div class="acciones-tabla">
                <button class="btn-mini azul" data-accion="ver">Ver</button>
                <button class="btn-mini naranja" data-accion="editar">Editar</button>
                <button class="btn-mini verde" data-accion="pagar">Pago</button>
            </div></td>
        `;
        tr.onclick = ()=>abrirPerfilCliente(c);
        tr.querySelector('[data-accion="ver"]').onclick = ev => { ev.stopPropagation(); abrirPerfilCliente(c); };
        tr.querySelector('[data-accion="editar"]').onclick = ev => { ev.stopPropagation(); abrirEditorCliente(c); };
        tr.querySelector('[data-accion="pagar"]').onclick = ev => { ev.stopPropagation(); abrirPagoManual(c); };
        tbody.appendChild(tr);
    });

    renderPaginacionClientes(lista.length);
}

function renderPaginacionClientes(total){
    let pag = document.getElementById("paginacionClientes");

    if(!pag){
        pag = document.createElement("div");
        pag.id = "paginacionClientes";
        pag.className = "paginacion-clientes";
        document.getElementById("tablaClientes")?.after(pag);
    }

    const totalPaginas = Math.max(1, Math.ceil(total / CLIENTES_POR_PAGINA));

    pag.innerHTML = `
        <button onclick="cambiarPaginaClientes(-1)" ${paginaClientes<=1 ? "disabled" : ""}>Anterior</button>
        <span>Página ${paginaClientes} de ${totalPaginas}</span>
        <button onclick="cambiarPaginaClientes(1)" ${paginaClientes>=totalPaginas ? "disabled" : ""}>Siguiente</button>
    `;
}

function cambiarPaginaClientes(dir){
    const totalPaginas = Math.max(1, Math.ceil(clientesFiltradosActuales.length / CLIENTES_POR_PAGINA));
    paginaClientes += dir;

    if(paginaClientes < 1) paginaClientes = 1;
    if(paginaClientes > totalPaginas) paginaClientes = totalPaginas;

    renderClientesPaginados(clientesFiltradosActuales);
}

function filtrarClientes(){
    const texto = document.getElementById("buscarCliente")?.value.toLowerCase() || "";
    const ruta = document.getElementById("filtroRuta")?.value || "";
    const estado = document.getElementById("filtroEstado")?.value || "";

    const filtrados = clientes.filter(c=>{
        const matchTexto =
            String(c.nombre||"").toLowerCase().includes(texto) ||
            String(c.ruta||"").toLowerCase().includes(texto) ||
            String(c.lugar||"").toLowerCase().includes(texto);

        const matchRuta = !ruta || String(c.ruta||"").includes(ruta);
        const matchEstado = !estado || (estado==="activo" ? activo(c) : !activo(c));

        return matchTexto && matchRuta && matchEstado;
    });

    paginaClientes = 1;
    renderClientesPaginados(filtrados);
}

function renderSolicitudes(){
    const tbody = document.getElementById("tablaSolicitudes");
    if(!tbody) return;

    tbody.innerHTML = solicitudes.length ? solicitudes.map(s=>`
        <tr>
            <td>${formatearFecha(s.fechaSolicitud)}</td>
            <td>${s.nombreCompleto || ""}</td>
            <td>${s.barrio || ""}</td>
            <td>${s.tipoServicio || ""}</td>
            <td>${s.estado || ""}</td>
        </tr>
    `).join("") : `<tr><td colspan="5">Sin solicitudes.</td></tr>`;
}

function abrirPerfilCliente(cliente){
    const historial = eventosCliente(cliente);

    const foto =
        cliente.fotoUrl ||
        (
            cliente.fotoDriveId
                ? `https://drive.google.com/thumbnail?sz=w900&id=${cliente.fotoDriveId}`
                : "../assets/banners/banner1.png"
        );

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
                    <span class="estado ${activo(cliente) ? "activo" : "inactivo"}">${activo(cliente) ? "Activo" : "Inactivo"}</span>
                </div>

                <button class="btn-mini naranja" onclick="window.print()">Exportar Ficha PDF</button>
                <button class="btn-mini azul" onclick="abrirEditorClientePorId('${escapeAttr(cliente.id)}')">Editar cliente y ubicación</button>
            </div>

            <div class="resumen-cliente">
                <div><span>Cliente desde</span><strong>${fechaCorta(cliente.updatedAt)}</strong></div>
                <div><span>Último pago</span><strong>${ultimoEvento(historial, "pago")}</strong></div>
                <div><span>Última atención</span><strong>${ultimoEvento(historial, "atencion")}</strong></div>
                <div><span>Servicio</span><strong>${cliente.tipoServicio || "Básico"} - Q${cliente.precio || "0"}</strong></div>
            </div>

            ${renderMesesCliente(cliente, historial)}

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
                        <div class="anillo-pro verde"><span>92%</span><small>Cumplimiento de Pago</small></div>
                        <div class="anillo-pro azul"><span>90%</span><small>Cumplimiento de Servicio</small></div>
                        <div class="anillo-pro morado"><span>85%</span><small>Puntualidad de Pago</small></div>
                    </div>
                </div>
            </div>

            <div class="historial-cliente">
                <h3>Historial de Eventos</h3>
                <table>
                    <thead><tr><th>Fecha y Hora</th><th>Tipo</th><th>Qué hizo</th><th>Quién lo hizo</th></tr></thead>
                    <tbody>
                        ${
                            historial.length
                            ? historial.slice(-8).reverse().map(ev => `
                                <tr>
                                    <td>${formatearFecha(ev.fecha)}</td>
                                    <td>${escapeHTML(categoriaEvento(ev))}</td>
                                    <td>${traducirEvento(ev.tipo)}</td>
                                    <td>${ev.usuario || "Sistema"}</td>
                                </tr>
                            `).join("")
                            : `<tr><td colspan="4">Este cliente aún no tiene historial registrado.</td></tr>`
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function barras(id, labels, valores){
    datosGraficas[id] = {tipo:"barras", labels, valores};
    dibujarBarras(document.getElementById(id), labels, valores);
}

function lineas(id, labels, valores){
    datosGraficas[id] = {tipo:"lineas", labels, valores};
    dibujarLineas(document.getElementById(id), labels, valores);
}

function dibujarBarras(c, labels, valores, alto=280){
    if(!c) return;
    const ctx = c.getContext("2d");
    c.width = c.offsetWidth || 900;
    c.height = alto;

    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,c.width,c.height);

    const max = Math.max(...valores,1);
    const margen = 55;
    const anchoGrupo = (c.width - margen*2) / valores.length;
    const barW = anchoGrupo * .55;

    ctx.fillStyle = "#43A047";
    ctx.font = "14px Arial";

    valores.forEach((v,i)=>{
        const x = margen + i*anchoGrupo + anchoGrupo*.2;
        const h = (c.height-100) * (v/max);
        const y = c.height-60-h;

        ctx.fillRect(x,y,barW,h);
        ctx.fillText(v,x,y-8);
        ctx.fillText(labels[i],x,c.height-25);
    });
}

function dibujarLineas(c, labels, valores, alto=280){
    if(!c) return;
    const ctx = c.getContext("2d");
    c.width = c.offsetWidth || 900;
    c.height = alto;

    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0,0,c.width,c.height);

    const max = Math.max(...valores,1);
    const margen = 70;

    ctx.strokeStyle = "#43A047";
    ctx.fillStyle = "#43A047";
    ctx.lineWidth = 4;
    ctx.beginPath();

    valores.forEach((v,i)=>{
        const x = margen + i*((c.width-margen*2)/(valores.length-1 || 1));
        const y = c.height-60 - ((c.height-120)*(v/max));
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        ctx.fillText(Number(v).toFixed(2),x-10,y-12);
        ctx.fillText(labels[i],x-35,c.height-25);
    });

    ctx.stroke();
}

function abrirGraficaGrande(id){
    const modal = document.getElementById("chartModal");
    const canvas = document.getElementById("chartGrande");
    const data = datosGraficas[id];

    if(!modal || !canvas || !data) return;

    modal.classList.add("active");

    setTimeout(()=>{
        if(data.tipo === "barras") dibujarBarras(canvas, data.labels, data.valores, 520);
        if(data.tipo === "lineas") dibujarLineas(canvas, data.labels, data.valores, 520);
    },100);
}

function cerrarGraficaGrande(){
    document.getElementById("chartModal")?.classList.remove("active");
}

function registrarClickGraficas(){
    document.querySelectorAll(".chart-card canvas").forEach(c=>{
        c.onclick = ()=>abrirGraficaGrande(c.id);
    });
}

function activarTabs(){
    document.querySelectorAll(".tab-link").forEach(link=>{
        link.addEventListener("click", e=>{
            e.preventDefault();
            const tab = link.dataset.tab;
            document.querySelectorAll(".tab-link").forEach(a=>a.classList.remove("activo"));
            document.querySelectorAll(".tab-section").forEach(s=>s.classList.remove("active"));
            link.classList.add("activo");
            document.getElementById(tab)?.classList.add("active");
            window.location.hash = tab;
            if(tab === "operativo") setTimeout(()=>mapaOperacion?.invalidateSize(), 80);
            if(tab === "jornadas-cobro") setTimeout(()=>mapaCobro?.invalidateSize(), 80);
        });
    });
}

function activarTabDesdeHash(){
    const hash = window.location.hash.replace("#","") || "dashboard";
    const link = document.querySelector('.tab-link[data-tab="' + hash + '"]');
    const section = document.getElementById(hash);

    if(link && section){
        document.querySelectorAll(".tab-link").forEach(a=>a.classList.remove("activo"));
        document.querySelectorAll(".tab-section").forEach(s=>s.classList.remove("active"));
        link.classList.add("activo");
        section.classList.add("active");
    }
}

function sumarVolumen(lista){
    return lista.reduce((acc,a)=>{
        const bolsas=Number(a.bolsas||0), cubetas=Number(a.cubetas||0), toneles=Number(a.toneles||0), costales=Number(a.costales||0);
        acc.litros += bolsas*30 + cubetas*20 + toneles*200 + costales*90;
        acc.min += bolsas*3 + cubetas*4 + toneles*35 + costales*45;
        acc.max += bolsas*6 + cubetas*8 + toneles*70 + costales*46;
        return acc;
    },{litros:0,min:0,max:0});
}

function incidencias(lista){
    return {
        chatarra: lista.filter(a=>verdad(a.chatarra)).length,
        vegetacion: lista.filter(a=>verdad(a.vegetacionEmbolsada)||verdad(a.vegetacionNoEmbolsada)).length,
        muebles: lista.filter(a=>verdad(a.muebles)).length,
        carnicos: lista.filter(a=>verdad(a.desechosCarniceros)).length
    };
}

function ultimoEvento(historial, tipo){
    const ev = historial
        .filter(e => String(e.tipo || "").toLowerCase().includes(tipo))
        .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))[0];

    return ev ? fechaCorta(ev.fecha) : "Sin registro";
}

function fechaCorta(fecha){
    const ms = fechaMs(fecha);
    return ms ? new Date(ms).toLocaleDateString("es-GT") : "Sin registro";
}

function traducirEvento(tipo){
    const t = String(tipo || "").toLowerCase();
    if(t.includes("pago")) return "Registró un pago";
    if(t.includes("cliente")) return "Actualizó cliente";
    if(t.includes("atencion")) return "Atención realizada";
    if(t.includes("no_atendido")) return "Cliente no atendido";
    return tipo || "Evento";
}

function activo(c){ return c.activo === true || c.activo === "true"; }
function verdad(v){ return v===true || v==="true" || v==="TRUE" || v===1; }
function esPago(e){ return String(e.tipo||"").toLowerCase().includes("pago"); }
function sumaMonto(lista){ return lista.reduce((a,e)=>a+Number(e.monto||0),0); }
function esMesActual(f){ const ms=fechaMs(f); if(!ms)return false; const d=new Date(ms),h=new Date(); return d.getMonth()===h.getMonth() && d.getFullYear()===h.getFullYear(); }
function mismoMes(f,m,a){ const ms=fechaMs(f); if(!ms)return false; const d=new Date(ms); return d.getMonth()===m && d.getFullYear()===a; }
function setText(id,v){ const el=document.getElementById(id); if(el)el.textContent=v; }
function formatearFecha(f){ const ms=fechaMs(f); return ms ? new Date(ms).toLocaleString("es-GT") : ""; }

document.addEventListener("input", e=>{
    if(["buscarCliente","filtroRuta","filtroEstado"].includes(e.target.id)){
        filtrarClientes();
    }
});

activarTabs();
activarTabDesdeHash();
window.addEventListener("hashchange", activarTabDesdeHash);

cargarDatosEnterprise();

function renderSolicitudes(){
    const tbody = document.getElementById("tablaSolicitudes");
    if(!tbody) return;

    const lista = filtrarSolicitudes();

    tbody.innerHTML = lista.length ? lista.map(s=>`
        <tr onclick='abrirFichaSolicitud(${JSON.stringify(s).replace(/'/g,"&#39;")})'>
            <td>${formatearFecha(s.fechaSolicitud)}</td>
            <td>${s.nombreCompleto || ""}</td>
            <td>${s.barrio || ""}</td>
            <td>${s.tipoServicio || ""}</td>
            <td>${s.estado || ""}</td>
        </tr>
    `).join("") : `<tr><td colspan="5">Sin solicitudes.</td></tr>`;
}

function filtrarSolicitudes(){
    const estado = document.getElementById("filtroSolicitudEstado")?.value || "";
    const fecha = document.getElementById("filtroSolicitudFecha")?.value || "";

    return solicitudes.filter(s=>{
        const matchEstado = !estado || String(s.estado||"").toUpperCase() === estado;
        const d = new Date(s.fechaSolicitud);
        const hoy = new Date();

        let matchFecha = true;

        if(fecha === "hoy"){
            matchFecha = d.toDateString() === hoy.toDateString();
        }

        if(fecha === "semana"){
            const hace7 = new Date();
            hace7.setDate(hoy.getDate() - 7);
            matchFecha = d >= hace7;
        }

        if(fecha === "mes"){
            matchFecha = d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear();
        }

        return matchEstado && matchFecha;
    });
}

function abrirFichaSolicitud(s){
    const foto =
        s.fotoUrl ||
        (
            s.fotoDriveId
                ? `https://drive.google.com/thumbnail?sz=w900&id=${s.fotoDriveId}`
                : "../assets/banners/banner1.png"
        );

    const maps = s.lat && s.lng
        ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(s.lng)-0.003},${Number(s.lat)-0.003},${Number(s.lng)+0.003},${Number(s.lat)+0.003}&layer=mapnik&marker=${s.lat},${s.lng}`
        : "";

    const modal = document.createElement("div");
    modal.className = "cliente-modal";

    modal.innerHTML = `
        <div class="cliente-perfil ficha-pro">
            <button class="cerrar-modal" onclick="this.closest('.cliente-modal').remove()">×</button>

            <div class="ficha-top">
                <img src="${foto}" class="foto-ficha-pro">

                <div class="ficha-titulo">
                    <h2>${s.nombreCompleto || "Solicitud sin nombre"}</h2>
                    <p>Solicitud ID: ${s.idSolicitud || ""}</p>
                    <span class="estado activo">${s.estado || "PENDIENTE"}</span>
                </div>
            </div>

            <div class="ficha-grid-pro">
                <div class="info-box">
                    <h3>Datos de la Solicitud</h3>
                    <p><strong>Fecha:</strong> ${formatearFecha(s.fechaSolicitud)}</p>
                    <p><strong>Nombre:</strong> ${s.nombreCompleto || ""}</p>
                    <p><strong>Teléfono:</strong> ${s.telefono || ""}</p>
                    <p><strong>Barrio:</strong> ${s.barrio || ""}</p>
                    <p><strong>Tipo:</strong> ${s.tipoServicio || ""}</p>
                </div>

                <div class="info-box">
                    <h3>Ubicación</h3>
                    ${
                        maps
                        ? `<iframe src="${maps}" style="width:100%;height:330px;border:0;border-radius:14px;"></iframe>`
                        : `<p>Sin coordenadas registradas.</p>`
                    }
                </div>
            </div>

            <div class="acciones-solicitud">
                <button onclick="cambiarEstadoSolicitud('${s.idSolicitud}','APROBADA')" class="btn-mini verde">Aprobar y crear cliente</button>
                <button onclick="cambiarEstadoSolicitud('${s.idSolicitud}','DENEGADA')" class="btn-mini rojo">Denegar</button>
                <button onclick="cambiarEstadoSolicitud('${s.idSolicitud}','EN_REVISION')" class="btn-mini naranja">En revisión</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

async function cambiarEstadoSolicitud(idSolicitud, estado){
    let justificacion = "";

    const solicitud = solicitudes.find(
        s => String(s.idSolicitud) === String(idSolicitud)
    );

    if(!solicitud){
        alert("No se encontró la solicitud.");
        return;
    }

    let datosAprobacion = {};

    if(estado === "APROBADA"){
        const ruta = prompt(
            "Ruta del cliente:\n\n" +
            "Ejemplos: Centro, Amistad, Ixobel"
        );

        if(!ruta || !ruta.trim()){
            alert("La ruta es obligatoria.");
            return;
        }

        const precioTexto = prompt(
            "Tarifa mensual en quetzales:",
            "60"
        );

        const precio = Number(precioTexto);

        if(!Number.isFinite(precio) || precio <= 0){
            alert("La tarifa no es válida.");
            return;
        }

        const diaTexto = prompt(
            "Día de pago (1 al 31):",
            String(new Date().getDate())
        );

        const diaPago = Number(diaTexto);

        if(
            !Number.isInteger(diaPago) ||
            diaPago < 1 ||
            diaPago > 31
        ){
            alert("El día de pago no es válido.");
            return;
        }

        datosAprobacion = {
            ruta: ruta.trim(),
            precio,
            diaPago
        };
    }

    if(estado === "DENEGADA"){
        justificacion = prompt(
            "Escribe la justificación para denegar esta solicitud:"
        );

        if(!justificacion || !justificacion.trim()){
            alert("La justificación es obligatoria.");
            return;
        }
    }

    try{
        const {
            actualizarEstadoSolicitud
        } = await import("/js/firebase-service.js?v=20260830-4");

        const resultado = await actualizarEstadoSolicitud(
            solicitud,
            estado,
            {
                usuarioRevision: "enterprise",
                justificacion,
                ...datosAprobacion
            }
        );

        solicitudes = solicitudes.map(s => {
            if(String(s.idSolicitud) === String(idSolicitud)){
                return {
                    ...s,
                    estado: resultado.estado || estado,
                    justificacion,
                    clienteIdGenerado:
                        resultado.clienteIdGenerado ||
                        s.clienteIdGenerado ||
                        ""
                };
            }

            return s;
        });

        renderSolicitudes();
        renderKpis();

        document.querySelector(".cliente-modal")?.remove();

        if(resultado.estado === "CONVERTIDA_CLIENTE"){
            alert(
                "Solicitud convertida en cliente correctamente.\n\n" +
                "Cliente Firebase: " +
                resultado.clienteIdGenerado
            );
        }

    }catch(error){
        console.error(
            "Error actualizando solicitud en Firebase:",
            error
        );

        alert(
            "No se pudo actualizar la solicitud.\n\n" +
            (error.message || error)
        );
    }
}

/* =========================================================
   CLIENTES: HISTORIAL, EDICION Y COORDENADAS
   ========================================================= */

function clienteUid(cliente){
    return String(cliente?.globalUuid || cliente?.id || "");
}

function perteneceACliente(registro, cliente){
    const ids = [cliente?.id, cliente?.globalUuid, cliente?.clienteUuid].filter(Boolean).map(String);
    const registroId = String(registro?.clienteId || registro?.clienteUuid || registro?.globalUuid || "");
    const mismoNombre = normalizar(registro?.clienteNombre) === normalizar(cliente?.nombre);
    return ids.includes(registroId) || (!!registroId === false && mismoNombre) || mismoNombre;
}

function eventosCliente(cliente){
    return [...eventos, ...atenciones, ...noAtendidos]
        .filter(registro => perteneceACliente(registro, cliente))
        .map(registro => ({...registro, fecha: registro.fecha || registro.fechaHora}))
        .sort((a,b) => fechaMs(b.fecha) - fechaMs(a.fecha));
}

function renderMesesCliente(cliente, historial){
    const alta = fechaMs(cliente.fechaAlta || cliente.createdAt || cliente.updatedAt);
    const pagos = new Set(historial.filter(esPago).filter(p=>String(p.estado||"ACTIVO")!=="ANULADO").map(obtenerPeriodoPago));
    const hoy = new Date();
    const meses = [];
    for(let i=11;i>=0;i--){
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1);
        const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,"0")}`;
        const finMes = new Date(fecha.getFullYear(), fecha.getMonth()+1, 0, 23,59,59).getTime();
        let estado = "atrasado";
        if (alta && finMes < alta) estado = "sin-registro";
        else if (pagos.has(periodo)) estado = "pagado";
        else if (i === 0) estado = "pendiente";
        meses.push(`<div class="mes-estado ${estado}" title="${periodo}"><strong>${fecha.toLocaleDateString("es-GT",{month:"short"})}</strong><small>${fecha.getFullYear()}</small></div>`);
    }
    return `<div class="historial-cliente"><h3>Estado de los últimos 12 meses</h3><div class="meses-grid">${meses.join("")}</div><p><small>Gris: aún no registrado · Verde: pagado · Rojo: atrasado · Amarillo: mes actual pendiente</small></p></div>`;
}

function categoriaEvento(ev){
    const tipo=normalizar(ev.tipo);
    if(tipo.includes("pago"))return "Pago";
    if(tipo.includes("no_atendido"))return "No atendido";
    if(tipo.includes("atencion"))return "Atención";
    return "Evento";
}

function abrirEditorClientePorId(id){
    const cliente = clientes.find(c => clienteUid(c) === String(id) || String(c.id) === String(id));
    if (cliente) abrirEditorCliente(cliente);
}

function abrirEditorCliente(cliente){
    const latInicial = numeroValido(cliente.lat) ? Number(cliente.lat) : 16.3267;
    const lngInicial = numeroValido(cliente.lng) ? Number(cliente.lng) : -89.4227;
    const modal = document.createElement("div");
    modal.className = "cliente-modal";
    modal.innerHTML = `
        <div class="cliente-perfil ficha-pro">
            <button class="cerrar-modal" data-cerrar>×</button>
            <h2>Editar cliente</h2>
            <p>Corrige los datos maestros y arrastra el pin hasta la entrada real del cliente.</p>
            <form id="formEditarCliente" class="form-grid">
                <label>Nombre<input name="nombre" required value="${escapeAttr(cliente.nombre || "")}"></label>
                <label>Teléfono<input name="telefono" value="${escapeAttr(cliente.telefono || "")}"></label>
                <label>Ruta<select name="ruta">${opcionesRuta(cliente.ruta)}</select></label>
                <label>Barrio o lugar<input name="lugar" value="${escapeAttr(cliente.lugar || "")}"></label>
                <label>Día de pago<input name="diaPago" type="number" min="1" max="31" value="${escapeAttr(cliente.diaPago || "")}"></label>
                <label>Servicio<input name="tipoServicio" value="${escapeAttr(cliente.tipoServicio || "")}"></label>
                <label>Precio<input name="precio" type="number" min="0" step="0.01" value="${escapeAttr(cliente.precio || 0)}"></label>
                <label>Estado<select name="activo"><option value="true" ${activo(cliente)?"selected":""}>Activo</option><option value="false" ${!activo(cliente)?"selected":""}>Inactivo</option></select></label>
            </form>
            <div id="mapaEditarCliente" class="mapa-editor"></div>
            <div class="coordenadas-editor">
                <input id="editarLat" type="number" step="any" value="${latInicial}">
                <input id="editarLng" type="number" step="any" value="${lngInicial}">
                <button class="btn-mini azul" id="centrarCoordenadas">Centrar pin</button>
            </div>
            <div class="acciones"><button class="btn-mini verde" id="guardarCliente">Guardar cambios</button><button class="btn-mini" data-cerrar>Cancelar</button></div>
        </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-cerrar]").forEach(b => b.onclick = () => cerrarModalCliente(modal));
    setTimeout(() => iniciarMapaEditor(latInicial, lngInicial), 50);
    modal.querySelector("#centrarCoordenadas").onclick = () => {
        const lat = Number(modal.querySelector("#editarLat").value);
        const lng = Number(modal.querySelector("#editarLng").value);
        if (mapaEdicion && numeroValido(lat) && numeroValido(lng)) {
            mapaEdicion.marker.setLatLng([lat,lng]);
            mapaEdicion.map.setView([lat,lng], 18);
        }
    };
    modal.querySelector("#guardarCliente").onclick = async () => {
        const form = new FormData(modal.querySelector("#formEditarCliente"));
        const cambios = Object.fromEntries(form.entries());
        cambios.diaPago = Number(cambios.diaPago) || null;
        cambios.precio = Number(cambios.precio) || 0;
        cambios.activo = cambios.activo === "true";
        cambios.lat = Number(modal.querySelector("#editarLat").value);
        cambios.lng = Number(modal.querySelector("#editarLng").value);
        if (!numeroValido(cambios.lat) || !numeroValido(cambios.lng)) return alert("Las coordenadas no son válidas.");
        try{
            await firebaseEnterprise.actualizarCliente(cliente.id, cambios);
            Object.assign(cliente, cambios, {updatedAt: Date.now(), syncStatus:"PENDING"});
            renderClientesPaginados(clientesFiltradosActuales);
            prepararOperativo();
            cerrarModalCliente(modal);
        }catch(error){ alert("No se pudo actualizar el cliente: " + error.message); }
    };
}

function iniciarMapaEditor(lat, lng){
    if (!window.L) return alert("No se pudo cargar el mapa.");
    const map = L.map("mapaEditarCliente").setView([lat,lng], 18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:20, attribution:"© OpenStreetMap"}).addTo(map);
    const marker = L.marker([lat,lng], {draggable:true}).addTo(map);
    marker.on("dragend", () => {
        const p = marker.getLatLng();
        document.getElementById("editarLat").value = p.lat.toFixed(7);
        document.getElementById("editarLng").value = p.lng.toFixed(7);
    });
    mapaEdicion = {map, marker};
    setTimeout(() => map.invalidateSize(), 100);
}

function cerrarModalCliente(modal){
    if (mapaEdicion?.map) mapaEdicion.map.remove();
    mapaEdicion = null;
    modal.remove();
}

/* =========================================================
   COBROS Y RECIBOS MANUALES
   ========================================================= */

function renderCobros(){
    const selectorMes = document.getElementById("mesCobros");
    if (selectorMes && !selectorMes.value) selectorMes.value = periodoActual();
    const busqueda = normalizar(document.getElementById("buscarCobro")?.value);
    const periodo = selectorMes?.value || periodoActual();
    const origen = document.getElementById("origenCobros")?.value || "";
    const lista = eventos.filter(esPago).filter(p => {
        const periodoPago = obtenerPeriodoPago(p);
        const texto = normalizar(`${p.clienteNombre || ""} ${p.reciboNumero || ""}`);
        return (!busqueda || texto.includes(busqueda)) && (!periodo || periodoPago === periodo) && (!origen || String(p.origen || "APP_ANDROID") === origen);
    }).sort((a,b) => fechaMs(b.fecha || b.fechaHora) - fechaMs(a.fecha || a.fechaHora));

    const total = sumaMonto(lista.filter(p => String(p.estado || "ACTIVO") !== "ANULADO"));
    const manual = sumaMonto(lista.filter(p => p.origen === "RECIBO_MANUAL"));
    const esperados = clientes.filter(activo).reduce((s,c) => s + Number(c.precio || 0), 0);
    const tbody = document.getElementById("tablaCobros");
    const metricas = document.getElementById("metricasCobros");
    if (metricas) metricas.innerHTML = [
        ["Esperado del mes", moneda(esperados)], ["Cobrado", moneda(total)],
        ["Pendiente estimado", moneda(Math.max(0, esperados-total))], ["Recibos manuales", moneda(manual)]
    ].map(([t,v]) => tarjetaMetrica(t,v)).join("");
    if (tbody) tbody.innerHTML = lista.length ? lista.map(p => `<tr><td>${formatearFecha(p.fecha || p.fechaHora)}</td><td>${escapeHTML(p.clienteNombre || nombreCliente(p.clienteId))}</td><td>${escapeHTML(obtenerPeriodoPago(p))}</td><td>${moneda(p.monto)}</td><td>${escapeHTML(p.reciboNumero || "—")}</td><td>${p.origen === "RECIBO_MANUAL" ? "Manual" : "Aplicación"}</td></tr>`).join("") : `<tr><td colspan="6">No hay cobros para este filtro.</td></tr>`;
}

function abrirPagoManual(clientePreseleccionado){
    const modal = document.createElement("div");
    modal.className = "cliente-modal";
    const opciones = clientes.filter(activo).sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))).map(c => `<option value="${escapeAttr(clienteUid(c))}" ${clientePreseleccionado && clienteUid(c)===clienteUid(clientePreseleccionado)?"selected":""}>${escapeHTML(c.nombre)} — ${escapeHTML(c.lugar || "")}</option>`).join("");
    modal.innerHTML = `<div class="cliente-perfil ficha-pro"><button class="cerrar-modal" data-cerrar>×</button><h2>Registrar recibo manual</h2><p>Este registro entrará al balance y será visible para la aplicación Android.</p><form id="formPagoManual" class="form-grid"><label>Cliente<select name="clienteId" required><option value="">Seleccione</option>${opciones}</select></label><label>Mes pagado<input name="periodo" type="month" required value="${periodoActual()}"></label><label>Monto<input name="monto" type="number" min="0.01" step="0.01" required value="${escapeAttr(clientePreseleccionado?.precio || "")}"></label><label>Fecha del pago<input name="fecha" type="datetime-local" required value="${fechaLocalInput()}"></label><label>Número de recibo<input name="reciboNumero" required></label><label>Método<select name="metodoPago"><option>EFECTIVO</option><option>TRANSFERENCIA</option><option>DEPOSITO</option></select></label><label style="grid-column:1/-1">Observación<textarea name="observacion"></textarea></label></form><div class="acciones"><button class="btn-mini verde" id="guardarPagoManual">Guardar pago</button><button class="btn-mini" data-cerrar>Cancelar</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-cerrar]").forEach(b => b.onclick = () => modal.remove());
    modal.querySelector("#guardarPagoManual").onclick = async () => {
        const datos = Object.fromEntries(new FormData(modal.querySelector("#formPagoManual")).entries());
        const cliente = clientes.find(c => clienteUid(c) === datos.clienteId);
        if (!cliente) return alert("Selecciona un cliente.");
        datos.clienteNombre = cliente.nombre;
        datos.fecha = new Date(datos.fecha).toISOString();
        try{
            const resultado = await firebaseEnterprise.registrarPagoManual(datos);
            eventos.push({...datos, id:resultado.pagoId, tipo:"PAGO", mes:Number(datos.periodo.slice(5)), anio:Number(datos.periodo.slice(0,4)), origen:"RECIBO_MANUAL", estado:"ACTIVO"});
            renderCobros(); renderKpis(); renderClientesPaginados(clientesFiltradosActuales); modal.remove();
        }catch(error){ alert("No se pudo registrar el pago: " + error.message); }
    };
}

/* =========================================================
   OPERATIVO: ASIGNACION, BALANCE Y ORDEN GEOGRAFICO
   ========================================================= */

function prepararOperativo(){
    const fecha = document.getElementById("jornadaFecha");
    if (fecha && !fecha.value) fecha.value = new Date().toISOString().slice(0,10);
    const barrio = document.getElementById("jornadaBarrio");
    if (barrio) {
        const actual = barrio.value;
        const barrios = [...new Set(clientes.map(c=>String(c.lugar||"").trim()).filter(Boolean))].sort();
        barrio.innerHTML = `<option value="">Todos</option>` + barrios.map(b=>`<option ${b===actual?"selected":""}>${escapeHTML(b)}</option>`).join("");
    }
    renderTablaOperacion(); renderJornadas(); iniciarMapaOperacion();
}

function seleccionarGrupoOperativo(){
    const ruta = document.getElementById("jornadaRuta")?.value || "";
    const barrio = document.getElementById("jornadaBarrio")?.value || "";
    const elegibles = clientes.filter(c => activo(c) && (!ruta || normalizar(c.ruta)===normalizar(ruta)) && (!barrio || c.lugar===barrio));
    seleccionOperativa = new Set(elegibles.map(clienteUid));
    ordenOperativo = elegibles.map(clienteUid);
    renderTablaOperacion(); actualizarMapaOperacion(); actualizarMetricasOperacion();
}

function renderTablaOperacion(){
    const tbody = document.getElementById("tablaOperacion");
    if (!tbody) return;
    const lista = clientes.filter(activo).sort((a,b) => {
        const ia = ordenOperativo.indexOf(clienteUid(a)), ib = ordenOperativo.indexOf(clienteUid(b));
        if (ia >= 0 || ib >= 0) return (ia < 0 ? 99999 : ia) - (ib < 0 ? 99999 : ib);
        return String(a.nombre).localeCompare(String(b.nombre));
    });
    tbody.innerHTML = lista.map(c => { const id=clienteUid(c), orden=ordenOperativo.indexOf(id); return `<tr><td><input type="checkbox" data-operativo-id="${escapeAttr(id)}" ${seleccionOperativa.has(id)?"checked":""}></td><td>${orden>=0?orden+1:"—"}</td><td>${escapeHTML(c.nombre||"")}</td><td>${escapeHTML(c.lugar||"")}</td><td>${escapeHTML(c.ruta||"")}</td><td>${numeroValido(c.lat)&&numeroValido(c.lng)?"Sí":"No"}</td></tr>`; }).join("");
    tbody.querySelectorAll("[data-operativo-id]").forEach(check => check.onchange = () => {
        const id=check.dataset.operativoId;
        if(check.checked){seleccionOperativa.add(id); if(!ordenOperativo.includes(id)) ordenOperativo.push(id);}else{seleccionOperativa.delete(id); ordenOperativo=ordenOperativo.filter(x=>x!==id);}
        actualizarMapaOperacion(); actualizarMetricasOperacion();
    });
    actualizarMetricasOperacion();
}

function optimizarSeleccionOperativa(){
    const puntos = clientes.filter(c => seleccionOperativa.has(clienteUid(c)) && numeroValido(c.lat) && numeroValido(c.lng));
    if (!puntos.length) return alert("Los clientes seleccionados no tienen coordenadas válidas.");
    const restantes = [...puntos]; const orden=[]; let actual=restantes.shift(); orden.push(actual);
    while(restantes.length){
        let mejor=0, distancia=Infinity;
        restantes.forEach((c,i)=>{const d=haversine(actual,c);if(d<distancia){distancia=d;mejor=i;}});
        actual=restantes.splice(mejor,1)[0]; orden.push(actual);
    }
    const sinCoordenadas = clientes.filter(c => seleccionOperativa.has(clienteUid(c)) && !orden.some(o=>clienteUid(o)===clienteUid(c)));
    ordenOperativo = [...orden,...sinCoordenadas].map(clienteUid);
    renderTablaOperacion(); actualizarMapaOperacion();
}

function iniciarMapaOperacion(){
    const contenedor=document.getElementById("mapaOperativo"); if(!contenedor||!window.L||mapaOperacion) return;
    mapaOperacion=L.map(contenedor).setView([16.3267,-89.4227],13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,attribution:"© OpenStreetMap"}).addTo(mapaOperacion);
    capaOperacion=L.layerGroup().addTo(mapaOperacion); setTimeout(()=>mapaOperacion.invalidateSize(),100);
}

function actualizarMapaOperacion(){
    if(!mapaOperacion||!capaOperacion)return; capaOperacion.clearLayers();
    const puntos=ordenOperativo.map(id=>clientes.find(c=>clienteUid(c)===id)).filter(c=>c&&seleccionOperativa.has(clienteUid(c))&&numeroValido(c.lat)&&numeroValido(c.lng));
    puntos.forEach((c,i)=>L.marker([Number(c.lat),Number(c.lng)]).bindTooltip(`${i+1}. ${escapeHTML(c.nombre||"")}`).addTo(capaOperacion));
    if(puntos.length>1)L.polyline(puntos.map(c=>[Number(c.lat),Number(c.lng)]),{color:"#1565C0",weight:4}).addTo(capaOperacion);
    if(puntos.length)mapaOperacion.fitBounds(L.latLngBounds(puntos.map(c=>[Number(c.lat),Number(c.lng)])).pad(.12));
}

function metricasOperacion(){
    const lista=ordenOperativo.map(id=>clientes.find(c=>clienteUid(c)===id)).filter(c=>c&&seleccionOperativa.has(clienteUid(c)));
    const coordenados=lista.filter(c=>numeroValido(c.lat)&&numeroValido(c.lng)); let km=0;
    for(let i=1;i<coordenados.length;i++)km+=haversine(coordenados[i-1],coordenados[i]);
    const minutosServicio=lista.reduce((s,c)=>s+minutosPorServicio(c),0);
    const minutosTraslado=Math.round((km/18)*60);
    return {lista,km,minutos:minutosServicio+minutosTraslado,coordenados:coordenados.length};
}

function actualizarMetricasOperacion(){
    const el=document.getElementById("metricasOperativas"); if(!el)return; const m=metricasOperacion();
    el.innerHTML=[["Clientes",m.lista.length],["Con coordenadas",`${m.coordenados}/${m.lista.length}`],["Distancia estimada",`${m.km.toFixed(1)} km`],["Tiempo estimado",duracion(m.minutos)]].map(([t,v])=>tarjetaMetrica(t,v)).join("");
}

async function guardarAsignacionOperativa(){
    const m=metricasOperacion();
    const datos={fecha:document.getElementById("jornadaFecha")?.value,piloto:document.getElementById("jornadaPiloto")?.value,ayudantes:document.getElementById("jornadaAyudantes")?.value,vehiculo:document.getElementById("jornadaVehiculo")?.value,ruta:document.getElementById("jornadaRuta")?.value,barrios:[...new Set(m.lista.map(c=>c.lugar).filter(Boolean))],clienteIds:m.lista.map(clienteUid),ordenClienteIds:m.lista.map(clienteUid),distanciaKmEstimada:Number(m.km.toFixed(2)),minutosEstimados:m.minutos,usuario:"enterprise"};
    try{const r=await firebaseEnterprise.guardarJornadaOperativa(datos);jornadasOperativas.push({...datos,id:r.jornadaId,estado:"ASIGNADA"});renderJornadas();alert("Jornada asignada correctamente.");}catch(error){alert("No se pudo guardar la jornada: "+error.message);}
}

function renderJornadas(){
    const tbody=document.getElementById("tablaJornadas");if(!tbody)return;
    tbody.innerHTML=jornadasOperativas.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).map(j=>`<tr><td>${escapeHTML(j.fecha||"")}</td><td>${escapeHTML(j.piloto||"")}</td><td>${escapeHTML(j.vehiculo||"—")}</td><td>${Number(j.cantidadClientes||j.clienteIds?.length||0)}</td><td>${Number(j.distanciaKmEstimada||0).toFixed(1)} km</td><td>${duracion(j.minutosEstimados||0)}</td><td>${escapeHTML(j.estado||"")}</td></tr>`).join("")||`<tr><td colspan="7">No hay jornadas guardadas.</td></tr>`;
}

/* =========================================================
   JORNADAS DE COBRO: RECONSTRUCCION Y ASIGNACION
   ========================================================= */

function prepararJornadasCobro(){
    const fecha=document.getElementById("cobroJornadaFecha");
    const periodo=document.getElementById("cobroJornadaPeriodo");
    if(fecha&&!fecha.value)fecha.value=fechaDiaLocal(new Date());
    if(periodo&&!periodo.value)periodo.value=periodoActual();
    const barrio=document.getElementById("cobroJornadaBarrio");
    if(barrio){
        const actual=barrio.value;
        const barrios=[...new Set(clientes.map(c=>String(c.lugar||"").trim()).filter(Boolean))].sort();
        barrio.innerHTML=`<option value="">Todos</option>`+barrios.map(b=>`<option ${b===actual?"selected":""}>${escapeHTML(b)}</option>`).join("");
    }
    renderJornadaCobro();
    renderJornadasCobroGuardadas();
    iniciarMapaCobro();
}

function filtrosJornadaCobro(cliente){
    const ruta=document.getElementById("cobroJornadaRuta")?.value||"";
    const barrio=document.getElementById("cobroJornadaBarrio")?.value||"";
    return (!ruta||normalizar(cliente?.ruta)===normalizar(ruta))&&(!barrio||String(cliente?.lugar||"")===barrio);
}

function reconstruirJornadaCobro(){
    const fecha=document.getElementById("cobroJornadaFecha")?.value;
    const cobrador=normalizar(document.getElementById("cobroJornadaCobrador")?.value);
    if(!fecha)return alert("Selecciona la fecha que deseas reconstruir.");
    pagosReconstruidos=eventos.filter(esPago).filter(p=>{
        const cliente=clientes.find(c=>perteneceACliente(p,c));
        return fechaDiaLocal(p.fecha||p.fechaHora)===fecha&&(!cobrador||normalizar(p.usuario).includes(cobrador))&&cliente&&filtrosJornadaCobro(cliente)&&String(p.estado||"ACTIVO")!=="ANULADO";
    }).sort((a,b)=>fechaMs(a.fecha||a.fechaHora)-fechaMs(b.fecha||b.fechaHora));
    const ids=[];
    pagosReconstruidos.forEach(p=>{const c=clientes.find(x=>perteneceACliente(p,x));const id=c&&clienteUid(c);if(id&&!ids.includes(id))ids.push(id);});
    seleccionCobro=new Set(ids); ordenCobro=ids; modoJornadaCobro="RECONSTRUIDA";
    renderJornadaCobro(); actualizarMapaCobro();
    if(!ids.length)alert("No se encontraron pagos para esos filtros.");
}

function cargarPendientesCobro(){
    const periodo=document.getElementById("cobroJornadaPeriodo")?.value||periodoActual();
    const pagados=new Set(eventos.filter(esPago).filter(p=>obtenerPeriodoPago(p)===periodo&&String(p.estado||"ACTIVO")!=="ANULADO").map(p=>{
        const c=clientes.find(x=>perteneceACliente(p,x));return c?clienteUid(c):String(p.clienteId||"");
    }));
    const pendientes=clientes.filter(c=>activo(c)&&filtrosJornadaCobro(c)&&!pagados.has(clienteUid(c)));
    seleccionCobro=new Set(pendientes.map(clienteUid)); ordenCobro=pendientes.map(clienteUid); pagosReconstruidos=[]; modoJornadaCobro="ASIGNADA";
    renderJornadaCobro(); actualizarMapaCobro();
}

function datosFilaCobro(cliente){
    const periodo=document.getElementById("cobroJornadaPeriodo")?.value||periodoActual();
    const pagos=pagosReconstruidos.filter(p=>perteneceACliente(p,cliente));
    return {periodo:pagos[0]?obtenerPeriodoPago(pagos[0]):periodo,monto:pagos.length?sumaMonto(pagos):Number(cliente.precio||0),resultado:pagos.length?"Cobrado":"Pendiente"};
}

function renderJornadaCobro(){
    const tbody=document.getElementById("tablaJornadaCobro");if(!tbody)return;
    const lista=ordenCobro.map(id=>clientes.find(c=>clienteUid(c)===id)).filter(c=>c&&seleccionCobro.has(clienteUid(c)));
    tbody.innerHTML=lista.length?lista.map((c,i)=>{const d=datosFilaCobro(c);return `<tr><td><input type="checkbox" data-cobro-id="${escapeAttr(clienteUid(c))}" checked></td><td>${i+1}</td><td>${escapeHTML(c.nombre||"")}</td><td>${escapeHTML(c.lugar||"")}</td><td>${escapeHTML(d.periodo)}</td><td>${moneda(d.monto)}</td><td>${d.resultado}</td></tr>`;}).join(""):`<tr><td colspan="7">Usa “Reconstruir jornada” o “Cargar pendientes”.</td></tr>`;
    tbody.querySelectorAll("[data-cobro-id]").forEach(check=>check.onchange=()=>{const id=check.dataset.cobroId;if(check.checked)seleccionCobro.add(id);else{seleccionCobro.delete(id);ordenCobro=ordenCobro.filter(x=>x!==id);}renderJornadaCobro();actualizarMapaCobro();});
    actualizarMetricasCobro();
}

function ordenarJornadaCobro(){
    const puntos=clientes.filter(c=>seleccionCobro.has(clienteUid(c))&&numeroValido(c.lat)&&numeroValido(c.lng));
    if(!puntos.length)return alert("Los clientes seleccionados no tienen coordenadas válidas.");
    const restantes=[...puntos],orden=[];let actual=restantes.shift();orden.push(actual);
    while(restantes.length){let mejor=0,distancia=Infinity;restantes.forEach((c,i)=>{const d=haversine(actual,c);if(d<distancia){distancia=d;mejor=i;}});actual=restantes.splice(mejor,1)[0];orden.push(actual);}
    const sinCoordenadas=clientes.filter(c=>seleccionCobro.has(clienteUid(c))&&!orden.some(o=>clienteUid(o)===clienteUid(c)));
    ordenCobro=[...orden,...sinCoordenadas].map(clienteUid);renderJornadaCobro();actualizarMapaCobro();
}

function metricasCobroActual(){
    const lista=ordenCobro.map(id=>clientes.find(c=>clienteUid(c)===id)).filter(c=>c&&seleccionCobro.has(clienteUid(c)));
    const coordenados=lista.filter(c=>numeroValido(c.lat)&&numeroValido(c.lng));let km=0;
    for(let i=1;i<coordenados.length;i++)km+=haversine(coordenados[i-1],coordenados[i]);
    const cobrado=modoJornadaCobro==="RECONSTRUIDA"?sumaMonto(pagosReconstruidos.filter(p=>lista.some(c=>perteneceACliente(p,c)))):0;
    const esperado=lista.reduce((s,c)=>s+Number(c.precio||0),0);
    let minutos=Math.round((km/18)*60)+lista.length*4;
    if(modoJornadaCobro==="RECONSTRUIDA"&&pagosReconstruidos.length>1)minutos=Math.max(0,Math.round((fechaMs(pagosReconstruidos.at(-1).fecha||pagosReconstruidos.at(-1).fechaHora)-fechaMs(pagosReconstruidos[0].fecha||pagosReconstruidos[0].fechaHora))/60000));
    return {lista,coordenados,km,cobrado,esperado,minutos};
}

function actualizarMetricasCobro(){
    const el=document.getElementById("metricasJornadaCobro");if(!el)return;const m=metricasCobroActual();
    el.innerHTML=[["Modo",modoJornadaCobro==="RECONSTRUIDA"?"Reconstruida":"Asignación"],["Clientes",m.lista.length],["Esperado",moneda(m.esperado)],["Cobrado",moneda(m.cobrado)],["Distancia",`${m.km.toFixed(1)} km`],["Tiempo",duracion(m.minutos)]].map(([t,v])=>tarjetaMetrica(t,v)).join("");
}

function iniciarMapaCobro(){
    const contenedor=document.getElementById("mapaJornadaCobro");if(!contenedor||!window.L||mapaCobro)return;
    mapaCobro=L.map(contenedor).setView([16.3267,-89.4227],13);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,attribution:"© OpenStreetMap"}).addTo(mapaCobro);capaCobro=L.layerGroup().addTo(mapaCobro);setTimeout(()=>mapaCobro.invalidateSize(),100);
}

function actualizarMapaCobro(){
    if(!mapaCobro||!capaCobro)return;capaCobro.clearLayers();
    const puntos=ordenCobro.map(id=>clientes.find(c=>clienteUid(c)===id)).filter(c=>c&&seleccionCobro.has(clienteUid(c))&&numeroValido(c.lat)&&numeroValido(c.lng));
    puntos.forEach((c,i)=>L.marker([Number(c.lat),Number(c.lng)]).bindTooltip(`${i+1}. ${escapeHTML(c.nombre||"")}`).addTo(capaCobro));
    if(puntos.length>1)L.polyline(puntos.map(c=>[Number(c.lat),Number(c.lng)]),{color:"#FB8C00",weight:4}).addTo(capaCobro);
    if(puntos.length)mapaCobro.fitBounds(L.latLngBounds(puntos.map(c=>[Number(c.lat),Number(c.lng)])).pad(.12));
}

async function guardarJornadaCobroActual(){
    const m=metricasCobroActual(),cobrador=document.getElementById("cobroJornadaCobrador")?.value;
    if(!cobrador?.trim())return alert("Escribe el nombre del cobrador responsable.");
    const datos={fecha:document.getElementById("cobroJornadaFecha")?.value,periodo:document.getElementById("cobroJornadaPeriodo")?.value,cobrador,ruta:document.getElementById("cobroJornadaRuta")?.value,barrios:[...new Set(m.lista.map(c=>c.lugar).filter(Boolean))],clienteIds:m.lista.map(clienteUid),ordenClienteIds:m.lista.map(clienteUid),montoEsperado:m.esperado,montoCobrado:m.cobrado,distanciaKmEstimada:Number(m.km.toFixed(2)),minutosEstimados:m.minutos,tipo:modoJornadaCobro,estado:modoJornadaCobro==="RECONSTRUIDA"?"CERRADA":"ASIGNADA",pagosIds:pagosReconstruidos.map(p=>p.id).filter(Boolean),usuario:"enterprise"};
    try{const r=await firebaseEnterprise.guardarJornadaCobro(datos);jornadasCobro.push({...datos,id:r.jornadaId,cantidadClientes:datos.clienteIds.length});renderJornadasCobroGuardadas();alert(modoJornadaCobro==="RECONSTRUIDA"?"Jornada reconstruida y guardada.":"Jornada asignada al cobrador.");}catch(error){alert("No se pudo guardar la jornada de cobro: "+error.message);}
}

function renderJornadasCobroGuardadas(){
    const tbody=document.getElementById("tablaJornadasCobroGuardadas");if(!tbody)return;
    tbody.innerHTML=jornadasCobro.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).map(j=>`<tr><td>${escapeHTML(j.fecha||"")}</td><td>${escapeHTML(j.cobrador||"")}</td><td>${j.tipo==="RECONSTRUIDA"?"Reconstruida":"Asignada"}</td><td>${Number(j.cantidadClientes||j.clienteIds?.length||0)}</td><td>${moneda(j.montoEsperado)}</td><td>${moneda(j.montoCobrado)}</td><td>${escapeHTML(j.estado||"")}</td></tr>`).join("")||`<tr><td colspan="7">No hay jornadas de cobro guardadas.</td></tr>`;
}

/* UTILIDADES COMPARTIDAS */
function opcionesRuta(actual){return ["El Centro","Ixobel","La Amistad"].map(r=>`<option ${normalizar(r)===normalizar(actual)?"selected":""}>${r}</option>`).join("");}
function normalizar(v){return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function escapeHTML(v){const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML;}
function escapeAttr(v){return escapeHTML(v).replace(/"/g,"&quot;");}
function numeroValido(v){return v!==null&&v!==""&&Number.isFinite(Number(v));}
function fechaMs(v){if(v?.toDate)return v.toDate().getTime();if(typeof v==="number")return v;const n=new Date(v).getTime();return Number.isFinite(n)?n:0;}
function periodoActual(){return new Date().toISOString().slice(0,7);}
function fechaLocalInput(){const d=new Date(Date.now()-new Date().getTimezoneOffset()*60000);return d.toISOString().slice(0,16);}
function fechaDiaLocal(valor){const ms=valor instanceof Date?valor.getTime():fechaMs(valor);if(!ms)return "";const d=new Date(ms);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function obtenerPeriodoPago(p){if(p.periodo)return String(p.periodo);if(p.anio&&p.mes)return `${p.anio}-${String(p.mes).padStart(2,"0")}`;const d=new Date(p.fecha||p.fechaHora);return Number.isNaN(d.getTime())?"":`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
function nombreCliente(id){return clientes.find(c=>[c.id,c.globalUuid].map(String).includes(String(id)))?.nombre||"Cliente";}
function moneda(v){return "Q"+Number(v||0).toLocaleString("es-GT",{minimumFractionDigits:2,maximumFractionDigits:2});}
function tarjetaMetrica(t,v){return `<div class="metrica-card"><span>${escapeHTML(t)}</span><strong>${escapeHTML(v)}</strong></div>`;}
function duracion(min){const n=Math.max(0,Math.round(Number(min)||0));return `${Math.floor(n/60)} h ${n%60} min`;}
function minutosPorServicio(c){const t=normalizar(c.tipoServicio);if(t.includes("industrial"))return 12;if(t.includes("comercial"))return 8;return 5;}
function haversine(a,b){const r=6371,toRad=x=>x*Math.PI/180,dLat=toRad(Number(b.lat)-Number(a.lat)),dLng=toRad(Number(b.lng)-Number(a.lng)),la1=toRad(Number(a.lat)),la2=toRad(Number(b.lat));const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;return 2*r*Math.asin(Math.sqrt(h));}

document.addEventListener("input", event => {
    if (["buscarCobro","mesCobros","origenCobros"].includes(event.target.id)) renderCobros();
});
