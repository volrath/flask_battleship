from flask import Flask, render_template, request
app = Flask(__name__)

from gevent import monkey; monkey.patch_all()
from socketio import socketio_manage

from battleship import BattleShipNamespace


@app.route('/')
def battleship():
    return render_template('battleship.html')

@app.route('/socket.io/<path:path>')
def socket_io(path):
    socketio_manage(request.environ, {'': BattleShipNamespace})

if __name__ == '__main__':
    if app.debug:
        from werkzeug.debug import DebuggedApplication
        app.wsgi_app = DebuggedApplication(app.wsgi_app, True)

    from socketio.server import SocketIOServer
    SocketIOServer(('127.0.0.1', 5000), app, namespace="socket.io",
                   policy_server=False).serve_forever()
