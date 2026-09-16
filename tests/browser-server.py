"""Portal de pruebas: SDK local y Firestore demo; nunca sirve la configuración productiva."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
import os

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(os.environ.get('REINA_TEST_ASSETS', '/tmp/reina-test-assets'))

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/js/firebase-config.js':
            content = '''
import {initializeApp} from '/__sdk/firebase-app.js';
import {getFirestore,connectFirestoreEmulator} from '/__sdk/firebase-firestore.js';
const app=initializeApp({projectId:'demo-reina-enterprise',apiKey:'demo-key'});
export const db=getFirestore(app,'default');
connectFirestoreEmulator(db,'127.0.0.1',8085);
export const storage=null;
export default app;
'''
        elif path.startswith('/__sdk/'):
            file = ASSETS / Path(path).name
            if not file.is_file():
                self.send_error(404)
                return
            if file.suffix == '.png':
                body = file.read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'image/png')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            content = file.read_text()
        elif path.endswith('.js') or path.endswith('.html'):
            file = (ROOT / path.lstrip('/')).resolve()
            if not file.is_relative_to(ROOT) or not file.is_file():
                self.send_error(404)
                return
            content = file.read_text()
        else:
            return super().do_GET()
        content = content.replace('https://www.gstatic.com/firebasejs/12.2.1/', '/__sdk/')
        content = content.replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', '/__sdk/leaflet.js')
        content = content.replace('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', '/__sdk/leaflet.css')
        body = content.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html' if path.endswith('.html') else 'text/css' if path.endswith('.css') else 'text/javascript')
        self.send_header('Content-Length', str(len(body)))
        # El navegador de pruebas solo puede contactar servicios locales.
        self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src http://127.0.0.1:8085 http://127.0.0.1:8765; img-src 'self' data: blob:; frame-src 'none'")
        self.end_headers()
        self.wfile.write(body)

os.chdir(ROOT)
print('Portal aislado: http://127.0.0.1:8765/pages/dashboard-enterprise.html', flush=True)
ThreadingHTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
