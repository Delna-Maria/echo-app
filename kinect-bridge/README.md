# ECHO Kinect bridge

Reads the Xbox 360 Kinect depth camera and streams distances to the ECHO web app.

```
Kinect -> USB adapter -> laptop -> bridge.py --(WebSocket ws://localhost:8765)--> ECHO app (Chrome, same laptop)
```

## Try it without a Kinect first
    pip install numpy websockets
    python bridge.py --sim
Open the ECHO app in Chrome on the same laptop. "Kinect depth sensor" turns green and a fake obstacle slides across.

## With the real Kinect
1. Plug the Kinect in through its USB power adapter (the Xbox 360 Kinect needs its own 12 V supply).
2. Install libfreenect + the Python wrapper.
   - Linux/macOS: build from https://github.com/OpenKinect/libfreenect with `-DBUILD_PYTHON3=ON`.
   - Windows: use the libusbK driver (Zadig) for "Xbox NUI Motor / Camera", then build libfreenect.
3. `pip install -r requirements.txt` then `python bridge.py`

## Notes
- Run the app in Chrome on the laptop. Chrome allows an https page to talk to ws://localhost, but a phone cannot reach the laptop's localhost.
- Different bridge address: open the app with `?kinect=ws://192.168.1.20:8765`. Disable depth: `?kinect=off`.
- Reliable range is about 0.5 to 4 m. Direct sunlight blinds the Kinect. Glass and shiny black surfaces read wrong.
- Thresholds live in `src/depth.ts` (very close under 0.9 m, near under 1.8 m, unknown obstacle under 1.2 m).
