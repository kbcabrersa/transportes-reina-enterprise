const API_URL = "https://script.google.com/macros/s/AKfycbwzXP5TDQrNA9rWbDXawXR2L9smjJXj_mpPz6jHRanyFZ-1SevdsYGuKEGANKpYU5mhRg/exec";

if(localStorage.getItem("enterpriseAuth") !== "true"){
    window.location.href = "login-enterprise.html";
}

let clientes = [];
let eventos = [];
let solicitudes = [];
let atenciones = [];
let noAtendidos = [];

let paginaClientes = 1;
const CLIENTES_POR_PAGINA = 20;
let clientesFiltradosActuales = [];

const datosGraficas = {};

async function getApi(action){
    try{
        const r = await fetch(API_URL + "?action=" + action);
        return await r.json();
    }catch(e){
        console.error("Error API:", action, e);
        return [];
    }
}

async function cargarDatosEnterprise(){
    const c = await getApi("clientes");
    const e = await getApi("eventos");
    const s = await getApi("listarSolicitudes");
    const a = await getApi("atenciones");
    const n = await getApi("noAtendidos");

    clientes = Array.isArray(c) ? c : [];
    eventos = Array.isArray(e) ? e : [];
    solicitudes = s.solicitudes || [];
    atenciones = Array.isArray(a) ? a : [];
    noAtendidos = Array.isArray(n) ? n : [];

    renderKpis();
    renderDashboard();
    renderClientesPaginados(clientes);
    renderSolicitudes();
    registrarClickGraficas();
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
        tbody.innerHTML = `<tr><td colspan="5">Sin clientes para mostrar.</td></tr>`;
    }

    pagina.forEach(c=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.nombre || ""}</td>
            <td>${c.ruta || ""}</td>
            <td>${c.lugar || ""}</td>
            <td>${activo(c) ? "Activo" : "Inactivo"}</td>
            <td>${formatearFecha(c.updatedAt)}</td>
        `;
        tr.onclick = ()=>abrirPerfilCliente(c);
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
                    <span class="estado ${activo(cliente) ? "activo" : "inactivo"}">${activo(cliente) ? "Activo" : "Inactivo"}</span>
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
                        <div class="anillo-pro verde"><span>92%</span><small>Cumplimiento de Pago</small></div>
                        <div class="anillo-pro azul"><span>90%</span><small>Cumplimiento de Servicio</small></div>
                        <div class="anillo-pro morado"><span>85%</span><small>Puntualidad de Pago</small></div>
                    </div>
                </div>
            </div>

            <div class="historial-cliente">
                <h3>Historial de Eventos</h3>
                <table>
                    <thead><tr><th>Fecha y Hora</th><th>Qué hizo</th><th>Quién lo hizo</th></tr></thead>
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
    if(!fecha) return "Sin registro";
    return new Date(fecha).toLocaleDateString("es-GT");
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
function esMesActual(f){ const d=new Date(f); const h=new Date(); return d.getMonth()===h.getMonth() && d.getFullYear()===h.getFullYear(); }
function mismoMes(f,m,a){ if(!f)return false; const d=new Date(f); return d.getMonth()===m && d.getFullYear()===a; }
function setText(id,v){ const el=document.getElementById(id); if(el)el.textContent=v; }
function formatearFecha(f){ return f ? new Date(f).toLocaleString("es-GT") : ""; }

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
    const foto = s.fotoDriveId
        ? `https://drive.google.com/thumbnail?sz=w900&id=${s.fotoDriveId}`
        : "../assets/banners/banner1.png";

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
                    <p><strong>Correo:</strong> ${s.correo || ""}</p>
                    <p><strong>Dirección:</strong> ${s.direccion || ""}</p>
                    <p><strong>Barrio:</strong> ${s.barrio || ""}</p>
                    <p><strong>Referencia:</strong> ${s.referencia || ""}</p>
                    <p><strong>Tipo:</strong> ${s.tipoServicio || ""}</p>
                    <p><strong>Observación:</strong> ${s.observacion || ""}</p>
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
                <button onclick="cambiarEstadoSolicitud('${s.idSolicitud}','APROBADA')" class="btn-mini verde">Aprobar</button>
                <button onclick="cambiarEstadoSolicitud('${s.idSolicitud}','RECHAZADA')" class="btn-mini rojo">Denegar</button>
                <button onclick="cambiarEstadoSolicitud('${s.idSolicitud}','EN_REVISION')" class="btn-mini naranja">En revisión</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

async function cambiarEstadoSolicitud(idSolicitud, estado){
    await fetch(API_URL,{
        method:"POST",
        body:JSON.stringify({
            action:"actualizarSolicitud",
            idSolicitud,
            estado,
            usuarioRevision:"enterprise",
            observacion:"Actualizado desde Enterprise"
        })
    });

    solicitudes = solicitudes.map(s=>{
        if(String(s.idSolicitud) === String(idSolicitud)){
            s.estado = estado;
        }
        return s;
    });

    renderSolicitudes();
    renderKpis();

    document.querySelector(".cliente-modal")?.remove();
}
