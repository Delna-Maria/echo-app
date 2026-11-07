"""ECHO Kinect bridge: reads the Xbox 360 Kinect depth camera and streams a small
grid of distances (metres) to the ECHO web app over a local WebSocket.

Run on the laptop the Kinect is plugged into:
    python bridge.py            # real Kinect
    python bridge.py --sim      # no Kinect: fake moving obstacle, for testing
"""
import argparse, asyncio, json, math, time
import numpy as np
import websockets

COLS, ROWS = 16, 12            # grid sent to the app (each cell = nearest-ish distance)
HZ = 10                        # frames per second sent
PORT = 8765
# keep only the middle band of rows: ignore ceiling and floor
ROW_LO, ROW_HI = 120, 400      # of 480 pixel rows


def raw_to_metres(raw):
    """Kinect v1 raw 11-bit value -> metres (community-fitted formula). 2047 = no reading."""
    raw = raw.astype(np.float32)
    m = np.full(raw.shape, np.nan, dtype=np.float32)
    ok = raw < 2047
    m[ok] = 1.0 / (raw[ok] * -0.0030711016 + 3.3309495161)
    m[(m < 0.4) | (m > 4.5)] = np.nan          # outside the sensor's reliable range
    return m


def to_grid(m):
    band = m[ROW_LO:ROW_HI, :]
    h, w = band.shape
    out = []
    for r in range(ROWS):
        row = []
        for c in range(COLS):
            cell = band[r * h // ROWS:(r + 1) * h // ROWS, c * w // COLS:(c + 1) * w // COLS]
            cell = cell[np.isfinite(cell)]
            # 10th percentile = "nearest surface" but ignores single noisy pixels
            row.append(round(float(np.percentile(cell, 10)), 2) if cell.size > 20 else None)
        out.append(row)
    return out


def real_frames():
    import freenect
    while True:
        raw, _ = freenect.sync_get_depth()
        yield to_grid(raw_to_metres(raw))


def sim_frames():
    t0 = time.time()
    while True:
        t = time.time() - t0
        grid = [[3.5] * COLS for _ in range(ROWS)]
        cx = int((math.sin(t / 3) * 0.5 + 0.5) * (COLS - 4))        # obstacle slides left-right
        dist = 1.0 + 0.8 * math.sin(t / 2) + 0.5                    # and moves nearer / farther
        for r in range(3, 10):
            for c in range(cx, cx + 4):
                grid[r][c] = round(dist, 2)
        yield grid


async def main(sim):
    frames = sim_frames() if sim else real_frames()
    clients = set()

    async def handler(ws):
        clients.add(ws)
        try:
            await ws.wait_closed()
        finally:
            clients.discard(ws)

    async with websockets.serve(handler, "0.0.0.0", PORT):
        print(f"ECHO Kinect bridge on ws://localhost:{PORT}  ({'SIMULATED' if sim else 'real Kinect'})")
        loop = asyncio.get_running_loop()
        while True:
            start = time.time()
            grid = await loop.run_in_executor(None, next, frames)   # read off the event loop
            msg = json.dumps({"t": int(time.time() * 1000), "cols": COLS, "rows": ROWS, "grid": grid})
            websockets.broadcast(clients, msg)
            await asyncio.sleep(max(0, 1 / HZ - (time.time() - start)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sim", action="store_true", help="fake data, no Kinect needed")
    asyncio.run(main(ap.parse_args().sim))
