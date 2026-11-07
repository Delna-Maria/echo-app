// Depth Agent: receives the Kinect depth grid from the local bridge (kinect-bridge/bridge.py)
// and answers "how far away is this?" in real metres. Falls back silently when no Kinect is connected.
export type DepthStatus = 'connected' | 'off' | 'waiting';

const STALE_MS = 1500;          // grid older than this is ignored
const VERY_CLOSE_M = 0.9;       // under this = level 2
const NEAR_M = 1.8;             // under this = level 1
const UNKNOWN_OBSTACLE_M = 1.2; // depth-only warning for things the camera AI cannot name

export const levelFromMetres = (m: number): 0 | 1 | 2 => (m < VERY_CLOSE_M ? 2 : m < NEAR_M ? 1 : 0);

function percentile(a: number[], p: number) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

export const depth = {
  grid: null as (number | null)[][] | null,
  cols: 0,
  rows: 0,
  at: 0,
  ws: null as WebSocket | null,
  retry: 0 as any,
  wanted: false,

  start(url: string, onStatus: (s: DepthStatus, note: string) => void) {
    this.wanted = true;
    const connect = () => {
      if (!this.wanted) return;
      onStatus('waiting', 'looking for the Kinect bridge');
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch (e) { onStatus('off', 'bad bridge address'); return; }
      this.ws = ws;
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          this.grid = m.grid; this.cols = m.cols; this.rows = m.rows; this.at = Date.now();
          onStatus('connected', 'depth sensing');
        } catch (err) {}
      };
      ws.onclose = () => {
        this.grid = null;
        onStatus('off', 'bridge not running');
        this.retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    // if the bridge stops sending (Kinect unplugged), say so
    const watch = setInterval(() => {
      if (!this.wanted) return clearInterval(watch);
      if (this.grid && Date.now() - this.at > STALE_MS) { this.grid = null; onStatus('off', 'no depth data'); }
    }, 1000);
  },

  stop() {
    this.wanted = false;
    clearTimeout(this.retry);
    this.ws && this.ws.close();
    this.grid = null;
  },

  fresh() { return !!this.grid && Date.now() - this.at < STALE_MS; },

  /** Distance in metres to whatever is inside a camera box (x, y, w, h as 0..1), or null if unknown. */
  metresForBox(box: [number, number, number, number]): number | null {
    if (!this.fresh()) return null;
    const [x, , w] = box;
    const pad = w * 0.2;                                        // use the middle 60% of the box, edges are mostly background
    const c0 = Math.max(0, Math.floor((x + pad) * this.cols));
    const c1 = Math.min(this.cols - 1, Math.ceil((x + w - pad) * this.cols) - 1);
    const vals: number[] = [];
    for (const row of this.grid!) for (let c = c0; c <= Math.max(c0, c1); c++) if (row[c] != null) vals.push(row[c] as number);
    return vals.length ? Math.round(percentile(vals, 0.2) * 10) / 10 : null;
  },

  /** Nearest surface in the left, middle and right thirds (metres, or null). */
  nearestByZone(): (number | null)[] {
    if (!this.fresh()) return [null, null, null];
    return [0, 1, 2].map((z) => {
      const c0 = Math.floor((z * this.cols) / 3), c1 = Math.floor(((z + 1) * this.cols) / 3);
      const vals: number[] = [];
      for (const row of this.grid!) for (let c = c0; c < c1; c++) if (row[c] != null) vals.push(row[c] as number);
      return vals.length ? Math.round(percentile(vals, 0.1) * 10) / 10 : null;
    });
  },

  UNKNOWN_OBSTACLE_M,
};
