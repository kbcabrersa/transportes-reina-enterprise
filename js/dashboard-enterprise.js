const API_URL = "https://script.google.com/macros/s/AKfycbwoWQp8s8PvfOLdof3AV3qR9iB4-t_8wnq3R-yKGbEPnzwAoSEThDy6BpB7VBN3xF_-gg/exec";

if(localStorage.getItem("enterpriseAuth") !== "true"){
    window.location.href = "login-enterprise.html";
}

let clientes = [], eventos = [], solicitudes = [], atenciones = [], noAtendidos = [];

const CONVERSION = {
    bolsas:{ litros:30, min:3, max:6 },
    cubetas:{ litros:20, min:4, max:8 },
    toneles:{ litros:200, min:35, max:70 },
    costales:{ litros:90, min:45, max:46 }
};

function cerrarSesion(){
    localStorage.clear();
    window.location.href = "login-enterprise.html";
}

async function cargarDatosEnterprise(){
    const [c,e,s,a,n] = await Promise.all([
        fetch(API_URL+"?action=clientes").then(r=>r.json()),
        fetch(API_URL+"?action=eventos").then(r=>r.json()),
        fetch(API_URL+"?action=listarSolicitudes").then(r=>r.json()),
        fetch(API_URL+"?action=atenciones").then(r=>r.json()),
        fetch(API_URL+"?action=noAtendidos").then(r=>r.json())
    ]);

    clientes = Array.isArray(c) ? c : [];
    eventos = Array.isArray(e) ? e : [];
    solicitudes = s.solicitudes || [];
    atenciones = Array.isArray(a) ? a : [];
    noAtendidos = Array.isArray(n) ? n : [];

    renderKpis();
    renderDashboard();
    renderClientes(clientes);
    renderSolicitudes();
}

function renderKpis(){
    const activos = clientes.filter(c=>activo(c)).length;
    const pendientes = solicitudes.filter(s=>s.estado==="PENDIENTE").length;
    const cobrosMes = eventos
        .filter(e=>esPago(e) && esMesActual(e.fecha))
        .reduce((a,e)=>a + Number(e.monto || 0),0);

    setText("dashClientes", activos);
    setText("dashEventos", eventos.length);
    setText("dashCobros", "Q" + cobrosMes.toFixed(0));
    setText("dashSolicitudes", pendientes);
}

function renderDashboard(){
    const mesActual = new Date().getMonth();
    const anioActual = new Date().getFullYear();
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

    setText("resumenClientes", "Clientes activos: " + clientesQuedan);
    setText("resumenMovimiento", `Ingresaron: ${clientesNuevos} | Se fueron: ${clientesFuera} | Se quedaron: ${clientesQuedan}`);
    setText("resumenVolumen", "Volumen: " + (volActual.litros/1000).toFixed(2) + " m³");
    setText("resumenPeso", `Peso estimado: ${Math.round(volActual.min)} - ${Math.round(volActual.max)} kg`);

    barras("chartCobros", ["Mes pasado","Mes actual"], [
        sumaMonto(pagosPasado), sumaMonto(pagosActual)
    ]);

    barras("chartAtenciones", ["At. pasado","No pasado","At. actual","No actual"], [
        atPasado.length, noPasado.length, atActual.length, noActual.length
    ]);

    lineas("chartVolumen", ["Mes pasado","Mes actual"], [
        (volPasado.litros/1000), (volActual.litros/1000)
    ]);

    barras("chartIncidencias", ["Chat. ant","Veg. ant","Mueb. ant","Carn. ant","Chat. act","Veg. act","Mueb. act","Carn. act"], [
        incPasado.chatarra, incPasado.vegetacion, incPasado.muebles, incPasado.carnicos,
        incActual.chatarra, incActual.vegetacion, incActual.muebles, incActual.carnicos
    ]);

    barras("chartClientes", ["Ingresaron","Se fueron","Se quedaron"], [
        clientesNuevos, clientesFuera, clientesQuedan
    ]);
}

function renderClientes(lista){
    const tbody = document.querySelector("#tablaClientes tbody");
    if(!tbody) return;

    tbody.innerHTML = "";

    lista.forEach(c=>{
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

    renderClientes(filtrados);
}

document.addEventListener("input", e=>{
    if(["buscarCliente","filtroRuta","filtroEstado"].includes(e.target.id)){
        filtrarClientes();
    }
});

function abrirPerfilCliente(cliente){
    alert("Ficha de cliente activa: " + cliente.nombre);
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

function barras(id, labels, valores){
    const c = document.getElementById(id);
    if(!c) return;
    const ctx = c.getContext("2d");
    prepararCanvas(c, ctx);

    const max = Math.max(...valores,1);
    const w = c.width, h = c.height;
    const margen = 45;
    const barW = (w - margen*2) / valores.length * .6;

    ctx.font = "14px Arial";

    valores.forEach((v,i)=>{
        const x = margen + i*((w-margen*2)/valores.length) + 20;
        const alto = (h-90) * (v/max);
        const y = h-55-alto;

        ctx.fillRect(x,y,barW,alto);
        ctx.fillText(v,x,y-8);
        ctx.fillText(labels[i],x,h-25);
    });
}

function lineas(id, labels, valores){
    const c = document.getElementById(id);
    if(!c) return;
    const ctx = c.getContext("2d");
    prepararCanvas(c, ctx);

    const max = Math.max(...valores,1);
    const w = c.width, h = c.height;
    const margen = 60;

    ctx.beginPath();
    valores.forEach((v,i)=>{
        const x = margen + i*((w-margen*2)/(valores.length-1 || 1));
        const y = h-60 - ((h-110)*(v/max));
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        ctx.fillText(v.toFixed(2),x-10,y-12);
        ctx.fillText(labels[i],x-35,h-25);
    });
    ctx.stroke();
}

function prepararCanvas(c, ctx){
    c.width = c.offsetWidth;
    c.height = 280;
    ctx.clearRect(0,0,c.width,c.height);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#43A047";
    ctx.fillStyle = "#43A047";
}

function activo(c){ return c.activo === true || c.activo === "true"; }
function verdad(v){ return v===true || v==="true" || v==="TRUE" || v===1; }
function esPago(e){ return String(e.tipo||"").toLowerCase().includes("pago"); }
function sumaMonto(lista){ return lista.reduce((a,e)=>a+Number(e.monto||0),0); }
function esMesActual(f){ const d=new Date(f); const h=new Date(); return d.getMonth()===h.getMonth() && d.getFullYear()===h.getFullYear(); }
function mismoMes(f,m,a){ if(!f)return false; const d=new Date(f); return d.getMonth()===m && d.getFullYear()===a; }
function setText(id,v){ const el=document.getElementById(id); if(el)el.textContent=v; }
function formatearFecha(f){ return f ? new Date(f).toLocaleString("es-GT") : ""; }

cargarDatosEnterprise();
