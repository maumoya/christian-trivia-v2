// Canvas drawing for the overworld. God is shown only as light: gates and quest spots glow.
import { TILE, AREA_W, THEMES, DOOR_ROWS, tileAt, hash } from './world.js';
import { pic } from './pics.js';

function deco(ctx, kind, x, y, accent, t) {
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.55;
  switch (kind) {
    case 'wave': ctx.fillRect(x + 3, y + 8 + Math.sin(t * 2 + x) * 1.5, 8, 1.5); break;
    case 'cloud': ctx.beginPath(); ctx.arc(x + 6, y + 8, 3, 0, 7); ctx.arc(x + 10, y + 8, 4, 0, 7); ctx.fill(); break;
    case 'sprout': ctx.fillRect(x + 7, y + 7, 2, 5); ctx.fillRect(x + 5, y + 7, 6, 2); break;
    case 'star': ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 3 + x * 0.3 + y); ctx.fillRect(x + 7, y + 7, 2, 2); break;
    case 'shell': ctx.fillStyle = '#4fa3c7'; ctx.fillRect(x + 2, y + 9, 12, 2); break;
    case 'grass': ctx.fillRect(x + 4, y + 9, 1.5, 4); ctx.fillRect(x + 8, y + 8, 1.5, 5); break;
    case 'fruit': ctx.beginPath(); ctx.arc(x + 8, y + 8, 2.5, 0, 7); ctx.fill(); break;
    case 'sun': ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(x + 8, y + 8, 3, 0, 7); ctx.fill(); break;
    default: break;
  }
  ctx.globalAlpha = 1;
}

function glow(ctx, cx, cy, r, alpha) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255,244,200,${alpha})`);
  g.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 7);
  ctx.fill();
}

function emoji(ctx, ch, x, y, size) {
  ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}

function child(ctx, x, y, tunic, step) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(x, y + 7, 5, 2, 0, 0, 7); ctx.fill();
  const bob = Math.sin(step) * 0.8;
  ctx.fillStyle = tunic;
  ctx.fillRect(x - 4, y - 2 + bob, 8, 8);
  ctx.fillStyle = '#6b4a2e';
  ctx.fillRect(x - 3, y + 6, 2, 2); ctx.fillRect(x + 1, y + 6, 2, 2);
  ctx.fillStyle = '#e8b98f';
  ctx.beginPath(); ctx.arc(x, y - 5 + bob, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a3222';
  ctx.fillRect(x - 4, y - 9 + bob, 8, 3);
}

export function drawWorld(ctx, view, world, game, actors, t) {
  const { w: vw, h: vh, scale, camX, camY } = view;
  const st = game.state();
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(world.w - 1, Math.ceil((camX + vw / scale) / TILE));
  const y1 = Math.min(world.h - 1, Math.ceil((camY + vh / scale) / TILE));

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const area = Math.min(THEMES.length - 1, Math.floor(tx / AREA_W));
      const th = THEMES[area];
      const tile = tileAt(world, tx, ty);
      const px = tx * TILE, py = ty * TILE;
      if (tile.kind === 'edge') {
        ctx.fillStyle = th.ground;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(20,24,40,0.45)';
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      if (tile.kind === 'gate') {
        ctx.fillStyle = THEMES[Math.min(THEMES.length - 1, area)].ground;
        ctx.fillRect(px, py, TILE, TILE);
        if (!game.isUnlocked(tile.sceneId)) {
          const a = 0.55 + 0.25 * Math.sin(t * 3 + ty);
          ctx.fillStyle = `rgba(255,236,160,${a})`;
          ctx.fillRect(px + 2, py, TILE - 4, TILE);
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(px + 7, py, 2, TILE);
        }
        continue;
      }
      ctx.fillStyle = th.ground;
      ctx.fillRect(px, py, TILE, TILE);
      if (hash(tx, ty) > 0.78) deco(ctx, th.deco, px, py, th.accent, t);
    }
  }
  // Area one starts dark until light is made.
  if (!st.questsDone.includes('q-s1')) {
    ctx.fillStyle = 'rgba(5,8,20,0.55)';
    ctx.fillRect(0, 0, AREA_W * TILE, world.h * TILE);
  }
  for (const g of world.gates) {
    if (!game.isUnlocked(g.sceneId)) glow(ctx, g.tx * TILE + 8, DOOR_ROWS[0] * TILE + 16, 26, 0.35);
  }

  for (const s of world.spots) {
    const cx = s.tx * TILE + 8, cy = s.ty * TILE + 8;
    const done = game.isDone(s.questId);
    const open = game.isUnlocked(s.sceneId);
    if (!open) continue;
    const pulse = done ? 0.18 : 0.5 + 0.25 * Math.sin(t * 2.5 + s.tx);
    glow(ctx, cx, cy, done ? 10 : 16, pulse);
    ctx.fillStyle = done ? 'rgba(255,255,255,0.5)' : '#fff8dc';
    ctx.beginPath(); ctx.arc(cx, cy, done ? 2 : 3.5, 0, 7); ctx.fill();
  }

  for (const p of world.pickups) {
    const have = p.kind === 'item' ? st.itemsFound.includes(p.id) : st.piecesFound.includes(p.id);
    if (have) continue;
    const cx = p.tx * TILE + 8, cy = p.ty * TILE + 8 + Math.sin(t * 2 + p.tx) * 1.5;
    if (p.kind === 'piece') glow(ctx, cx, cy, 9, 0.4);
    emoji(ctx, pic(p.kind === 'piece' ? 'piece' : p.id), cx, cy, 11);
  }

  if (st.phase === 'find') {
    const got = game.foundSoFar(st.questId);
    for (const f of world.finds.filter((x) => x.questId === st.questId && !got.includes(x.id))) {
      const cx = f.tx * TILE + 8, cy = f.ty * TILE + 8;
      glow(ctx, cx, cy, 12, 0.45 + 0.2 * Math.sin(t * 4));
      emoji(ctx, pic(f.id), cx, cy, 12);
    }
  }

  for (const a of actors) {
    if (a.kind === 'companion') emoji(ctx, pic(a.id), a.x, a.y, 11);
    else child(ctx, a.x, a.y, a.tunic, a.step);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
