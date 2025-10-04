# Hand Gesture Drawing (Web + Python API)

This project lets users draw using hand gestures in the browser using MediaPipe Hands (JS). Drawings can be saved to SQLite via a small Python Flask API. Two visual effects (paper, metal) are applied to the drawing canvas using OpenCV.js.

## Prerequisites
- Python 3.9+
- Node is NOT required. We can use a simple static file server.
- Chrome on desktop with webcam permissions.

## Folder Layout
- `web/` — static frontend (HTML/CSS/JS)
- `server/` — Python Flask API with SQLite

## 1) Start the Python API
```
cd "server"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
The API will run at `http://127.0.0.1:5001`.

## 2) Start a local static server for the frontend
Use Python's http server:
```
cd "../web"
python3 -m http.server 8080
```
Visit `http://127.0.0.1:8080` in Chrome.

Grant the page access to your webcam. Use the controls to start/stop drawing, change pen, apply effects, clear, and save. Saved drawings appear in the right sidebar, loaded from SQLite via the API.

## Notes
- Effects are applied on the drawing canvas only, not the camera feed.
- If OpenCV.js hasn't finished loading yet, effects are skipped until ready.
- If the gallery is empty, ensure the API is running and CORS is allowed.

## Troubleshooting
- If camera doesn't start: check browser permissions and that no other app uses the webcam.
- If save fails: confirm the API server logs show requests and `drawings.db` is created in `server/`.
- Use Chrome DevTools Console for any JS errors. 