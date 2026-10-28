import { useEffect, useRef, useState } from 'react';
import { broker, voice, vision, state, beep, Det } from './agents';
import { ROUTES } from './routes';
import './styles.css';

type Dev = { s: 'connected' | 'off' | 'waiting'; note: string };

function Row({ name, d }: { name: string; d: Dev }) {
  const word = d.s === 'connected' ? 'Connected' : d.s === 'waiting' ? 'Checking' : 'Not connected';
  const mark = d.s === 'connected' ? '✓' : d.s === 'waiting' ? '…' : '✕';
  return (
    <li className={'row ' + d.s}>
      <span>{name}</span>
      <span><span aria-hidden="true">{mark} </span>{word}{d.note ? ` (${d.note})` : ''}</span>
    </li>
  );
}

export default function App() {
  const [msg, setMsg] = useState('Tap the big Speak button and say where you want to go.');
  const [listening, setListening] = useState(false);
  const [ar, setAr] = useState(4 / 3);
  const [cam, setCam] = useState<Dev>({ s: 'waiting', note: '' });
  const [mic, setMic] = useState<Dev>({ s: 'waiting', note: 'tap Speak to allow' });
  // Haptic wristband and in-ear module: stand-ins until the real hardware arrives
  const [haptic] = useState<Dev>('vibrate' in navigator
    ? { s: 'connected', note: 'phone vibration' } : { s: 'off', note: 'no vibration on this phone' });
  const [ear] = useState<Dev>('speechSynthesis' in window
    ? { s: 'connected', note: 'phone audio' } : { s: 'off', note: '' });

  const route = useRef<string[]>([]);
  const step = useRef(0);
  const dest = useRef('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const say = (t: string) => { setMsg(t); voice.speak(t); };

  /* ----- NavigationEngine (simple) ----- */
  const speakStep = () => say(`Step ${step.current + 1} of ${route.current.length}. ${route.current[step.current]}`);
  const startNav = (name: string) => {
    route.current = ROUTES[name]; step.current = 0; dest.current = name; state.navigating = true;
    say(`Starting navigation to ${name}.`);
    setTimeout(speakStep, 2200);
  };
  const nextStep = () => {
    if (!state.navigating) return say('Navigation has not started. Say a destination first.');
    step.current += 1;
    if (step.current >= route.current.length) { state.navigating = false; return say(`You have arrived at ${dest.current}.`); }
    speakStep();
  };
  const repeat = () => (state.navigating ? speakStep() : say('Navigation has not started.'));
  const stopNav = () => { state.navigating = false; say('Navigation stopped.'); };
  const around = () => say(vision.describe());

  const handle = (said: string) => {
    const t = said.toLowerCase();
    const hit = Object.keys(ROUTES).find((n) => t.includes(n.toLowerCase().split(' ')[0]));
    if (t.includes('stop')) stopNav();
    else if (t.includes('next')) nextStep();
    else if (t.includes('repeat') || t.includes('again')) repeat();
    else if (t.includes('around') || t.includes('what') || t.includes('see')) around();
    else if (t.includes('test') || t.includes('obstacle')) vision.fake();
    else if (hit) startNav(hit);
    else say('I did not catch that. You can say: go to library, next, repeat, what is around me, or stop.');
  };

  const listen = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return say('Voice input needs Chrome on Android. Open backup controls instead.');
    voice.stop();
    const r = new SR();
    r.lang = 'en-IN';
    r.onstart = () => { setListening(true); setMic({ s: 'connected', note: '' }); };
    r.onend = () => setListening(false);
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === 'not-allowed') setMic({ s: 'off', note: 'blocked, allow in browser settings' });
      say('I did not hear you. Tap Speak and try again.');
    };
    r.onresult = (e: any) => handle(e.results[0][0].transcript);
    beep(1, 1);
    setTimeout(() => r.start(), 400);
  };

  /* ----- camera + Vision Agent ----- */
  useEffect(() => {
    vision.start(videoRef.current!, () => setCam({ s: 'connected', note: '' }))
      .catch(() => setCam({ s: 'off', note: 'allow camera access' }));
    return () => vision.stop();
  }, []);

  /* ----- microphone permission status ----- */
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMic({ s: 'off', note: 'use Chrome on Android' }); return; }
    (navigator as any).permissions?.query({ name: 'microphone' }).then((p: any) => {
      const upd = () => setMic(p.state === 'granted' ? { s: 'connected', note: '' }
        : p.state === 'denied' ? { s: 'off', note: 'blocked' } : { s: 'waiting', note: 'tap Speak to allow' });
      upd(); p.onchange = upd;
    }).catch(() => {});
  }, []);

  /* ----- draw blue boxes with names on the camera preview ----- */
  useEffect(() => broker.subscribe('spatial', (d) => {
    const c = canvasRef.current, v = videoRef.current;
    if (!c || !v) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const fs = Math.round(c.width / 20);
    g.font = `bold ${fs}px sans-serif`; g.lineWidth = 6;
    (d.detections as Det[]).forEach((x) => {
      const bx = x.box[0] * c.width, by = x.box[1] * c.height, bw = x.box[2] * c.width, bh = x.box[3] * c.height;
      g.strokeStyle = '#3f2a96'; g.strokeRect(bx, by, bw, bh);
      const tw = g.measureText(x.label).width + 12;
      g.fillStyle = '#3f2a96'; g.fillRect(bx, Math.max(0, by - fs - 6), tw, fs + 6);
      g.fillStyle = '#fff'; g.fillText(x.label, bx + 6, Math.max(fs, by - 8));
    });
  }), []);

  return (
    <div className="app">
      <h1>ECHO</h1>

      <button className={'speak' + (listening ? ' listening' : '')} onClick={listen}
        aria-label="Speak. Double tap, then say a destination, next, repeat, what is around me, or stop.">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
        </svg>
        {listening ? 'Listening…' : 'Speak'}
      </button>

      <div className="msg">{msg}</div>

      <section className="card" aria-labelledby="conn">
        <h2 id="conn">Connections</h2>
        <ul>
          <Row name="Camera" d={cam} />
          <Row name="Microphone" d={mic} />
          <Row name="Haptic wristband" d={haptic} />
          <Row name="In-ear module" d={ear} />
        </ul>
      </section>

      <div className="cam" aria-hidden="true" style={{ aspectRatio: String(ar) }}>
        <video ref={videoRef} autoPlay playsInline muted
          onLoadedMetadata={(e) => setAr(e.currentTarget.videoWidth / e.currentTarget.videoHeight)} />
        <canvas ref={canvasRef} />
      </div>

      <details>
        <summary>Backup controls</summary>
        <div className="backup">
          {Object.keys(ROUTES).map((n) => <button key={n} onClick={() => startNav(n)}>{n}</button>)}
          <button onClick={nextStep}>Next step</button>
          <button onClick={repeat}>Repeat</button>
          <button onClick={around}>What is around me</button>
          <button onClick={stopNav}>Stop</button>
          <button onClick={() => vision.fake()}>Test obstacle</button>
        </div>
      </details>
    </div>
  );
}
