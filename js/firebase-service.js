import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

import { db, storage } from "./firebase-config.js";


/* =========================================================
   LECTURAS GENERALES
   ========================================================= */

async function obtenerColeccion(nombre) {
  const snapshot = await getDocs(collection(db, nombre));

  return snapshot.docs.map(documento => ({
    id: documento.id,
    ...documento.data()
  }));
}

export function obtenerClientes() {
  return obtenerColeccion("clientes");
}

export function obtenerPagos() {
  return obtenerColeccion("pagos");
}

export function obtenerEventosOperativos() {
  return obtenerColeccion("operativo_eventos");
}

export function obtenerIdentidadesClientes() {
  return obtenerColeccion("identidades_clientes");
}

export function obtenerSolicitudes() {
  return obtenerColeccion("solicitudes");
}

export function obtenerAsignacionesOperativas() {
  return obtenerColeccion("jornadas_operativas");
}

export function obtenerJornadasCobro() {
  return obtenerColeccion("jornadas_cobro");
}

export async function actualizarCliente(clienteId, cambios) {
  if (!clienteId) throw new Error("clienteId requerido");

  const permitidos = [
    "nombre", "telefono", "ruta", "lugar", "diaPago",
    "tipoServicio", "precio", "activo", "lat", "lng"
  ];
  const datos = {};

  permitidos.forEach(campo => {
    if (Object.prototype.hasOwnProperty.call(cambios, campo)) {
      datos[campo] = cambios[campo];
    }
  });

  datos.updatedAt = Date.now();
  datos.syncStatus = "PENDING";
  datos.originDevice = "WEB_ENTERPRISE";

  const clienteRef = doc(db, "clientes", clienteId);
  const auditoriaRef = doc(collection(db, "auditoria"));
  await runTransaction(db, async transaction => {
    const anteriorSnapshot = await transaction.get(clienteRef);
    if (!anteriorSnapshot.exists()) throw new Error("El cliente ya no existe.");
    const anterior = anteriorSnapshot.data();
    transaction.update(clienteRef, datos);
    transaction.set(auditoriaRef, {
      id: auditoriaRef.id,
      entidad: "CLIENTE",
      entidadId: clienteId,
      accion: "ACTUALIZAR_CLIENTE",
      usuario: "enterprise",
      origen: "WEB_ENTERPRISE",
      cambios: datos,
      ubicacionAnterior: { lat: anterior.lat ?? null, lng: anterior.lng ?? null },
      ubicacionNueva: { lat: datos.lat ?? anterior.lat ?? null, lng: datos.lng ?? anterior.lng ?? null },
      createdAt: serverTimestamp()
    });
  });
  return { ok: true, clienteId };
}

export async function registrarPagoManual(datos) {
  const clienteId = String(datos.clienteId || "").trim();
  const periodo = String(datos.periodo || "").trim();
  const reciboNumero = String(datos.reciboNumero || "").trim();
  const monto = Number(datos.monto);

  if (!clienteId || !/^\d{4}-\d{2}$/.test(periodo)) {
    throw new Error("Cliente y período son obligatorios.");
  }
  if (!reciboNumero) throw new Error("El número de recibo es obligatorio.");
  if (!Number.isFinite(monto) || monto <= 0) throw new Error("Monto inválido.");

  const [anio, mes] = periodo.split("-").map(Number);
  const clave = `${clienteId}|${periodo}|${reciboNumero.toLowerCase()}`;
  const pagoId = "manual_" + await sha256(clave);
  const pagoRef = doc(db, "pagos", pagoId);

  await runTransaction(db, async transaction => {
    const existente = await transaction.get(pagoRef);
    if (existente.exists()) {
      throw new Error("Este recibo manual ya fue registrado para ese período.");
    }

    transaction.set(pagoRef, {
      id: pagoId,
      tipo: "PAGO",
      clienteId,
      clienteNombre: String(datos.clienteNombre || "").trim(),
      fecha: String(datos.fecha || new Date().toISOString()),
      fechaHora: String(datos.fecha || new Date().toISOString()),
      monto,
      mes,
      anio,
      periodo,
      metodoPago: String(datos.metodoPago || "EFECTIVO"),
      reciboNumero,
      detalle: String(datos.observacion || "Pago registrado desde recibo manual"),
      origen: "RECIBO_MANUAL",
      estado: "ACTIVO",
      usuario: String(datos.usuario || "enterprise"),
      dispositivo: "WEB_ENTERPRISE",
      syncStatus: "SYNCED",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  return { ok: true, pagoId };
}

export async function guardarJornadaOperativa(datos) {
  const fecha = String(datos.fecha || "").trim();
  const piloto = String(datos.piloto || "").trim();
  const clienteIds = Array.isArray(datos.clienteIds) ? datos.clienteIds : [];

  if (!fecha || !piloto || !clienteIds.length) {
    throw new Error("Fecha, piloto y al menos un cliente son obligatorios.");
  }

  const jornadaRef = doc(collection(db, "jornadas_operativas"));
  await setDoc(jornadaRef, {
    id: jornadaRef.id,
    fecha,
    piloto,
    ayudantes: String(datos.ayudantes || "").trim(),
    vehiculo: String(datos.vehiculo || "").trim(),
    ruta: String(datos.ruta || "").trim(),
    barrios: Array.isArray(datos.barrios) ? datos.barrios : [],
    clienteIds,
    ordenClienteIds: Array.isArray(datos.ordenClienteIds) ? datos.ordenClienteIds : clienteIds,
    cantidadClientes: clienteIds.length,
    distanciaKmEstimada: Number(datos.distanciaKmEstimada || 0),
    minutosEstimados: Number(datos.minutosEstimados || 0),
    estado: "ASIGNADA",
    usuario: String(datos.usuario || "enterprise"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { ok: true, jornadaId: jornadaRef.id };
}

export async function guardarJornadaCobro(datos) {
  const fecha = String(datos.fecha || "").trim();
  const cobrador = String(datos.cobrador || "").trim();
  const clienteIds = Array.isArray(datos.clienteIds) ? datos.clienteIds : [];
  if (!fecha || !cobrador || !clienteIds.length) {
    throw new Error("Fecha, cobrador y al menos un cliente son obligatorios.");
  }

  const jornadaRef = doc(collection(db, "jornadas_cobro"));
  await setDoc(jornadaRef, {
    id: jornadaRef.id,
    fecha,
    periodo: String(datos.periodo || ""),
    cobrador,
    ruta: String(datos.ruta || ""),
    barrios: Array.isArray(datos.barrios) ? datos.barrios : [],
    clienteIds,
    ordenClienteIds: Array.isArray(datos.ordenClienteIds) ? datos.ordenClienteIds : clienteIds,
    cantidadClientes: clienteIds.length,
    montoEsperado: Number(datos.montoEsperado || 0),
    montoCobrado: Number(datos.montoCobrado || 0),
    distanciaKmEstimada: Number(datos.distanciaKmEstimada || 0),
    minutosEstimados: Number(datos.minutosEstimados || 0),
    tipo: String(datos.tipo || "ASIGNADA"),
    estado: String(datos.estado || "ASIGNADA"),
    pagosIds: Array.isArray(datos.pagosIds) ? datos.pagosIds : [],
    usuario: String(datos.usuario || "enterprise"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { ok: true, jornadaId: jornadaRef.id };
}


/* =========================================================
   SOLICITUDES
   ========================================================= */

export async function crearSolicitud(datos) {
  const idSolicitud =
    datos.idSolicitud || ("SOL-" + Date.now());
  const ref = doc(db, "solicitudes", idSolicitud);

  const solicitud = {
    idSolicitud,

    fechaSolicitud: new Date().toISOString(),

    nombreCompleto: String(datos.nombreCompleto || "").trim(),
    telefono: String(datos.telefono || "").trim(),

    barrio: String(datos.barrio || "").trim(),

    tipoServicio: String(datos.tipoServicio || "").trim(),

    lat: numeroONull(datos.lat),
    lng: numeroONull(datos.lng),

    fotoDriveId: datos.fotoDriveId || "",
    fotoUrl: String(datos.fotoUrl || ""),

    estado: "PENDIENTE",

    usuarioRevision: "",
    fechaRevision: "",
    justificacion: "",
    clienteIdGenerado: "",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, solicitud);

  return {
    ok: true,
    idSolicitud
  };
}

export async function subirFotoSolicitud(file, idSolicitud) {
  if (!file) return "";

  if (!idSolicitud) {
    throw new Error("idSolicitud requerido para subir fotografía.");
  }

  const extension =
    String(file.name || "")
      .split(".")
      .pop()
      ?.toLowerCase() || "jpg";

  const storageRef = ref(
    storage,
    `solicitudes/${idSolicitud}/referencia.${extension}`
  );

  await uploadBytes(
    storageRef,
    file,
    {
      contentType: file.type || "image/jpeg"
    }
  );

  return await getDownloadURL(storageRef);
}


/* =========================================================
   REVISIÓN / CONVERSIÓN
   ========================================================= */

export async function actualizarEstadoSolicitud(
  solicitud,
  nuevoEstado,
  opciones = {}
) {
  if (!solicitud?.idSolicitud) {
    throw new Error("idSolicitud requerido");
  }

  const estado = String(nuevoEstado || "EN_REVISION").toUpperCase();

  if (estado === "DENEGADA" && !String(opciones.justificacion || "").trim()) {
    throw new Error("Justificación requerida");
  }

  let clienteIdGenerado = solicitud.clienteIdGenerado || "";
  let estadoFinal = estado;

  if (estado === "APROBADA") {
    clienteIdGenerado = await convertirSolicitudACliente(
      solicitud,
      opciones
    );

    estadoFinal = "CONVERTIDA_CLIENTE";
  }

  await updateDoc(
    doc(db, "solicitudes", solicitud.idSolicitud),
    {
      estado: estadoFinal,
      usuarioRevision: opciones.usuarioRevision || "enterprise",
      fechaRevision: new Date().toISOString(),
      justificacion: opciones.justificacion || "",
      clienteIdGenerado,
      updatedAt: serverTimestamp()
    }
  );

  return {
    ok: true,
    idSolicitud: solicitud.idSolicitud,
    estado: estadoFinal,
    clienteIdGenerado
  };
}


/* =========================================================
   SOLICITUD → CLIENTE
   ========================================================= */

async function convertirSolicitudACliente(
  solicitud,
  opciones = {}
) {
  const ahora = Date.now();

  const lugar =
    String(solicitud.barrio || "").trim();

  const nombre =
    String(solicitud.nombreCompleto || "").trim();

  const ruta =
    String(opciones.ruta || "").trim();

  const precio =
    Number(opciones.precio);

  const diaPago =
    Number(opciones.diaPago);

  if (!nombre) {
    throw new Error(
      "La solicitud no tiene nombre."
    );
  }

  if (!lugar) {
    throw new Error(
      "La solicitud no tiene barrio/lugar."
    );
  }

  if (!ruta) {
    throw new Error(
      "Debe seleccionar una ruta."
    );
  }

  if (
    !Number.isFinite(precio) ||
    precio <= 0
  ) {
    throw new Error(
      "Debe ingresar una tarifa válida."
    );
  }

  if (
    !Number.isInteger(diaPago) ||
    diaPago < 1 ||
    diaPago > 31
  ) {
    throw new Error(
      "El día de pago debe estar entre 1 y 31."
    );
  }

  const nombreNormalizado = normalizarTexto(nombre);
  const rutaNormalizada = normalizarTexto(ruta);
  const lugarNormalizado = normalizarTexto(lugar);

  const canonical =
    nombreNormalizado + "|" +
    rutaNormalizada + "|" +
    lugarNormalizado;

  const identityKey = await sha256(canonical);

  const identityRef = doc(
    db,
    "identidades_clientes",
    identityKey
  );

  /*
   * Igual que Android:
   * generamos previamente un candidato.
   * Si ya existe identidad, reutilizamos el UUID existente.
   */
  const candidateRef = doc(collection(db, "clientes"));

  const globalUuid = await runTransaction(
    db,
    async transaction => {
      const identitySnapshot = await transaction.get(identityRef);

      if (identitySnapshot.exists()) {
        const existente =
          identitySnapshot.data()?.clienteUuid;

        if (existente) {
          return existente;
        }
      }

      const nuevoUuid = candidateRef.id;

      const cliente = {
        globalUuid: nuevoUuid,

        localIdOrigen: null,
        serverId: null,

        nombre,
        nombreNormalizado,

        telefono: String(solicitud.telefono || "").trim(),

        ruta,
        rutaNormalizada,

        lugar,
        lugarNormalizado,

        diaPago,

        tipoServicio:
          String(solicitud.tipoServicio || "Basico").trim(),

        precio,

        fotoPath: null,
        fotoDriveId: solicitud.fotoDriveId || null,
        fotoUrl: solicitud.fotoUrl || null,

        lat: numeroONull(solicitud.lat),
        lng: numeroONull(solicitud.lng),

        fechaAlta: ahora,
        activo: true,
        updatedAt: ahora,

        syncStatus: "SYNCED",
        originDevice: "WEB_ENTERPRISE"
      };

      transaction.set(candidateRef, cliente);

      transaction.set(
        identityRef,
        {
          clienteUuid: nuevoUuid,
          identityKey,

          nombreNormalizado,
          rutaNormalizada,
          lugarNormalizado,

          createdAt: ahora,
          originDevice: "WEB_ENTERPRISE"
        }
      );

      return nuevoUuid;
    }
  );

  return globalUuid;
}


/* =========================================================
   RUTAS
   Referencia tomada del Apps Script anterior
   ========================================================= */

function rutaPorBarrio(barrio) {
  const b = normalizarTexto(barrio);

  const centro = [
    "la libertad",
    "san francisco",
    "el reformador",
    "el porvenir",
    "las joyas",
    "junuguitz",
    "lourdes",
    "don poch",
    "la gloria",
    "santa maria",
    "barrio el centro",
    "el centro",
    "el bosque",
    "la pista",
    "las cruces",
    "machaquila",
    "santa elena",
    "barrio el venado",
    "el venado",
    "las delicias"
  ];

  const amistad = [
    "la amistad",
    "la muralla",
    "la ka choch",
    "la cachoch",
    "barrio nuevo",
    "san miguel",
    "moran",
    "morazan",
    "santa fe",
    "las victorias",
    "el rastro"
  ];

  const ixobel = [
    "ixobel",
    "la bendicion",
    "pioneros de la paz",
    "las plantas",
    "bethel",
    "chivalito",
    "san luisito",
    "el milagro",
    "los pinos",
    "ciudad lorena"
  ];

  if (centro.includes(b)) return "El Centro";
  if (amistad.includes(b)) return "La Amistad";
  if (ixobel.includes(b)) return "Ixobel";

  return "";
}


/* =========================================================
   UTILIDADES
   ========================================================= */

function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256(texto) {
  const data = new TextEncoder().encode(texto);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function numeroONull(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return null;
  }

  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : null;
}
