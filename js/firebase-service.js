import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import { db } from "./firebase-config.js";

async function obtenerColeccion(nombre) {
  const snapshot = await getDocs(collection(db, nombre));

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
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
