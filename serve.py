from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import argparse
import webbrowser

parser = argparse.ArgumentParser(description='Serve the Gombunan storybook on this computer.')
parser.add_argument('--port', type=int, default=8799)
parser.add_argument('--no-open', action='store_true')
args = parser.parse_args()

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.mjs': 'text/javascript', '.mind': 'application/octet-stream',
                      '.glb': 'model/gltf-binary', '.wasm': 'application/wasm'}

with ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(Path(__file__).parent / 'web'))) as http:
    url = f'http://localhost:{http.server_port}/'
    print(f'Gombunan Storybook: {url}  (Ctrl+C to stop)', flush=True)
    if not args.no_open:
        Timer(0.3, webbrowser.open, [url]).start()
    try:
        http.serve_forever()
    except KeyboardInterrupt:
        pass
