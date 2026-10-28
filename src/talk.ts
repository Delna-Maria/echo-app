// ECHO's "personality": friendly names for objects + conversational sentences.
import type { Det } from './agents';

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

// the detector's technical names -> everyday names
const NAMES: Record<string, string> = {
  'cell phone': 'mobile phone', 'dining table': 'table', 'tv': 'television', 'wine glass': 'drinking glass',
  'potted plant': 'plant', 'couch': 'sofa', 'remote': 'remote control', 'sports ball': 'ball',
  'hair drier': 'hair dryer', 'refrigerator': 'fridge', 'handbag': 'bag', 'mouse': 'computer mouse',
};
export const nice = (cls: string) => NAMES[cls] || cls;

// small things you hold or put down: listed in "what's around me", but never a walking hazard
const SMALL = new Set(['cell phone', 'remote', 'mouse', 'keyboard', 'book', 'cup', 'bottle', 'wine glass', 'fork',
  'knife', 'spoon', 'bowl', 'scissors', 'toothbrush', 'hair drier', 'clock', 'vase', 'tie', 'banana', 'apple',
  'orange', 'sandwich', 'donut', 'cake', 'sports ball', 'frisbee', 'handbag', 'teddy bear']);
export const isHazard = (cls: string) => !SMALL.has(cls);

const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const where = (z: number) => ['on your left', 'right in front of you', 'on your right'][z];
const away = (lv: number) => ['a few steps away', 'two or three steps away', 'about a step away'][lv];
const list = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export const talk = {
  greet: () => "Hi, I'm ECHO. Tap Speak and tell me where you'd like to go, or ask me what's around you.",
  hello: () => pick(["Hello! Where would you like to go?", "Hi there! I'm ready when you are.", "Hey! Tell me where to, or ask what's around you."]),
  thanks: () => pick(["You're welcome!", "Happy to help.", "Anytime."]),
  help: () => "You can say: go to the library, next, repeat, what's around me, find my glasses, or look closer. Say stop any time.",
  start: (d: string) => pick([`Okay, let's head to the ${d}.`, `Sure, taking you to the ${d}.`, `Alright, the ${d}. I'll guide you.`]),
  step: (i: number, n: number, t: string) =>
    i === 0 ? `${pick(['Okay, first,', 'To begin,', 'Alright, first,'])} ${lower(t)}`
    : i === n - 1 ? `${pick(['Almost there!', 'Nearly there.', 'Last bit.'])} ${t}`
    : `${pick(['Next,', 'Okay, now,', 'Alright, next,'])} ${lower(t)}`,
  arrive: (d: string) => `${pick(["You've arrived", "We're here", "You made it"])} at the ${d}. Anything else?`,
  notStarted: () => "We haven't started yet. Tell me where you'd like to go.",
  stopped: () => pick(["Okay, I've stopped navigation. I'm here if you need me.", "Navigation stopped. Just tap Speak when you're ready."]),
  notHeard: () => pick(["Sorry, I didn't catch that. You can say help to hear what I can do.", "Hmm, I didn't get that. Try saying go to the library, or say help."]),
  didntHear: () => pick(["I didn't hear anything. Tap Speak and try again.", "Sorry, I missed that. Tap Speak and try once more."]),
  noCamera: () => "I can't use the camera right now. Check the connection list.",
  thinking: () => pick(["Okay, give me a moment to take a closer look.", "Sure, let me have a careful look."]),
  closerFailed: () => "Sorry, I couldn't take a closer look just now. Try again in a moment.",
  warn: (label: string, zone: number, level: number, again: boolean) =>
    again ? `Still ${an(label)} ${where(zone)}, ${away(level)}.`
    : `${level === 2 ? pick(['Careful,', 'Watch out,']) : pick(['Heads up,', 'Just so you know,'])} ${an(label)} ${where(zone)}, ${away(level)}.`,
  describe: (dets: Det[]) => {
    if (!dets.length) return "I can't make out anything clearly right now. Try holding the phone a little higher and steady.";
    const top = [...dets].sort((a, b) => b.area - a.area).slice(0, 4);
    const parts = top.map((d) => `${an(d.label)} ${where(d.zone)}, ${away(d.level)}`);
    return `${pick(['Right now I can see', 'Looking ahead, I can see', 'I can see'])} ${list(parts)}.`;
  },
  found: (what: string, dets: Det[]) => {
    if (!dets.length) return `I can't see ${what} right now. Turn slowly and ask me again.`;
    const d = [...dets].sort((a, b) => b.area - a.area)[0];
    return `${pick(['Found it!', 'I see it.', 'Got it.'])} The ${what} is ${where(d.zone)}, ${away(d.level)}.`;
  },
};
