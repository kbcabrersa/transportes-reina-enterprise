# Pruebas locales Enterprise — 16 de septiembre de 2026

Rama: `feature/enterprise-operacion`, base `534d8b2`. Se aceptaron los commits
equivalentes `8f07f47`, `5a98fef` y `534d8b2`. No se desplegó Firebase, no se
fusionó con `main` y no se publicaron commits.

## Entorno y alcance

- Chrome headless, Node 22.22.1, Python 3.14, Java 21 y Firestore Emulator 1.22.0.
- Portal en `http://127.0.0.1:8765/pages/dashboard-enterprise.html`.
- Proyecto ficticio `demo-reina-enterprise`, base **`default`**, puerto 8085.
- SDK Firebase 12.2.1 y Leaflet 1.9.4, descargados como dependencias públicas y
  servidos localmente. No hay dependencias npm nuevas.
- `tests/browser-server.py` sustituye únicamente la configuración servida de
  Firebase, conecta el SDK real al emulador y limita conexiones mediante CSP.
  Chrome también bloquea las URL HTTPS. No se leyó ni escribió producción.
- Las teselas externas del mapa están bloqueadas. Se verificaron Leaflet,
  marcadores, actualización de coordenadas mediante su evento de arrastre,
  orden y persistencia; no se verificó disponibilidad de OpenStreetMap.
- Auth y Storage no se emularon: los flujos solicitados usan Firestore. El
  servidor de pruebas exporta `storage=null`; subir fotografías queda fuera de
  esta suite. La entrada de pruebas establece `enterpriseAuth` localmente.

## Resultado

21 escenarios automatizados aprobados, sin excepciones JavaScript. Las seis
pestañas se abren con una única sección activa: Dashboard, Clientes, Cobros,
Jornadas de cobro, Operativo y Solicitudes.

| Área | Comprobación |
| --- | --- |
| Clientes | Homónimos no comparten pagos; validación de nombre; edición de teléfono; coordenadas por campos y evento de arrastre; rechazo de rangos inválidos; conservación de GPS nulo. |
| Auditoría | Ubicación anterior/nueva persistida junto al cliente; un cliente inexistente no deja auditoría huérfana; reglas impiden modificar auditoría. |
| Pagos | Recibo desde formulario, formato Android, transacciones simultáneas con mismo recibo y distinta capitalización/espacios: un único documento. |
| Validación | Mes 13, fecha inválida, cliente inexistente e importes fraccionarios rechazados sin crear pagos. |
| Balance | Q180 esperados; con un pago Android vigente de Q60 y otro anulado de Q80, balance y KPI muestran Q60. El cliente del pago anulado sigue pendiente. |
| Operativo | Solo clientes activos; orden por cercanía; cliente sin GPS al final; jornada y piloto persistidos. |
| Jornadas de cobro | Reconstrucción sin anulados; quitar un cliente también quita sus pagos y ajusta métricas; asignación por período con clientes, monto esperado y estado. |
| Solicitudes | Revisión, denegación y filtros; conversión repetida crea un solo cliente y lo muestra sin recargar. |
| Reglas | Eliminación de clientes y sobrescritura de auditoría rechazadas por el SDK con `permission-denied`, en la base nombrada `default`. |
| Fechas | A las 02:30 UTC del 1 de octubre, período y fecha siguen siendo septiembre/30 en Guatemala. |

La suite usa clics para navegar y formularios reales para editar y registrar
pagos; para algunas acciones espera directamente sus manejadores asincrónicos.
Las escrituras y transacciones usan el SDK real contra Firestore Emulator.
Los fixtures se borran y recrean exclusivamente en el proyecto demo antes de
cada ejecución.

Se revisó además una captura de Clientes a 1440×1000:
`/tmp/reina-enterprise-clientes.png`. El resultado detallado se escribe en
`/tmp/reina-enterprise-test-results.json`.

## Errores corregidos

1. El recibo manual solo incluía `clienteId`; Android resuelve por `clienteUuid`
   o `clienteServerId`, por lo que omitía estos pagos. Ahora se consulta el
   cliente dentro de la transacción, se exige identidad remota y se incluyen
   ambos campos, `idPago`, `anulado`, datos de anulación y `originDevice`.
   `fecha` y `updatedAt` se escriben en milisegundos numéricos.
2. Se contaban pagos Android anulados porque solo se examinaba `estado`, no
   `anulado`. Se unificó su exclusión de KPI, gráficas, balance, meses pagados,
   pendientes y reconstrucción. El historial conserva los documentos.
3. El nombre prevalecía incluso cuando el UUID correspondía a otro cliente.
   Se prioriza identidad; el respaldo por nombre solo aplica sin identificador
   y cuando ese nombre es único.
4. El editor omitía la validación del formulario, aceptaba coordenadas fuera
   de rango y asignaba el centro del mapa a clientes sin GPS. Se corrigieron
   estas rutas y se actualizan campos normalizados al editar el maestro.
5. El servicio aceptaba períodos inválidos; la fecha vacía podía producir una
   excepción fuera del manejo de errores. Se añadieron validaciones.
6. Una jornada reconstruida conservaba los IDs de pagos de clientes retirados
   de la selección. IDs, monto y duración ahora usan la misma selección.
7. Faltaban filtros para `DENEGADA` y `CONVERTIDA_CLIENTE`. Se agregaron
   conservando los estados anteriores. La conversión ahora refresca clientes.
8. Un temporizador de Leaflet podía operar sobre un mapa ya eliminado. Se
   comprueba que el editor siga abierto y que la instancia siga vigente.
9. Fecha operativa y período predeterminados usaban UTC en lugar del día local.
10. `firebase.json` apuntaba a `(default)` mientras ambos clientes usan
    `default`. Se alineó la configuración local; no se desplegaron reglas.

## Compatibilidad y límites de Android

Se inspeccionó el código local de
`/home/brayac64/Android/StudioProjects/TransportesReinaLocal` (HEAD `90e6719`),
en particular:

- `app/src/main/java/com/reina/local/sync/core/FirestorePagoGateway.kt`
- `app/src/main/java/com/reina/local/sync/core/FirestoreDownloadRepository.kt`
- `app/src/main/java/com/reina/local/data/Pago.kt`
- `app/src/main/java/com/reina/local/ui/ReciboScreen.kt`

| Campo | Contrato inspeccionado y resultado |
| --- | --- |
| Identidad | Android busca `clienteUuid`, luego `clienteServerId`; `clienteId` por sí solo no basta. Corregido para nuevos recibos. |
| Fecha y actualización | Android acepta número, ISO y Timestamp mediante su lector. El formato anterior de fechas no era por sí mismo un bloqueo; ahora la web escribe números como el gateway Android. |
| Importe | `Pago.monto` es `Int`; el lector convierte a entero. Se rechazan centavos y valores fuera de su rango, con mensaje explícito, para evitar pérdida silenciosa. Admitir centavos requiere cambiar Android. |
| Anulación | Android publica `anulado` y sus metadatos, no `estado`. La web interpreta ambos. |
| Recibo y método | `reciboNumero`, `metodoPago` y `origen` permanecen en Firestore, pero Room no los incorpora. `ReciboScreen` muestra un número derivado del ID local, no el número manual original. Requiere trabajo Android para mostrarlo. |
| Cobrador | El gateway Android inspeccionado no publica `usuario`. La reconstrucción sin filtro de cobrador funciona; filtrar por nombre no puede atribuir esos pagos. No se inventó una identidad. |
| Jornadas | No se encontraron consumidores Android de `jornadas_operativas` ni `jornadas_cobro`. Se comprobó su persistencia y visualización web, no su recepción en un dispositivo. |

No se ejecutó una sincronización en un teléfono: la compatibilidad se verificó
contra el código Android y contra documentos reales del emulador. Tampoco se
migraron pagos anteriores de producción que puedan carecer de identidad.

El balance esperado usa las tarifas actuales de clientes activos, no una
fotografía histórica de tarifas. La selección de pendientes considera un mes
pagado si existe un pago vigente; no liquida abonos parciales. Las reglas siguen
siendo temporales y abiertas para las operaciones que ya permitían; esta suite
no convierte `enterpriseAuth` en autenticación Firebase ni endurece permisos.

## Reproducir

Desde la raíz, descargar las dependencias públicas una vez:

```bash
mkdir -p /tmp/reina-test-assets
for archivo in firebase-app.js firebase-firestore.js firebase-auth.js firebase-storage.js; do
  curl -fsSL "https://www.gstatic.com/firebasejs/12.2.1/$archivo" -o "/tmp/reina-test-assets/$archivo"
done
for archivo in leaflet.js leaflet.css; do
  curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/$archivo" -o "/tmp/reina-test-assets/$archivo"
done
for archivo in marker-icon.png marker-icon-2x.png marker-shadow.png; do
  curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/images/$archivo" -o "/tmp/reina-test-assets/$archivo"
done
```

Iniciar Firestore en una terminal. Esta fue la ejecución utilizada, con el JAR
que ya estaba disponible localmente:

```bash
java -jar /tmp/reina-emulators/cloud-firestore-emulator-v1.22.0.jar --host 127.0.0.1 --port 8085 --project_id demo-reina-enterprise --rules firestore.rules --single_project_mode true
```

Se incluye también `firebase.emulators.json` para iniciar con Firebase CLI:
`firebase emulators:start --only firestore --project demo-reina-enterprise --config firebase.emulators.json`.
Esta alternativa no fue la utilizada en la ejecución registrada.

En otras dos terminales:

```bash
python3 tests/browser-server.py
```

```bash
google-chrome --headless=new --no-sandbox --disable-gpu --disable-background-networking --no-first-run --no-default-browser-check --remote-debugging-port=9225 --user-data-dir=/tmp/reina-enterprise-chrome about:blank
```

Ejecutar la suite y las validaciones:

```bash
python3 tests/browser-check.py
node --check js/dashboard-enterprise.js
node --check js/firebase-service.js
node scripts/validate-enterprise.mjs
git diff --check
```

Resultado del validador: `Enterprise OK: 53 IDs, 6 pestañas y 11 acciones verificadas.`
Las comprobaciones sintácticas y de espacios terminaron correctamente.

El servidor es exclusivamente de pruebas: siempre sirve la configuración demo,
no debe usarse como servidor de producción. Los archivos originales conservan
su configuración Firebase; abrirlos mediante otro servidor no activa el emulador.
