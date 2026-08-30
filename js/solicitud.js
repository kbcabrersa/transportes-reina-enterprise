const mapa = L.map("mapaSolicitud").setView([16.331, -89.416], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
}).addTo(mapa);

let marcador = L.marker([16.331, -89.416], { draggable: true }).addTo(mapa);

let barriosGeojson = null;

async function cargarBarriosGeojson(){
    if(barriosGeojson) return barriosGeojson;

    const respuesta = await fetch(
        "/assets/mapas/barrios_poptun.geojson"
    );

    if(!respuesta.ok){
        throw new Error(
            "No se pudo cargar barrios_poptun.geojson"
        );
    }

    barriosGeojson = await respuesta.json();

    return barriosGeojson;
}

function puntoEnAnillo(lng, lat, ring){
    let dentro = false;

    for(
        let i = 0, j = ring.length - 1;
        i < ring.length;
        j = i++
    ){
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];

        const intersecta =
            ((yi > lat) !== (yj > lat)) &&
            (
                lng <
                (xj - xi) * (lat - yi) /
                ((yj - yi) || Number.EPSILON) +
                xi
            );

        if(intersecta){
            dentro = !dentro;
        }
    }

    return dentro;
}

function puntoEnPoligono(lng, lat, geometry){
    if(!geometry) return false;

    if(geometry.type === "Polygon"){
        const [exterior, ...huecos] =
            geometry.coordinates;

        if(!puntoEnAnillo(lng, lat, exterior)){
            return false;
        }

        return !huecos.some(
            hueco => puntoEnAnillo(lng, lat, hueco)
        );
    }

    if(geometry.type === "MultiPolygon"){
        return geometry.coordinates.some(poligono => {
            const [exterior, ...huecos] = poligono;

            if(!puntoEnAnillo(lng, lat, exterior)){
                return false;
            }

            return !huecos.some(
                hueco => puntoEnAnillo(lng, lat, hueco)
            );
        });
    }

    return false;
}

async function detectarBarrio(lat, lng){
    const geojson = await cargarBarriosGeojson();

    const feature = geojson.features.find(
        f => puntoEnPoligono(
            lng,
            lat,
            f.geometry
        )
    );

    const nombre = String(
        feature?.properties?.Name || ""
    ).trim();

    const inputBarrio =
        document.getElementById("barrio");

    const salida =
        document.getElementById("barrioDetectado");

    if(nombre){
        inputBarrio.value = nombre;
        salida.textContent = nombre;
        return nombre;
    }

    inputBarrio.value = "";
    salida.textContent = "Fuera de zona detectada";

    return "";
}

function actualizarCoordenadas(latlng){
    document.getElementById("lat").value = latlng.lat;
    document.getElementById("lng").value = latlng.lng;

    detectarBarrio(
        Number(latlng.lat),
        Number(latlng.lng)
    ).catch(error => {
        console.error(
            "Error detectando barrio:",
            error
        );

        const salida =
            document.getElementById("barrioDetectado");

        if(salida){
            salida.textContent =
                "No se pudo detectar";
        }
    });
}


document.getElementById("barrioDetectado").textContent =
    "Selecciona tu ubicación";

marcador.on("dragend", () => {
    actualizarCoordenadas(marcador.getLatLng());
});

document.getElementById("btnUbicacion").addEventListener("click", () => {
    if(!navigator.geolocation){
        alert("Tu navegador no permite ubicación.");
        return;
    }

    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        mapa.setView([lat, lng], 17);
        marcador.setLatLng([lat, lng]);
        actualizarCoordenadas({lat, lng});
    });
});

document.getElementById("formSolicitud").addEventListener("submit", async (e) => {
    e.preventDefault();

    const mensaje = document.getElementById("mensajeSolicitud");
    mensaje.textContent = "Enviando solicitud...";

    try{
        const firebaseService =
            await import("/js/firebase-service.js?v=20260830-3");

        console.log(
            "Exports firebase-service:",
            Object.keys(firebaseService)
        );

        const crearSolicitud = firebaseService.crearSolicitud;

        const inputFoto =
            document.querySelector('input[type="file"]');

        const archivo =
            inputFoto?.files?.[0] || null;

        const idSolicitud =
            "SOL-" + Date.now();

        let fotoUrl = "";

        if(archivo){
            mensaje.textContent = "Subiendo fotografía...";

            fotoUrl =
                await firebaseService.subirFotoSolicitud(
                    archivo,
                    idSolicitud
                );
        }

        const lat =
            document.getElementById("lat").value;

        const lng =
            document.getElementById("lng").value;

        if(!lat || !lng){
            throw new Error(
                "Debe seleccionar la ubicación del servicio."
            );
        }

        const barrio =
            await detectarBarrio(
                Number(lat),
                Number(lng)
            );

        if(!barrio){
            throw new Error(
                "La ubicación seleccionada no pertenece a un barrio reconocido."
            );
        }

        const data = {
            idSolicitud,

            nombreCompleto:
                document.getElementById("nombreCompleto")
                    .value.trim(),

            telefono:
                document.getElementById("telefono")
                    .value.trim(),

            tipoServicio:
                document.getElementById("tipoServicio")
                    .value,

            barrio,
            lat,
            lng,
            fotoUrl
        };

        mensaje.textContent = "Guardando solicitud...";

        const json = await crearSolicitud(data);

        document.body.innerHTML = `
            <main class="solicitud-exito">
                <div class="exito-card">
                    <h1>✅ Solicitud enviada correctamente</h1>
                    <p>Gracias por confiar en <strong>Transportes Reina Local</strong>.</p>
                    <p>Su solicitud será revisada por nuestro equipo administrativo.</p>
                    <p>Nos comunicaremos con usted para confirmar cobertura, condiciones y programación del servicio.</p>

                    <h3>Número de solicitud</h3>
                    <p class="codigo-solicitud">${json.idSolicitud}</p>

                    <p class="redirigiendo">Regresando al sitio principal...</p>
                </div>
            </main>
        `;

        setTimeout(() => {
            window.location.href = "../index.html";
        }, 7000);

    }catch(error){
        console.error("Error creando solicitud en Firebase:", error);

        mensaje.textContent =
            "No se pudo enviar la solicitud. " +
            "[" + (error.code || "sin-codigo") + "] " +
            (error.message || error);
    }
});
