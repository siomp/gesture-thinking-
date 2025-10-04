import base64
import os
import sqlite3
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'drawings.db')
STORAGE_DIR = os.path.join(BASE_DIR, 'storage')
os.makedirs(STORAGE_DIR, exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS drawings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at TEXT NOT NULL,
          image_path TEXT NOT NULL,
          effect TEXT,
          pen_color TEXT,
          pen_size INTEGER,
          brush TEXT
        );
        """
    )
    conn.commit()
    conn.close()


@app.route('/api/drawings', methods=['POST'])
def save_drawing():
    data = request.get_json(force=True)
    image_data_url = data.get('image')
    effect = data.get('effect')
    pen_color = data.get('penColor')
    pen_size = data.get('penSize')
    brush = data.get('brush')

    if not image_data_url or not image_data_url.startswith('data:image/png;base64,'):
        return jsonify({"error": "image must be a data URL data:image/png;base64,..."}), 400

    b64 = image_data_url.split(',', 1)[1]
    try:
        raw = base64.b64decode(b64)
    except Exception:
        return jsonify({"error": "invalid base64"}), 400

    filename = f"drawing_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}.png"
    filepath = os.path.join(STORAGE_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(raw)

    conn = get_db()
    conn.execute(
        "INSERT INTO drawings (created_at, image_path, effect, pen_color, pen_size, brush) VALUES (?, ?, ?, ?, ?, ?)",
        (datetime.utcnow().isoformat() + 'Z', filename, effect, pen_color, int(pen_size) if pen_size else None, brush)
    )
    conn.commit()
    cur = conn.execute("SELECT last_insert_rowid() AS id")
    row = cur.fetchone()
    conn.close()

    return jsonify({"id": row['id'], "image": f"/api/files/{filename}"}), 201


@app.route('/api/drawings', methods=['GET'])
def list_drawings():
    conn = get_db()
    cur = conn.execute("SELECT id, created_at, image_path, effect, pen_color, pen_size, brush FROM drawings ORDER BY id DESC")
    items = [dict(row) for row in cur.fetchall()]
    for it in items:
        it['image'] = f"/api/files/{it['image_path']}"
    conn.close()
    return jsonify(items)


@app.route('/api/drawings/<int:item_id>', methods=['GET'])
def get_drawing(item_id: int):
    conn = get_db()
    cur = conn.execute("SELECT id, created_at, image_path, effect, pen_color, pen_size, brush FROM drawings WHERE id = ?", (item_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    item = dict(row)
    item['image'] = f"/api/files/{item['image_path']}"
    return jsonify(item)


@app.route('/api/files/<path:filename>', methods=['GET'])
def serve_file(filename: str):
    return send_from_directory(STORAGE_DIR, filename, as_attachment=False)


if __name__ == '__main__':
    init_db()
    # Bind to all interfaces for phone access on LAN; use a tunnel for HTTPS
    app.run(host='0.0.0.0', port=5001, debug=True) 