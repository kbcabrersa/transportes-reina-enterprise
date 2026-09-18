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

export async function crearCliente(entrada = {}) {
  const datos = {};
  for (const campo of ["nombre", "telefono", "lugar", "tipoServicio"]) {
    datos[campo] = String(entrada[campo] ?? "").trim().replace(/\s+/g, " ");
  }
  if (!datos.nombre || !datos.lugar || !datos.tipoServicio) {
    throw new Error("Nombre, barrio y tipo de servicio son obligatorios.");
  }
  datos.ruta = ["El Centro", "Ixobel", "La Amistad"].find(r => normalizarTexto(r) === normalizarTexto(entrada.ruta));
  if (!datos.ruta) throw new Error("Seleccione una ruta válida.");
  datos.diaPago = Number(entrada.diaPago);
  datos.precio = Number(entrada.precio);
  if (!Number.isInteger(datos.diaPago) || datos.diaPago < 1 || datos.diaPago > 31) {
    throw new Error("El día de pago debe estar entre 1 y 31.");
  }
  if (!Number.isFinite(datos.precio) || datos.precio <= 0) throw new Error("El precio debe ser mayor que cero.");
  const vacio = v => v == null || (typeof v === "string" && !v.trim());
  datos.lat = vacio(entrada.lat) ? null : Number(entrada.lat);
  datos.lng = vacio(entrada.lng) ? null : Number(entrada.lng);
  if (!(datos.lat === null && datos.lng === null) &&
      (datos.lat === null || datos.lng === null || !Number.isFinite(datos.lat) || !Number.isFinite(datos.lng) ||
       Math.abs(datos.lat) > 90 || Math.abs(datos.lng) > 180)) {
    throw new Error("Las coordenadas no son válidas.");
  }
  const nombreNormalizado = normalizarTexto(datos.nombre);
  const rutaNormalizada = normalizarTexto(datos.ruta);
  const lugarNormalizado = normalizarTexto(datos.lugar);
  const identityKey = await sha256(nombreNormalizado + "|" + rutaNormalizada + "|" + lugarNormalizado);
  const clienteRef = doc(collection(db, "clientes"));
  const identityRef = doc(db, "identidades_clientes", identityKey);
  const auditoriaRef = doc(collection(db, "auditoria"));
  const ahora = Date.now();
  const cliente = {
    ...datos, nombreNormalizado, rutaNormalizada, lugarNormalizado,
    globalUuid: clienteRef.id, localIdOrigen: null, serverId: null,
    activo: true, fechaAlta: ahora, updatedAt: ahora,
    originDevice: "WEB_ENTERPRISE", syncStatus: "SYNCED"
  };
  await runTransaction(db, async transaction => {
    const identidad = await transaction.get(identityRef);
    if (identidad.exists()) throw new Error("Ya existe un cliente con el mismo nombre, ruta y barrio.");
    transaction.set(clienteRef, cliente);
    transaction.set(identityRef, {
      clienteUuid: clienteRef.id, identityKey, nombreNormalizado, rutaNormalizada, lugarNormalizado,
      createdAt: ahora, originDevice: "WEB_ENTERPRISE"
    });
    transaction.set(auditoriaRef, {
      id: auditoriaRef.id, entidad: "CLIENTE", entidadId: clienteRef.id, accion: "CREAR_CLIENTE",
      usuario: "enterprise", origen: "WEB_ENTERPRISE",
      ubicacionAnterior: {lat: null, lng: null},
      ubicacionNueva: {lat: cliente.lat, lng: cliente.lng},
      cambios: cliente, createdAt: serverTimestamp()
    });
  });
  return {id: clienteRef.id, ...cliente};
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

  for (const campo of ["nombre", "ruta", "lugar"]) {
    if (Object.prototype.hasOwnProperty.call(datos, campo)) {
      datos[campo] = String(datos[campo] || "").trim();
      if (!datos[campo]) throw new Error(`${campo} es obligatorio.`);
      datos[`${campo}Normalizado`] = normalizarTexto(datos[campo]);
    }
  }
  if ("diaPago" in datos && (!Number.isInteger(datos.diaPago) || datos.diaPago < 1 || datos.diaPago > 31)) {
    throw new Error("El día de pago debe estar entre 1 y 31.");
  }
  if ("precio" in datos && (!Number.isFinite(datos.precio) || datos.precio < 0)) {
    throw new Error("Precio inválido.");
  }
  if ("lat" in datos || "lng" in datos) {
    const vacio = v => v === null || v === "";
    if (vacio(datos.lat) && vacio(datos.lng)) {
      datos.lat = null;
      datos.lng = null;
    } else {
      if (vacio(datos.lat) || vacio(datos.lng) || !Number.isFinite(Number(datos.lat)) ||
          !Number.isFinite(Number(datos.lng)) || Math.abs(Number(datos.lat)) > 90 || Math.abs(Number(datos.lng)) > 180) {
        throw new Error("Las coordenadas no son válidas.");
      }
      datos.lat = Number(datos.lat);
      datos.lng = Number(datos.lng);
    }
  }

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

  if (!clienteId || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(periodo)) {
    throw new Error("Cliente y período son obligatorios.");
  }
  if (!reciboNumero) throw new Error("El número de recibo es obligatorio.");
  if (!Number.isFinite(monto) || monto <= 0) throw new Error("Monto inválido.");
  // Android persiste Pago.monto como Int: evitar truncar centavos al descargar.
  if (!Number.isInteger(monto) || monto > 2147483647) {
    throw new Error("Android admite únicamente montos en quetzales enteros, hasta 2147483647.");
  }
  const fecha = datos.fecha === undefined ? Date.now() : new Date(datos.fecha).getTime();
  if (!Number.isFinite(fecha) || fecha <= 0) throw new Error("Fecha inválida.");

  const [anio, mes] = periodo.split("-").map(Number);
  const clave = `${clienteId}|${periodo}|${reciboNumero.toLowerCase()}`;
  const pagoId = "manual_" + await sha256(clave);
  const pagoRef = doc(db, "pagos", pagoId);
  const clienteRef = doc(db, "clientes", String(datos.clienteDocumentoId || clienteId));

  await runTransaction(db, async transaction => {
    const existente = await transaction.get(pagoRef);
    if (existente.exists()) {
      throw new Error("Este recibo manual ya fue registrado para ese período.");
    }
    const clienteSnapshot = await transaction.get(clienteRef);
    if (!clienteSnapshot.exists()) throw new Error("El cliente ya no existe.");
    const cliente = clienteSnapshot.data();
    const clienteUuid = String(cliente.globalUuid || "").trim();
    const clienteServerId = Number.isInteger(cliente.serverId) ? cliente.serverId : null;
    if (!clienteUuid && clienteServerId === null) throw new Error("El cliente no tiene identidad compatible con Android.");

    transaction.set(pagoRef, {
      id: pagoId,
      idPago: pagoId,
      tipo: "pago",
      clienteId,
      clienteUuid: clienteUuid || null,
      clienteServerId,
      clienteNombre: String(cliente.nombre || "").trim(),
      fecha,
      fechaHora: new Date(fecha).toISOString(),
      monto,
      mes,
      anio,
      periodo,
      metodoPago: String(datos.metodoPago || "EFECTIVO"),
      reciboNumero,
      detalle: String(datos.observacion || "Pago registrado desde recibo manual"),
      origen: "RECIBO_MANUAL",
      estado: "ACTIVO",
      anulado: false,
      fechaAnulacion: null,
      motivoAnulacion: null,
      usuarioAnulacion: null,
      usuario: String(datos.usuario || "enterprise"),
      dispositivo: "WEB_ENTERPRISE",
      originDevice: "WEB_ENTERPRISE",
      syncStatus: "SYNCED",
      createdAt: serverTimestamp(),
      updatedAt: Date.now()
    });
  });

  return { ok: true, pagoId };
}

export function normalizarOperador(nombre) {
  return normalizarTexto(nombre);
}

export async function guardarJornadaOperativa(datos = {}) {
  const fecha = String(datos.fecha || '').trim();
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(fecha) ||
      !Number.isFinite(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0,10) !== fecha) {
    throw new Error('Selecciona una fecha válida.');
  }
  const operadorNombre = String(datos.operadorNombre ?? datos.piloto ?? '').trim().replace(/\s+/g, ' ');
  if (!operadorNombre) throw new Error('Escribe el nombre del operador responsable.');
  // Identidad provisional por nombre; sustituible por UID cuando exista directorio.
  const operadorId = normalizarOperador(operadorNombre);
  const tipo = datos.tipo ?? 'ASIGNACION';
  if (!['ASIGNACION', 'RECONSTRUIDA'].includes(tipo)) throw new Error('Tipo de jornada inválido.');
  const listaIds = (valor, campo) => {
    if (!Array.isArray(valor) || !valor.length || valor.some(id => typeof id !== 'string' || !id.trim())) {
      throw new Error(`${campo}: selecciona al menos un elemento, sin IDs vacíos.`);
    }
    return [...new Set(valor.map(id => id.trim()))];
  };
  const clienteIds = listaIds(datos.clienteIds, 'Clientes');
  const ordenClienteIds = listaIds(datos.ordenClienteIds ?? clienteIds, 'Orden de clientes');
  if (clienteIds.length !== ordenClienteIds.length || ordenClienteIds.some(id => !clienteIds.includes(id))) {
    throw new Error('El orden debe contener exactamente los clientes asignados.');
  }
  const numero = (campo, defecto = 0) => {
    const n = datos[campo] ?? defecto;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error(`${campo}: número inválido.`);
    return n;
  };
  const documento = {
    fecha, operadorId, operadorNombre, piloto: operadorNombre, tipo,
    estado: tipo === 'RECONSTRUIDA' ? 'CERRADA' : 'ASIGNADA',
    ayudantes: String(datos.ayudantes || '').trim(), vehiculo: String(datos.vehiculo || '').trim(),
    ruta: String(datos.ruta || '').trim(), barrios: datos.barrios ?? [],
    clienteIds, ordenClienteIds, cantidadClientes: clienteIds.length,
    distanciaKmEstimada: numero('distanciaKmEstimada'), minutosEstimados: numero('minutosEstimados'),
    usuario: String(datos.usuario || 'enterprise').trim()
  };
  if (!Array.isArray(documento.barrios) || documento.barrios.some(b => typeof b !== 'string' || !b.trim())) {
    throw new Error('Barrios inválidos.');
  }
  if (datos.cantidadClientes !== undefined && numero('cantidadClientes') !== clienteIds.length) throw new Error('Cantidad de clientes incorrecta.');
  if (tipo === 'RECONSTRUIDA') {
    documento.eventoIds = listaIds(datos.eventoIds, 'Eventos');
    for (const campo of ['atendidos', 'noAtendidos', 'inicio', 'fin']) documento[campo] = numero(campo, NaN);
    if (!Number.isInteger(documento.atendidos) || !Number.isInteger(documento.noAtendidos) ||
        documento.atendidos + documento.noAtendidos !== clienteIds.length || documento.fin < documento.inicio ||
        [documento.inicio, documento.fin].some(ms => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Guatemala',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms)) !== fecha)) {
      throw new Error('Resumen o fechas de reconstrucción inconsistentes.');
    }
    documento.minutosEstimados = (documento.fin - documento.inicio) / 60000;
  }
  const deterministaId = 'operativo_' + await sha256(JSON.stringify([fecha, operadorId, tipo]));
  // Reutilizar una asignación anterior con ID aleatorio, sin borrar su historial.
  // Las escrituras nuevas siguen usando siempre la misma clave determinista.
  const anteriores = await obtenerAsignacionesOperativas();
  const legado = anteriores.filter(j => j.id !== deterministaId && j.fecha === fecha &&
    (j.tipo || 'ASIGNACION') === tipo &&
    normalizarOperador(j.operadorNombre || j.piloto) === operadorId)
    .sort((a,b) => String(a.id).localeCompare(String(b.id)))[0];
  const deterministaRef = doc(db, 'jornadas_operativas', deterministaId);
  const jornadaId = await runTransaction(db, async transaction => {
    let jornadaRef = deterministaRef;
    let anterior = await transaction.get(jornadaRef);
    if (!anterior.exists() && legado) {
      jornadaRef = doc(db, 'jornadas_operativas', legado.id);
      anterior = await transaction.get(jornadaRef);
    }
    transaction.set(jornadaRef, {...documento, id:jornadaRef.id,
      createdAt: anterior.exists() ? anterior.data().createdAt ?? serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp()});
    return jornadaRef.id;
  });
  return {ok:true, jornadaId, jornada:{...documento, id:jornadaId}};
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
