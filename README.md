

<img width="1200" height="430" alt="Screenshot 2025-10-04 at 11 36 41 AM" src="https://github.com/user-attachments/assets/b10ccf32-0805-43a7-921d-84bcd1698d92" />


# Gesture Thinking - Shape reality around you. 
Not only the physical act but perception, ideation and shaping of the world around you. Analytical thinking led by spatial awareness. 
*First idea: Build a thermal imagining tool to draw with our energy. (In process)
I need a thermal camera (diy!)*

## Result: 
I built a hand gesture tracking tool to draw in space and create memories with it  to simulate a daily-sketch of your life. Drawing IS NOT reduced to be a graphical or even visual thing but it’s the intricate understanding of gesture of everything that’s real. 


## v0 Installation:
<img width="1058" height="560" alt="Screenshot 2025-10-01 at 1 17 54 AM" src="https://github.com/user-attachments/assets/b1803643-0263-47d7-ae45-0b2338a3f96a" />




```
This project lets users draw using hand gestures in the browser using MediaPipe Hands (JS). Drawings can be saved to SQLite via a small Python Flask API. Two visual effects (paper, metal) are applied to the drawing canvas using OpenCV.js.
```
## - Prerequisites
- Python 3.9+
- Node is NOT required. We can use a simple static file server.
- Chrome on desktop with webcam permissions.

## - Folder Layout
- `web/` — static frontend (HTML/CSS/JS) Tailwind CSS
- `server/` — Python Flask API with SQLite
- OpenCV, Mediapipe and Pygame download from Terminal

```use terminal for the following instructions
```
## 1) Start the API
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

**Allow access to your webcam.** Use the controls to start/stop drawing, change pen, apply effects, clear, and save.
**Saved drawings appear in the right sidebar, loaded from SQLite via the API.**

## Notes
- Effects are applied on the drawing canvas only, not the camera feed. 
- If OpenCV.js hasn't finished loading yet, effects are skipped until ready.
- If the gallery is empty, ensure the API is running and CORS is allowed.

## Troubleshooting
- If camera doesn't start: check browser permissions and that no other app uses the webcam.
- If save fails: confirm the API server logs show requests and `drawings.db` is created in `server/`.
- Use Chrome DevTools Console for any JS errors. 
