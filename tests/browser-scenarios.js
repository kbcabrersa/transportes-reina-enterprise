(async () => {
  const sdk=await import('/__sdk/firebase-firestore.js');
  const {db}=await import('/js/firebase-config.js');
  const service=await import('/js/firebase-service.js?v=test');
  const {doc,setDoc,getDoc,getDocs,collection,deleteDoc}=sdk;
  const tests=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  async function test(name,fn){try{await fn();tests.push({name,ok:true});}catch(e){tests.push({name,ok:false,error:e.message});}}
  const read=async (c,id)=>(await getDoc(doc(db,c,id))).data();
  const rows=async c=>(await getDocs(collection(db,c))).docs.map(d=>({id:d.id,...d.data()}));
  const field=(selector,value)=>{document.querySelector(selector).value=value;};
  const click=selector=>document.querySelector(selector).click();
  const now=Date.now(),period=periodoActual(),[year,month]=period.split('-').map(Number);
  const fixture=[
    {id:'test-c1',globalUuid:'test-c1',nombre:'Ana Igual',precio:60,activo:true,lat:16.3267,lng:-89.4227},
    {id:'test-c2',globalUuid:'test-c2',nombre:'Ana Igual',precio:80,activo:true,lat:16.33,lng:-89.43},
    {id:'test-c3',globalUuid:'test-c3',nombre:'Cliente sin GPS',precio:40,activo:true,lat:null,lng:null},
    {id:'test-c4',globalUuid:'test-c4',nombre:'Cliente inactivo',precio:50,activo:false,lat:null,lng:null}
  ].map(c=>({...c,ruta:'El Centro',lugar:'El Centro',telefono:'55550000',diaPago:15,tipoServicio:'Basico',fechaAlta:now-86400000*100,updatedAt:now}));
  for(const c of fixture)await setDoc(doc(db,'clientes',c.id),c);
  await setDoc(doc(db,'pagos','android-active'),{id:'android-active',tipo:'pago',clienteUuid:'test-c1',clienteNombre:'Ana Igual',fecha:now-60000,monto:60,mes:month,anio:year,anulado:false,usuario:'Cobrador demo'});
  await setDoc(doc(db,'pagos','android-void'),{id:'android-void',tipo:'pago',clienteUuid:'test-c2',clienteNombre:'Ana Igual',fecha:now,monto:80,mes:month,anio:year,anulado:true,usuario:'Cobrador demo'});
  await setDoc(doc(db,'operativo_eventos','op-1'),{tipo:'ATENDIDO',clienteUuid:'test-c1',fechaHora:now,bolsas:2});
  await service.crearSolicitud({idSolicitud:'test-sol',nombreCompleto:'Solicitud demo',barrio:'El Centro',telefono:'55551111',tipoServicio:'Basico'});
  await cargarDatosEnterprise();
  await test('Seis pestañas navegables, datos y mapas reales Leaflet',async()=>{
    for(const tab of ['dashboard','clientes','cobros','jornadas-cobro','operativo','solicitudes']){
      click(`[data-tab="${tab}"]`);
      check(document.querySelectorAll('.tab-section.active').length===1&&document.getElementById(tab).classList.contains('active'),tab);
    }
    check(mapaOperacion&&mapaCobro,'Mapas no inicializados');
    check(document.querySelectorAll('#tablaClientes tbody tr').length===4,'Clientes no renderizados');
    check(document.querySelector('#tablaSolicitudes').textContent.includes('Solicitud demo'),'Solicitud no renderizada');
  });
  await test('Identidad: los homónimos no comparten pagos',()=>{
    check(!perteneceACliente(eventos.find(p=>p.id==='android-active'),clientes.find(c=>c.id==='test-c2')),'Pago de otro UUID asociado por nombre');
  });
  await test('Balance mensual y KPI excluyen anulaciones Android',()=>{
    renderCobros();renderKpis();
    check(document.querySelector('#metricasCobros').textContent.includes('CobradoQ60.00'),'Balance incluye pago anulado');
    check(document.querySelector('#dashCobros').textContent==='Q60','KPI incluye pago anulado');
  });
  await test('Pendientes de cobro incluyen al cliente con pago anulado',()=>{
    cargarPendientesCobro();
    check(seleccionCobro.has('test-c2')&&seleccionCobro.has('test-c3')&&!seleccionCobro.has('test-c1'),'Selección de pendientes incorrecta');
  });
  await test('Editor valida campos obligatorios antes de escribir',async()=>{
    abrirEditorCliente(clientes.find(c=>c.id==='test-c1'));
    field('#formEditarCliente [name=nombre]','');
    await document.querySelector('#guardarCliente').onclick();
    check((await read('clientes','test-c1')).nombre==='Ana Igual','Se guardó un nombre vacío');
  });
  document.querySelectorAll('.cliente-modal').forEach(m=>cerrarModalCliente(m));
  await test('Edición, coordenadas y auditoría atómica',async()=>{
    abrirEditorCliente(clientes.find(c=>c.id==='test-c1'));
    await new Promise(r=>setTimeout(r,150));
    field('#formEditarCliente [name=nombre]','Ana Corregida');
    field('#formEditarCliente [name=telefono]','55559999');
    field('#editarLat','16.34');field('#editarLng','-89.44');
    click('#centrarCoordenadas');
    check(mapaEdicion.marker.getLatLng().lat===16.34,'Pin no actualizado');
    mapaEdicion.marker.setLatLng([16.341,-89.441]);mapaEdicion.marker.fire('dragend');
    check(Number(document.querySelector('#editarLat').value)===16.341,'Arrastre no actualiza coordenadas');
    await document.querySelector('#guardarCliente').onclick();
    const c=await read('clientes','test-c1');
    check(c.nombre==='Ana Corregida'&&c.lat===16.341&&c.lng===-89.441,'Edición no persistida');
    const audit=await rows('auditoria');
    check(audit.some(a=>a.entidadId==='test-c1'&&a.ubicacionAnterior.lat===16.3267&&a.ubicacionNueva.lat===16.341),'Auditoría sin ubicación anterior/nueva');
  });
  await test('Un fallo al editar no deja auditoría huérfana',async()=>{
    const before=(await rows('auditoria')).length;
    let rejected=false;try{await service.actualizarCliente('missing',{nombre:'No existe'});}catch{rejected=true;}
    check(rejected&&(await rows('auditoria')).length===before,'Auditoría no atómica');
  });
  await test('Coordenadas fuera de rango rechazadas por servicio',async()=>{
    let rejected=false;try{await service.actualizarCliente('test-c1',{lat:100,lng:-200});}catch{rejected=true;}
    check(rejected,'Se aceptaron coordenadas fuera de rango');
  });
  await test('Editar un cliente sin GPS no inventa una ubicación',async()=>{
    abrirEditorCliente(clientes.find(c=>c.id==='test-c3'));
    field('#formEditarCliente [name=telefono]','55552222');
    await document.querySelector('#guardarCliente').onclick();
    const c=await read('clientes','test-c3');
    check(c.lat===null&&c.lng===null,'Se guardó el centro del mapa como ubicación');
  });
  await test('Recibo manual por formulario y contrato Android',async()=>{
    abrirPagoManual(clientes.find(c=>c.id==='test-c2'));
    field('#formPagoManual [name=reciboNumero]','TEST-001');
    await document.querySelector('#guardarPagoManual').onclick();
    const p=(await rows('pagos')).find(p=>p.reciboNumero==='TEST-001');
    check(p,'Pago no persistido');
    check(p.clienteUuid==='test-c2','Falta clienteUuid: Android omite el pago');
    check(typeof p.fecha==='number'&&typeof p.updatedAt==='number'&&p.anulado===false&&p.idPago===p.id&&p.originDevice==='WEB_ENTERPRISE','Contrato Android incompleto');
  });
  await test('Idempotencia concurrente y normalización de recibos',async()=>{
    const data={clienteId:'test-c3',clienteNombre:'Cliente sin GPS',periodo:period,monto:40,reciboNumero:' Concurrencia ',fecha:now};
    const results=await Promise.allSettled([service.registrarPagoManual(data),service.registrarPagoManual({...data,reciboNumero:'concurrencia'})]);
    check(results.filter(r=>r.status==='fulfilled').length===1,'Se crearon duplicados');
    check((await rows('pagos')).filter(p=>p.reciboNumero?.toLowerCase()==='concurrencia').length===1,'Cantidad incorrecta');
  });
  await test('Período inválido rechazado',async()=>{
    let rejected=false;try{await service.registrarPagoManual({clienteId:'test-c1',periodo:'2026-13',monto:1,reciboNumero:'INVALID'});}catch{rejected=true;}
    check(rejected,'Se aceptó mes 13');
  });
  await test('Importes fraccionarios no se truncan silenciosamente en Android',async()=>{
    let rejected=false;try{await service.registrarPagoManual({clienteId:'test-c1',periodo:period,monto:1.5,reciboNumero:'DECIMAL'});}catch{rejected=true;}
    check(rejected,'Android convierte monto a Int y pierde centavos');
  });
  await test('Fecha inválida y cliente inexistente no crean pagos',async()=>{
    const before=(await rows('pagos')).length;
    for(const extra of [{fecha:'fecha-inválida'},{clienteId:'missing'}]){
      let rejected=false;try{await service.registrarPagoManual({clienteId:'test-c1',periodo:period,monto:1,reciboNumero:'INVALID-OTHER',...extra});}catch{rejected=true;}
      check(rejected,'Entrada inválida aceptada');
    }
    check((await rows('pagos')).length===before,'Pago inválido persistido');
  });
  await cargarDatosEnterprise();
  await test('Asignación operativa, orden y persistencia',async()=>{
    field('#jornadaPiloto','Piloto demo');field('#jornadaVehiculo','Camión demo');
    seleccionarGrupoOperativo();optimizarSeleccionOperativa();
    check(seleccionOperativa.size===3&&!seleccionOperativa.has('test-c4'),'Selecciona inactivos');
    check(ordenOperativo.at(-1)==='test-c3','Cliente sin GPS debe ir al final');
    await guardarAsignacionOperativa();
    const j=(await rows('jornadas_operativas'))[0];
    check(j.clienteIds.length===3&&j.piloto==='Piloto demo'&&j.estado==='ASIGNADA','Asignación incorrecta');
  });
  await test('Reconstrucción excluye anulados y pagos de clientes desmarcados',async()=>{
    field('#cobroJornadaCobrador','');field('#cobroJornadaFecha',fechaDiaLocal(now));
    reconstruirJornadaCobro();
    check(!pagosReconstruidos.some(p=>p.id==='android-void'),'Reconstrucción incluye anulado');
    const box=document.querySelector('[data-cobro-id="test-c1"]');box.checked=false;box.onchange();
    field('#cobroJornadaCobrador','Cobrador demo');
    await guardarJornadaCobroActual();
    const j=(await rows('jornadas_cobro')).find(j=>j.tipo==='RECONSTRUIDA');
    check(j&&!j.clienteIds.includes('test-c1')&&!j.pagosIds.includes('android-active'),'Pago excluido sigue guardado');
    check(j.montoCobrado===120,'Total reconstruido incorrecto');
  });
  await test('Asignación de jornada de cobro pendiente',async()=>{
    field('#cobroJornadaPeriodo','2026-01');cargarPendientesCobro();ordenarJornadaCobro();
    await guardarJornadaCobroActual();
    const j=(await rows('jornadas_cobro')).find(j=>j.tipo==='ASIGNADA');
    check(j?.clienteIds.length===3&&j.montoEsperado===180&&j.montoCobrado===0&&j.pagosIds.length===0,'Asignación de cobro incorrecta');
  });
  await test('Solicitud: revisión, denegación y filtros',async()=>{
    await cambiarEstadoSolicitud('test-sol','EN_REVISION');
    check((await read('solicitudes','test-sol')).estado==='EN_REVISION','Revisión no persistida');
    window.prompt=()=> 'Fuera de cobertura';
    await cambiarEstadoSolicitud('test-sol','DENEGADA');
    field('#filtroSolicitudEstado','DENEGADA');renderSolicitudes();
    check(document.querySelector('#filtroSolicitudEstado').value==='DENEGADA','Filtro DENEGADA ausente');
    check(document.querySelector('#tablaSolicitudes').textContent.includes('Solicitud demo'),'Solicitud denegada no visible');
  });
  await test('Solicitud: conversión idempotente y cliente visible sin recargar',async()=>{
    for(let i=0;i<2;i++){
      const answers=['El Centro','60','15'];window.prompt=()=>answers.shift();
      await cambiarEstadoSolicitud('test-sol','APROBADA');
    }
    const s=await read('solicitudes','test-sol');
    check(s.estado==='CONVERTIDA_CLIENTE'&&s.clienteIdGenerado,'Solicitud no convertida');
    check((await rows('clientes')).filter(c=>c.nombre==='Solicitud demo').length===1,'Cliente duplicado');
    check(clientes.some(c=>c.id===s.clienteIdGenerado),'Cliente creado no aparece hasta recargar');
    field('#filtroSolicitudEstado','CONVERTIDA_CLIENTE');renderSolicitudes();
    check(document.querySelector('#tablaSolicitudes').textContent.includes('Solicitud demo'),'Filtro de convertidas no funciona');
  });
  const alta = {nombre:'Cliente Manual',telefono:'',ruta:'Ixobel',lugar:'Barrio Nuevo',diaPago:20,tipoServicio:'Basico',precio:70};
  function formularioAlta(datos = alta) {
    click('#ingresarCliente');
    for (const [campo, valor] of Object.entries(datos)) field('#formEditarCliente [name='+campo+']',valor);
  }
  await test('Alta mediante formulario, pin, persistencia, auditoría y vistas sin recargar',async()=>{
    click('[data-tab="clientes"]');
    const antes=clientes.length, activosAntes=Number(document.querySelector('#dashClientes').textContent);
    formularioAlta();
    await new Promise(r=>setTimeout(r,180));
    check(document.querySelector('#editarLat').value===''&&document.querySelector('#editarLng').value==='','Centro guardado implícitamente');
    mapaEdicion.marker.setLatLng([16.35,-89.45]);mapaEdicion.marker.fire('dragend');
    check(Number(document.querySelector('#editarLat').value)===16.35,'Pin no actualiza campos');
    click('#centrarCoordenadas');
    await document.querySelector('#guardarCliente').onclick();
    const c=(await rows('clientes')).find(c=>c.nombre===alta.nombre);
    check(c&&c.lat===16.35&&c.lng===-89.45,'Coordenadas no persistidas');
    check(c.globalUuid===c.id&&c.activo&&c.syncStatus==='SYNCED'&&c.originDevice==='WEB_ENTERPRISE'&&typeof c.fechaAlta==='number'&&typeof c.updatedAt==='number','Contrato Android incorrecto');
    check(clientes.length===antes+1&&document.querySelector('#tablaClientes').textContent.includes(alta.nombre),'Alta no visible sin recargar');
    check(Number(document.querySelector('#dashClientes').textContent)===activosAntes+1,'KPI no actualizado');
    check(document.querySelector('#tablaOperacion').textContent.includes(alta.nombre),'Planificación no actualizada');
    check(document.querySelector('#cobroJornadaBarrio').textContent.includes(alta.lugar),'Barrios de jornadas no actualizados');
    const esperado=clientes.filter(activo).reduce((total,c)=>total+Number(c.precio||0),0);
    check(document.querySelector('#metricasCobros').textContent.includes(moneda(esperado)),'Cobros no actualizados');
    cargarPendientesCobro();
    check(seleccionCobro.has(c.id),'Nuevo cliente no disponible en jornadas');
    check(!document.querySelector('#formEditarCliente')&&testAlerts.includes('Cliente ingresado correctamente.'),'Modal o confirmación incorrectos');
    const audit=(await rows('auditoria')).find(a=>a.entidadId===c.id&&a.accion==='CREAR_CLIENTE');
    check(audit&&audit.entidad==='CLIENTE'&&audit.usuario==='enterprise'&&audit.origen==='WEB_ENTERPRISE'&&audit.ubicacionAnterior.lat===null&&audit.ubicacionAnterior.lng===null&&audit.ubicacionNueva.lat===c.lat&&audit.ubicacionNueva.lng===c.lng&&audit.cambios.nombre===alta.nombre,'Auditoría incorrecta');
    check((await rows('identidades_clientes')).some(i=>i.clienteUuid===c.id),'Identidad ausente');
  });
  await test('Duplicado con espacios y mayúsculas no deja escrituras parciales',async()=>{
    const antes=await Promise.all(['clientes','identidades_clientes','auditoria'].map(rows));
    formularioAlta({...alta,nombre:'  CLIENTE   manual ',lugar:' BARRIO   nuevo '});
    await document.querySelector('#guardarCliente').onclick();
    check(testAlerts.at(-1)==='Ya existe un cliente con el mismo nombre, ruta y barrio.','Mensaje de duplicado incorrecto');
    const despues=await Promise.all(['clientes','identidades_clientes','auditoria'].map(rows));
    check(antes.every((a,i)=>a.length===despues[i].length),'Duplicado dejó información parcial');
    cerrarModalCliente(document.querySelector('.cliente-modal'));
  });
  await test('Alta sin mover pin y Sin ubicación persisten null',async()=>{
    for (const limpiar of [false,true]) {
      formularioAlta({...alta,nombre:'Sin ubicación '+limpiar});
      await new Promise(r=>setTimeout(r,180));
      if(limpiar){mapaEdicion.marker.setLatLng([16.36,-89.46]);mapaEdicion.marker.fire('dragend');click('#sinUbicacion');}
      await document.querySelector('#guardarCliente').onclick();
      const c=(await rows('clientes')).find(c=>c.nombre==='Sin ubicación '+limpiar);
      check(c&&c.lat===null&&c.lng===null,'Ubicación inventada');
    }
  });
  await test('Servicio valida alta y rechaza coordenadas incompletas o fuera de rango',async()=>{
    const antes=(await rows('clientes')).length;
    for(const extra of [{nombre:' '},{ruta:'Otra'},{lugar:''},{tipoServicio:''},{diaPago:32},{diaPago:1.5},{precio:0},{lat:91,lng:0},{lat:0,lng:181},{lat:16},{lng:-89}]) {
      let rechazo=false;try{await service.crearCliente({...alta,...extra});}catch{rechazo=true;}
      check(rechazo,'Servicio aceptó '+JSON.stringify(extra));
    }
    check((await rows('clientes')).length===antes,'Alta inválida persistida');
  });
  await test('Altas concurrentes reservan una sola identidad',async()=>{
    const antes=(await rows('auditoria')).length;
    const resultados=await Promise.allSettled([service.crearCliente({...alta,nombre:'Concurrente'}),service.crearCliente({...alta,nombre:' CONCURRENTE '})]);
    check(resultados.filter(r=>r.status==='fulfilled').length===1,'Duplicados concurrentes');
    check((await rows('auditoria')).length===antes+1,'Auditoría concurrente incorrecta');
  });
  await test('Alta comparte hash e identidad con conversión de solicitudes',async()=>{
    let rechazo=false;
    try{await service.crearCliente({...alta,nombre:' SOLICITUD   DEMO ',ruta:' el CENTRO ',lugar:' EL centro '});}
    catch(e){rechazo=e.message==='Ya existe un cliente con el mismo nombre, ruta y barrio.';}
    check(rechazo,'Alta no reconoce identidad de solicitud');
  });
  await test('Texto del alta se muestra escapado en tabla y perfil',async()=>{
    const nombre='<img src=x onerror="window.altaInyectada=true">';
    formularioAlta({...alta,nombre});
    await document.querySelector('#guardarCliente').onclick();
    check(document.querySelector('#tablaClientes').textContent.includes(nombre)&&!document.querySelector('#tablaClientes img'),'HTML interpretado en tabla');
    abrirPerfilCliente(clientes.find(c=>c.nombre===nombre));
    check(document.querySelector('.cliente-modal h2').textContent===nombre&&!window.altaInyectada,'HTML interpretado en perfil');
    cerrarModalCliente(document.querySelector('.cliente-modal'));
  });
  await test('Reglas: sin eliminación de clientes ni modificación de auditoría',async()=>{
    let denied=false;try{await deleteDoc(doc(db,'clientes','test-c1'));}catch(e){denied=e.code==='permission-denied';}
    check(denied,'El emulador no aplica las reglas a la base default');
    const audit=(await rows('auditoria'))[0];
    denied=false;try{await setDoc(doc(db,'auditoria',audit.id),{alterada:true});}catch(e){denied=e.code==='permission-denied';}
    check(denied,'Auditoría modificable');
  });
  await test('Fecha y período locales al cambiar de mes en UTC',()=>{
    const RealDate=window.Date;
    try{
      window.Date=class extends RealDate {
        constructor(...args){super(...(args.length?args:['2026-10-01T02:30:00Z']));}
      };
      check(periodoActual()==='2026-09','Período adelantado por UTC');
      field('#jornadaFecha','');prepararOperativo();
      check(document.querySelector('#jornadaFecha').value==='2026-09-30','Día adelantado por UTC');
    }finally{window.Date=RealDate;}
  });
  return {tests,alerts:testAlerts,project:db.app.options.projectId,database:'default'};
})()
