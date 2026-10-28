// Software versions of the three ECHO agents + Message Broker (see report, Chapter 5).
// Vision Agent  -> publishes spatial data to the Message Broker
// Haptic Agent  -> subscribes, turns proximity into vibration
// Voice Agent   -> subscribes, filters real hazards, speaks + 3D-panned beep
import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

type Handler = (d: any) => void;
class MessageBroker {
  private topics: Record<string, Handler[]> = {};
  subscribe(topic: string, h: Handler) {
    (this.topics[topic] = this.topics[topic] || []).push(h);
    return () => { this.topics[topic] = this.topics[topic].filter((x) => x !== h); };
  }
  publish(topic: string, data: any) { (this.topics[topic] || []).forEach((h) => h(data)); }
}
export const broker = new MessageBroker();

// warnings and vibration only happen while navigating (or for the demo test button)
export const state = { navigating: false };

export type Det = {
  label: string;
  zone: 0 | 1 | 2;          // 0 left, 1 ahead (middle), 2 right
  level: 0 | 1 | 2;         // 0 far, 1 near, 2 very close
  area: number;
  box: [number, number, number, number]; // x, y, w, h (0..1)
};
const SIDE = ['on your left', 'ahead', 'on your right'];
const CLOSE = ['far away', 'near', 'very close'];
const DETECT_INTERVAL_MS = 900;
const MODEL_MAX_BOXES = 10;
const MODEL_MIN_SCORE = 0.6;

/* ---------- Voice Agent ---------- */
let ac: AudioContext | null = null;
export function beep(zone: number, level: number) {
  try {
    ac = ac || new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const o = ac!.createOscillator(), g = ac!.createGain(), p = ac!.createStereoPanner();
    o.frequency.value = level === 2 ? 880 : 520;
    g.gain.value = 0.22;
    p.pan.value = zone === 0 ? -1 : zone === 2 ? 1 : 0;   // 3D pan left / right
    o.connect(g); g.connect(p); p.connect(ac!.destination);
    o.start(); o.stop(ac!.currentTime + (level === 2 ? 0.35 : 0.15));
  } catch (e) {}
}
export const voice = {
  queue: [] as string[],
  speaking: false,
  lastText: '',
  lastAt: 0,
  flush() {
    if (!('speechSynthesis' in window) || this.queue.length === 0 || speechSynthesis.speaking) return;
    const next = this.queue.shift()!;
    const u = new SpeechSynthesisUtterance(next);
    u.rate = 0.92;
    u.pitch = 1.04;
    u.lang = 'en-US';
    u.onend = () => { this.speaking = false; this.flush(); };
    u.onerror = () => { this.speaking = false; this.flush(); };
    this.speaking = true;
    speechSynthesis.speak(u);
  },
  speak(text: string, urgent = true) {
    if (!('speechSynthesis' in window)) return;
    const clean = text.trim();
    if (!clean) return;
    const now = Date.now();
    if (!urgent && clean === this.lastText && now - this.lastAt < 5000) return;
    if (urgent) {
      speechSynthesis.cancel();
      this.queue = [];
      this.speaking = false;
    }
    if (this.speaking && !urgent) {
      const last = this.queue[this.queue.length - 1];
      if (last !== clean) this.queue.push(clean);
      return;
    }
    this.queue.push(clean);
    this.lastText = clean;
    this.lastAt = now;
    this.flush();
  },
  stop() {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    this.queue = [];
    this.speaking = false;
  },
};
let lastWarn = 0;
let lastAlertKey = '';
const describeHazard = (hz: Det) => {
  if (hz.level === 2) return `Obstacle ${SIDE[hz.zone]}, very close.`;
  if (hz.level === 1) return `Obstacle ${SIDE[hz.zone]}, nearby.`;
  return `Obstacle ${SIDE[hz.zone]}, in the distance.`;
};
broker.subscribe('spatial', (d) => {
  if (!state.navigating && !d.force) return;
  const hz: Det | undefined = [...(d.detections || [])]
    .filter((x: Det) => x.level > 0 && x.area > 0.04)
    .sort((a: Det, b: Det) => b.area - a.area)[0];
  if (!hz) return;
  const alertKey = `${hz.label}:${hz.zone}:${hz.level}`;
  const now = Date.now();
  const cooldown = alertKey === lastAlertKey ? 5500 : 2500;
  if (now - lastWarn < cooldown) return;
  lastWarn = now;
  lastAlertKey = alertKey;
  beep(hz.zone, hz.level);
  voice.speak(describeHazard(hz), false);
});

/* ---------- Haptic Agent ---------- */
broker.subscribe('spatial', (d) => {
  if (!state.navigating && !d.force) return;
  const m = Math.max(0, ...d.detections.map((x: Det) => x.level));
  if (m && navigator.vibrate) navigator.vibrate(m === 2 ? [300, 80, 300] : [120]); // closer = stronger
});

/* ---------- Vision Agent ---------- */
export const vision = {
  model: null as any,
  stream: null as MediaStream | null,
  timer: 0 as any,
  running: false,
  last: [] as Det[],
  async start(video: HTMLVideoElement, onCamera?: () => void) {
    this.running = true;
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = this.stream;
    await video.play().catch(() => {});
    onCamera && onCamera();
    if (!this.model) this.model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

    let lastTick = 0;
    const tick = async () => {
      if (!this.running) return;
      const now = Date.now();
      if (now - lastTick < DETECT_INTERVAL_MS) {
        this.timer = setTimeout(tick, DETECT_INTERVAL_MS - (now - lastTick));
        return;
      }
      lastTick = now;

      if (video.readyState >= 2 && video.videoWidth) {
        try {
          const W = video.videoWidth, H = video.videoHeight;
          const preds = await this.model.detect(video, MODEL_MAX_BOXES, MODEL_MIN_SCORE);
          const dets: Det[] = preds
            .filter((p: any) => p.score >= MODEL_MIN_SCORE)
            .slice(0, MODEL_MAX_BOXES)
            .map((p: any) => {
              const [x, y, w, h] = p.bbox;
              const area = (w * h) / (W * H);
              const cx = (x + w / 2) / W;
              return {
                label: p.class,
                zone: cx < 0.33 ? 0 : cx > 0.67 ? 2 : 1,
                level: area > 0.25 ? 2 : area > 0.08 ? 1 : 0,
                area,
                box: [x / W, y / H, w / W, h / H],
              } as Det;
            });
          this.last = dets.filter((d) => d.level > 0 || d.area > 0.08);
          broker.publish('spatial', { detections: this.last });
        } catch (e) {}
      }
      this.timer = setTimeout(tick, DETECT_INTERVAL_MS);
    };
    tick();
  },
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.last = [];
  },
  describe(): string {
    if (!this.last.length) return 'I do not see anything clearly right now.';
    const parts = [...this.last].sort((a, b) => b.area - a.area).slice(0, 4)
      .map((d) => `a ${d.label} ${SIDE[d.zone]}, ${CLOSE[d.level]}`);
    return 'I can see ' + parts.join('. ') + '.';
  },
  fake() { // backup for the demo: pretend an obstacle appeared
    const zone = Math.floor(Math.random() * 3) as 0 | 1 | 2;
    const level = (Math.random() > 0.5 ? 2 : 1) as 1 | 2;
    const det: Det = { label: 'obstacle', zone, level, area: 0.2, box: [zone / 3 + 0.03, 0.25, 0.27, 0.5] };
    lastWarn = 0;
    broker.publish('spatial', { detections: [det], force: true });
  },
};
