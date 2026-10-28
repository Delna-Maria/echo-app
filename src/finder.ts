// "Look closer": an open-vocabulary detector that can find things the live detector cannot
// (glasses, headphones, keys...). It loads only when asked, because the model is large.
import type { Det } from './agents';

export const EXTRA = ['glasses', 'sunglasses', 'headphones', 'earphones', 'keys', 'wallet', 'watch', 'door',
  'staircase', 'water bottle', 'shoes', 'helmet', 'id card', 'charger', 'pen', 'trash can', 'fan', 'plate'];

let owl: any = null;
export async function lookFor(video: HTMLVideoElement, labels: string[]): Promise<Det[]> {
  if (!owl) {
    const { pipeline } = await import('@huggingface/transformers');
    owl = await (pipeline as any)('zero-shot-object-detection', 'Xenova/owlvit-base-patch32', { dtype: 'q8' });
  }
  const W = 480, H = Math.round((480 * video.videoHeight) / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d')!.drawImage(video, 0, 0, W, H);
  const out: any[] = await owl(c.toDataURL('image/jpeg', 0.85), labels, { threshold: 0.12, percentage: true });
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((o) => !seen.has(o.label) && seen.add(o.label)).slice(0, 6).map((o) => {
    const b = o.box, px = b.xmax > 1.5;                       // boxes may come back in pixels
    const [x0, x1, y0, y1] = px ? [b.xmin / W, b.xmax / W, b.ymin / H, b.ymax / H] : [b.xmin, b.xmax, b.ymin, b.ymax];
    const area = (x1 - x0) * (y1 - y0), cx = (x0 + x1) / 2;
    return { label: o.label, cls: o.label, zone: cx < 0.33 ? 0 : cx > 0.67 ? 2 : 1,
      level: area > 0.25 ? 2 : area > 0.08 ? 1 : 0, area, box: [x0, y0, x1 - x0, y1 - y0] } as Det;
  });
}
