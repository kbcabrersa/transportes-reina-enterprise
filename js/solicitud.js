const API_URL = "https://script.google.com/macros/s/AKfycbxGREzDHoJfIVitTYkxHolVv4pNoW17McmnyKjRHGxBHGd7osUkb77VeUppwvrRZva2Hw/exec";

const mapa = L.map("mapaSolicitud").setView([16.331, -89.416], 14);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19
}).addTo(mapa);

let marcador = L.marker([16.331, -89.416], {
    draggable: true
}).addTo(mapa);

function actualizarCoordenadas(latlng){
    document.getElementById("lat").value = latlng.lat;
    document.getElementById("lng").value = latlng.lng;
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
        fotoDriveId: "",
        observacion: document.getElementById("observacion").value.trim()
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
            mensaje.textContent = "Solicitud enviada correctamente. ID: " + json.idSolicitud;
            e.target.reset();
        }else{
            mensaje.textContent = "Error: " + json.error;
        }

    }catch(error){
        mensaje.textContent = "No se pudo enviar la solicitud. Revisa la consola.";
        console.error(error);
    }
});
