'use client';

import { useCallback, useEffect, useRef } from 'react';

/* ─────────────────────────── constants ─────────────────────────── */
const W = 390;
const H = 844;
const GRID = 20;

// Boy (top, moves left-right, drops hearts)
const BOY_W = 64;
const BOY_H = 90;
const BOY_Y = 30;          // top of character
const BOY_SPEED = 380;     // px/s

// Girl (bottom, player-controlled)
const GIRL_W = 64;
const GIRL_H = 90;
const GIRL_Y = H - 230;   // top of character
const GIRL_SPEED = 310;    // px/s

// Hearts
const HEART_R = 16;
const MAX_MISSED = 5;

// Difficulty (ramps over 20 s, then keeps climbing)
const SPAWN_START = 900;   // ms between drops
const SPAWN_MIN   = 180;
const FALL_START  = 250;   // px/s
const FALL_MAX    = 680;

/* ─────────────────────────── types ─────────────────────────── */
interface HeartObj { id: number; x: number; y: number; speed: number }

interface GS {
  boyX: number; boyTargetX: number; pendingHeart: boolean; nextTargetAt: number;
  girlX: number;
  hearts: HeartObj[]; heartId: number;
  score: number; missed: number;
  elapsed: number; lastTime: number;
  leftHeld: boolean; rightHeld: boolean;
  dragX: number | null;   // finger / mouse X in game coords — null when not dragging
  phase: 'start' | 'play' | 'over';
}

function makeState(): GS {
  return {
    boyX: W / 2, boyTargetX: W / 2, pendingHeart: false, nextTargetAt: 800,
    girlX: W / 2 - GIRL_W / 2,
    hearts: [], heartId: 0,
    score: 0, missed: 0,
    elapsed: 0, lastTime: 0,
    leftHeld: false, rightHeld: false,
    dragX: null,
    phase: 'start',
  };
}

/* ═══════════════════════ drawing helpers ═══════════════════════ */

// Canvas is transparent — the CSS grid background shows through.
// We only need to clear each frame so previous drawings don't linger.
function clearCanvas(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, W, H);
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i <= 360; i += 3) {
    const t = (i * Math.PI) / 180;
    const px = cx + r * Math.pow(Math.sin(t), 3);
    const py = cy - (r / 13) * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#e63946';
  ctx.shadowColor = '#e63946';
  ctx.shadowBlur = 10;
  heartPath(ctx, cx, cy, r);
  ctx.fill();
  ctx.restore();
}

/* ── placeholder boy ── */
function drawBoy(ctx: CanvasRenderingContext2D, boyImg: HTMLImageElement | null, cx: number, topY: number) {
  if (boyImg) {
    ctx.drawImage(boyImg, cx - BOY_W / 2, topY, BOY_W, BOY_H);
    return;
  }
  ctx.save();
  // legs
  ctx.fillStyle = '#2b2d42';
  ctx.fillRect(cx - 14, topY + 68, 11, 22);
  ctx.fillRect(cx + 3,  topY + 68, 11, 22);
  // body
  ctx.fillStyle = '#c1121f';
  ctx.beginPath();
  (ctx as any).roundRect(cx - 15, topY + 33, 30, 37, 5);
  ctx.fill();
  // arms
  ctx.fillStyle = '#c1121f';
  ctx.fillRect(cx - 25, topY + 35, 10, 26);
  ctx.fillRect(cx + 15, topY + 35, 10, 26);
  // hands
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(cx - 20, topY + 63, 7, 0, Math.PI * 2);
  ctx.arc(cx + 20, topY + 63, 7, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(cx, topY + 18, 17, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = '#3d1f00';
  ctx.beginPath();
  ctx.arc(cx, topY + 12, 17, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx - 17, topY + 6, 34, 8);
  // eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx - 6, topY + 17, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 6, topY + 17, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // blush
  ctx.fillStyle = 'rgba(255,100,100,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - 10, topY + 21, 5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 10, topY + 21, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // smile
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, topY + 20, 5, 0.15, Math.PI - 0.15);
  ctx.stroke();

  // label
  ctx.fillStyle = 'rgba(193,18,31,0.7)';
  ctx.font = '9px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('erkek karakter', cx, topY + 96);
  ctx.restore();
}

/* ── placeholder girl ── */
function drawGirl(ctx: CanvasRenderingContext2D, girlImg: HTMLImageElement | null, leftX: number, topY: number) {
  const cx = leftX + GIRL_W / 2;
  if (girlImg) {
    ctx.drawImage(girlImg, leftX, topY, GIRL_W, GIRL_H);
    return;
  }
  ctx.save();
  // legs
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(cx - 13, topY + 68, 10, 22);
  ctx.fillRect(cx + 3,  topY + 68, 10, 22);
  // shoes
  ctx.fillStyle = '#c1121f';
  ctx.fillRect(cx - 15, topY + 86, 13, 6);
  ctx.fillRect(cx + 2,  topY + 86, 13, 6);
  // dress
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(cx - 13, topY + 34);
  ctx.lineTo(cx + 13, topY + 34);
  ctx.lineTo(cx + 22, topY + 72);
  ctx.lineTo(cx - 22, topY + 72);
  ctx.closePath();
  ctx.fill();
  // body top
  ctx.fillStyle = '#e63946';
  (ctx as any).roundRect
    ? (() => { ctx.beginPath(); (ctx as any).roundRect(cx - 13, topY + 34, 26, 16, 4); ctx.fill(); })()
    : ctx.fillRect(cx - 13, topY + 34, 26, 16);
  // arms
  ctx.fillStyle = '#ffb347';
  ctx.fillRect(cx - 23, topY + 36, 10, 20);
  ctx.fillRect(cx + 13, topY + 36, 10, 20);
  // head
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.arc(cx, topY + 18, 16, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = '#1a0a00';
  ctx.beginPath();
  ctx.arc(cx, topY + 13, 16, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx - 16, topY + 9, 7, 24);
  ctx.fillRect(cx + 9,  topY + 9, 7, 24);
  // hair bow
  ctx.fillStyle = '#ff6b9d';
  ctx.beginPath();
  ctx.ellipse(cx - 5, topY + 5, 9, 5, -0.4, 0, Math.PI * 2);
  ctx.ellipse(cx + 5, topY + 5, 9, 5,  0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, topY + 5, 4, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(cx - 5, topY + 16, 2.5, 0, Math.PI * 2);
  ctx.arc(cx + 5, topY + 16, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // blush
  ctx.fillStyle = 'rgba(255,100,150,0.38)';
  ctx.beginPath();
  ctx.ellipse(cx - 10, topY + 21, 5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 10, topY + 21, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // smile
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, topY + 20, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(193,18,31,0.7)';
  ctx.font = '9px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('kız karakter', cx, topY + 96);
  ctx.restore();
}

function drawHUD(ctx: CanvasRenderingContext2D, score: number, missed: number) {
  // score badge
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  (ctx as any).roundRect(10, 8, 110, 34, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#c1121f';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`♥ ${score}`, 20, 31);

  // missed lives
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  (ctx as any).roundRect(W - 128, 8, 118, 34, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (let i = 0; i < MAX_MISSED; i++) {
    const hcx = W - 120 + i * 22;
    const hcy = 26;
    drawHeart(ctx, hcx, hcy, 7, i < missed ? 1 : 0.22);
  }
  ctx.restore();
}

function drawHint(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = 'rgba(193,18,31,0.30)';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('sürükle ♥', W / 2, H - 16);
  ctx.restore();
}

function drawStartScreen(ctx: CanvasRenderingContext2D) {
  clearCanvas(ctx);

  // decorative hearts
  const positions = [
    [60, 120, 18], [330, 90, 14], [180, 200, 12],
    [50, 380, 10], [340, 320, 16], [290, 500, 11],
    [70, 560, 13], [310, 680, 10],
  ];
  positions.forEach(([x, y, r]) => drawHeart(ctx, x, y, r, 0.18));

  // card
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(230,57,70,0.18)';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  (ctx as any).roundRect(30, H / 2 - 210, W - 60, 400, 22);
  ctx.fill();
  ctx.shadowBlur = 0;

  // big heart row
  for (let i = -2; i <= 2; i++) drawHeart(ctx, W / 2 + i * 50, H / 2 - 178, 16);

  ctx.fillStyle = '#c1121f';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px Arial';
  ctx.fillText('İyi ki Doğdun! ♥', W / 2, H / 2 - 120);

  ctx.fillStyle = '#888';
  ctx.font = '17px Arial';
  const lines = [
    'Şimdi sana kalp atcam',
    'Hepsini tut tamammi',
    'Seni cok seviyom ♥',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 - 72 + i * 28));

  // start button
  const bx = W / 2 - 100, by = H / 2 + 40, bw = 200, bh = 56;
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  (ctx as any).roundRect(bx, by, bw, bh, 28);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('Başla ♥', W / 2, by + bh / 2 + 8);

  ctx.restore();
}

function drawGameOver(ctx: CanvasRenderingContext2D, score: number) {
  clearCanvas(ctx);
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.90)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.shadowColor = 'rgba(230,57,70,0.22)';
  ctx.shadowBlur = 32;
  ctx.beginPath();
  (ctx as any).roundRect(30, H / 2 - 200, W - 60, 380, 22);
  ctx.fill();
  ctx.shadowBlur = 0;

  for (let i = -2; i <= 2; i++) drawHeart(ctx, W / 2 + i * 50, H / 2 - 168, 16);

  ctx.fillStyle = '#c1121f';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px Arial';
  ctx.fillText('DGKO! ♥', W / 2, H / 2 - 108);

  ctx.fillStyle = '#555';
  ctx.font = '22px Arial';
  ctx.fillText(`Yakalanan kalp: ${score}`, W / 2, H / 2 - 58);

  ctx.fillStyle = '#aaa';
  ctx.font = '16px Arial';
  ctx.fillText(score >= 60 ? 'mmmmmuah' : score >= 30 ? 'evlilik düşünür müsünüz hanfendi' : 'ilysm <333', W / 2, H / 2 - 20);

  // restart button
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  (ctx as any).roundRect(W / 2 - 100, H / 2 + 30, 200, 56, 28);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('Tekrar Oyna ♥', W / 2, H / 2 + 66);

  ctx.restore();
}

/* ═══════════════════════ main component ═══════════════════════ */

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef<GS>(makeState());
  const rafRef    = useRef(0);
  const boyImgRef  = useRef<HTMLImageElement | null>(null);
  const girlImgRef = useRef<HTMLImageElement | null>(null);

  /* load custom character images if they exist */
  useEffect(() => {
    const tryLoad = (src: string, ref: React.MutableRefObject<HTMLImageElement | null>) => {
      const img = new Image();
      img.onload = () => { ref.current = img; };
      img.src = src;
    };
    tryLoad('/boy.png',  boyImgRef);
    tryLoad('/girl.png', girlImgRef);
  }, []);

  /* hit-test the big centre button (start / restart) */
  function hitCentreButton(cx: number, cy: number): boolean {
    const bx = W / 2 - 100, by = (H / 2 + 40), bw = 200, bh = 56;
    return cx >= bx && cx <= bx + bw && cy >= by && cy <= by + bh;
  }

  /* canvas → game coords */
  function canvasCoords(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    return {
      gx: (clientX - r.left) * (W / r.width),
      gy: (clientY - r.top)  * (H / r.height),
    };
  }

  /* ─── game loop ─── */
  const loop = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const s = stateRef.current;

    /* start / over screens are static — just draw & wait for input */
    if (s.phase === 'start') { drawStartScreen(ctx); rafRef.current = requestAnimationFrame(loop); return; }
    if (s.phase === 'over')  { drawGameOver(ctx, s.score); rafRef.current = requestAnimationFrame(loop); return; }

    /* ── delta time ── */
    if (s.lastTime === 0) s.lastTime = ts;
    const dt = Math.min((ts - s.lastTime) / 1000, 0.05);
    s.lastTime = ts;
    s.elapsed += dt;

    /* ── difficulty: quadratic ramp over 20 s, then keeps climbing ── */
    const t = Math.min(s.elapsed / 20, 1);
    const curve = t * t;                    // ease-in² → fast early growth
    const spawnInterval = SPAWN_START - (SPAWN_START - SPAWN_MIN) * curve;
    const fallSpeed     = FALL_START  + (FALL_MAX  - FALL_START)  * curve
                        + s.elapsed * 3;  // +3 px/s every second after 20 s

    /* ── boy movement ── */
    const boyDiff = s.boyTargetX - s.boyX;
    const boyStep = BOY_SPEED * dt;
    s.boyX += Math.abs(boyDiff) < boyStep ? boyDiff : Math.sign(boyDiff) * boyStep;

    /* ── spawn logic ── */
    if (ts >= s.nextTargetAt) {
      const margin = BOY_W / 2 + 12;
      s.boyTargetX  = margin + Math.random() * (W - margin * 2);
      s.pendingHeart = true;
      s.nextTargetAt = ts + spawnInterval;
    }
    if (s.pendingHeart && Math.abs(s.boyX - s.boyTargetX) < 6) {
      s.hearts.push({ id: s.heartId++, x: s.boyX, y: BOY_Y + BOY_H + 4, speed: fallSpeed });
      s.pendingHeart = false;
    }

    /* ── girl movement ── */
    if (s.dragX !== null) {
      // finger / mouse drag: snap center of character to pointer X
      s.girlX = Math.max(0, Math.min(W - GIRL_W, s.dragX - GIRL_W / 2));
    } else {
      // keyboard fallback (desktop arrow / A-D keys)
      if (s.leftHeld)  s.girlX = Math.max(0, s.girlX - GIRL_SPEED * dt);
      if (s.rightHeld) s.girlX = Math.min(W - GIRL_W, s.girlX + GIRL_SPEED * dt);
    }

    /* ── update / collide hearts ── */
    s.hearts = s.hearts.filter(h => {
      h.y += h.speed * dt;

      const gl = s.girlX, gr = s.girlX + GIRL_W;
      const gt = GIRL_Y,  gb = GIRL_Y + GIRL_H * 0.55;
      const hl = h.x - HEART_R, hr = h.x + HEART_R;
      const ht = h.y - HEART_R, hb = h.y + HEART_R;

      if (hr > gl && hl < gr && hb > gt && ht < gb) { s.score++; return false; }
      if (h.y > GIRL_Y + GIRL_H + HEART_R) {
        s.missed++;
        if (s.missed >= MAX_MISSED) s.phase = 'over';
        return false;
      }
      return true;
    });

    /* ── render ── */
    clearCanvas(ctx);
    drawBoy(ctx, boyImgRef.current, s.boyX, BOY_Y);
    drawGirl(ctx, girlImgRef.current, s.girlX, GIRL_Y);
    s.hearts.forEach(h => drawHeart(ctx, h.x, h.y, HEART_R));
    drawHUD(ctx, s.score, s.missed);
    drawHint(ctx);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [loop]);

  /* ─── keyboard ─── */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a') stateRef.current.leftHeld  = true;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.rightHeld = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a') stateRef.current.leftHeld  = false;
      if (e.key === 'ArrowRight' || e.key === 'd') stateRef.current.rightHeld = false;
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, []);

  /* ─── mouse drag (desktop) ─── */
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { gx, gy } = canvasCoords(e.currentTarget, e.clientX, e.clientY);
    const s = stateRef.current;
    if (s.phase !== 'play') {
      if (hitCentreButton(gx, gy)) { stateRef.current = { ...makeState(), phase: 'play', lastTime: 0 }; }
      return;
    }
    s.dragX = gx;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current;
    if (s.phase !== 'play' || s.dragX === null) return;
    const { gx } = canvasCoords(e.currentTarget, e.clientX, e.clientY);
    s.dragX = gx;
  }, []);

  const onMouseUp = useCallback(() => {
    stateRef.current.dragX = null;
  }, []);

  /* ─── touch drag (mobile) ─── */
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const s = stateRef.current;
    const { gx, gy } = canvasCoords(canvas, e.touches[0].clientX, e.touches[0].clientY);
    if (s.phase !== 'play') {
      if (hitCentreButton(gx, gy)) { stateRef.current = { ...makeState(), phase: 'play', lastTime: 0 }; }
      return;
    }
    s.dragX = gx;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const s = stateRef.current;
    if (s.phase !== 'play') return;
    const canvas = canvasRef.current!;
    const { gx } = canvasCoords(canvas, e.touches[0].clientX, e.touches[0].clientY);
    s.dragX = gx;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stateRef.current.dragX = null;
  }, []);

  /* ─── render wrapper ─── */
  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      minHeight:       '100dvh',
      /* CSS grid paper — fills the whole screen behind the canvas */
      backgroundColor: '#fff',
      backgroundImage: [
        'linear-gradient(rgba(255,214,214,0.75) 0.8px, transparent 0.8px)',
        'linear-gradient(90deg, rgba(255,214,214,0.75) 0.8px, transparent 0.8px)',
      ].join(', '),
      backgroundSize: '20px 20px',
    }}>
      {/* canvas is transparent — CSS grid shows through */}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          display:     'block',
          height:      '100dvh',
          width:       'auto',
          touchAction: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
    </div>
  );
}
