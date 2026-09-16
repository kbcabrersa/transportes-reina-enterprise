import { readFile, writeFile } from 'node:fs/promises';

const targets = await (await fetch('http://127.0.0.1:9225/json')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once:true}));
let id = 0;
const pending = new Map();
const exceptions = [];
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    message.error ? task.reject(message.error) : task.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  if (message.method === 'Runtime.executionContextsCleared') exceptions.length=0;
});
function send(method, params={}) {
  return new Promise((resolve,reject) => {
    pending.set(++id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
}
try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setTimezoneOverride', {timezoneId:'America/Guatemala'});
  await send('Network.enable');
  await send('Network.setCacheDisabled', {cacheDisabled:true});
  await send('Network.setBlockedURLs', {urls:['https://*']});
  await send('Page.addScriptToEvaluateOnNewDocument', {source:`localStorage.setItem('enterpriseAuth','true'); window.testAlerts=[];window.alert=m=>testAlerts.push(m);`});
  // Solo elimina fixtures del proyecto demo, nunca toca otro proyecto.
  const reset = await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-reina-enterprise/databases/default/documents', {method:'DELETE'});
  if (!reset.ok) throw new Error('No se pudo limpiar el emulador demo');
  await send('Page.navigate', {url:'http://127.0.0.1:8765/pages/dashboard-enterprise.html'});
  for (let i=0;i<100;i++) {
    const r = await send('Runtime.evaluate', {expression:'typeof firebaseEnterprise !== "undefined" && !!firebaseEnterprise.registrarPagoManual',returnByValue:true});
    if (r.result.value) break;
    if (i===99) throw new Error('El portal no cargó Firebase');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const source=await readFile(new URL('./browser-scenarios.js',import.meta.url),'utf8');
  const result=await send('Runtime.evaluate',{expression:source,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const report={...result.result.value,exceptions};
  await writeFile('/tmp/reina-enterprise-test-results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Runtime.evaluate', {expression:`document.querySelector('[data-tab="clientes"]').click()`});
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  await writeFile('/tmp/reina-enterprise-clientes.png',Buffer.from(screenshot.data,'base64'));
  await send('Page.navigate',{url:'http://127.0.0.1:8765/pages/dashboard-enterprise.html#dashboard'});
  process.exitCode=report.tests.some(t=>!t.ok)||exceptions.length?1:0;
} finally {
  ws.close();
}
