const API_URL = "https://script.google.com/macros/s/AKfycbwzXP5TDQrNA9rWbDXawXR2L9smjJXj_mpPz6jHRanyFZ-1SevdsYGuKEGANKpYU5mhRg/exec";

const mapa = L.map("mapaSolicitud").setView([16.331, -89.416], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
}).addTo(mapa);

let marcador = L.marker([16.331, -89.416], { draggable: true }).addTo(mapa);

function actualizarCoordenadas(latlng){
    document.getElementById("lat").value = latlng.lat;
    document.getElementById("lng").value = latlng.lng;
}

function archivoABase64(file){
    return new Promise((resolve, reject)=>{
        if(!file) return resolve("");

        const reader = new FileReader();

        reader.onload = () => {
            const base64 = String(reader.result).split(",")[1];
            resolve(base64);
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

actualizarCoordenadas(marcador.getLatLng());

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

    const inputFoto = document.querySelector('input[type="file"]');
    const archivo = inputFoto?.files?.[0];

    const fotoBase64 = await archivoABase64(archivo);

    const data = {
        action: "crearSolicitud",
        nombreCompleto: document.getElementById("nombreCompleto").value.trim(),
        telefono: document.getElementById("telefono").value.trim(),
        correo: document.getElementById("correo").value.trim(),
        tipoServicio: document.getElementById("tipoServicio").value,
        barrio: document.getElementById("barrio").value.trim(),
        direccion: document.getElementById("direccion").value.trim(),
        referencia: document.getElementById("referencia").value.trim(),
        lat: document.getElementById("lat").value,
        lng: document.getElementById("lng").value,
        observacion: document.getElementById("observacion").value.trim(),
        fotoBase64: fotoBase64,
        fotoNombre: archivo ? archivo.name : "",
        fotoMime: archivo ? archivo.type : ""
    };

    try{
        const res = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(data)
        });

        const json = await res.json();

        if(json.ok){
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

        }else{
            mensaje.textContent = "Error: " + json.error;
        }

    }catch(error){
        mensaje.textContent = "No se pudo enviar la solicitud. Revisa la consola.";
        console.error(error);
    }
});
