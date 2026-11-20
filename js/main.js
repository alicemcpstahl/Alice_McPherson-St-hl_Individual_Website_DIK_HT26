// =========================================================
// Austin Franklin :: main.js
//
// One PixiJS canvas sits behind the page and draws two things:
//   1. a field of dots that the pointer pushes and clicks ripple through
//   2. a generative image inside every project tile
//
// Structure:
//   setup -> colours -> input -> dot field -> motifs -> frame loop
// =========================================================

async function start() {

  // ---------- Setup ----------

  const app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,           // transparent, the page colour shows through
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.getElementById("stage").appendChild(app.canvas);

  // Two layers: drawn in this order, so tiles cover the dots
  const fieldLayer = new PIXI.Graphics();
  const artLayer = new PIXI.Graphics();
  app.stage.addChild(fieldLayer, artLayer);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;


  // ---------- Colours ----------
  // Read from the CSS variables so the canvas follows light and dark mode.

  const colours = {};

  function readColours() {
    const css = getComputedStyle(document.documentElement);
    for (const name of ["ink", "muted", "accent", "tile"]) {
      colours[name] = new PIXI.Color(css.getPropertyValue(`--${name}`).trim()).toNumber();
    }
  }

  readColours();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColours);


  // ---------- Input ----------

  const pointer = { x: -9999, y: -9999 };
  const ripples = [];   // every click adds one: { x, y, born }

  window.addEventListener("pointermove", (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });

  window.addEventListener("pointerdown", (e) => {
    ripples.push({ x: e.clientX, y: e.clientY, born: performance.now() });
  });

  // Each tile keeps a hover value that eases between 0 and 1
  const tiles = [...document.querySelectorAll(".tile")].map((el) => {
    const tile = {
      box: el.querySelector(".art"),
      motif: el.querySelector(".art").dataset.motif,
      hover: 0,
      target: 0,
    };
    el.addEventListener("pointerenter", () => { tile.target = 1; });
    el.addEventListener("pointerleave", () => { tile.target = 0; });
    return tile;
  });



  // ---------- Dot field ----------
  // Every dot has a home position and a current position.
  // Forces push it away; a spring pulls it home again.

  // const SPACING = 28;
  // const PUSH_RADIUS = 150;
  // const RIPPLE_SPEED = 500;     // pixels per second
  // const RIPPLE_LIFE = 2000;     // milliseconds

  // let dots = [];

  // function buildField() {
  //   dots = [];
  //   for (let x = SPACING / 2; x < window.innerWidth; x += SPACING) {
  //     for (let y = SPACING / 2; y < window.innerHeight; y += SPACING) {
  //       dots.push({ homeX: x, homeY: y, x, y, vx: 0, vy: 0 });
  //     }
  //   }
  // }

  // // Push a dot away from a point, stronger when closer
  // function pushAway(dot, fromX, fromY, radius, strength) {
  //   const dx = dot.x - fromX;
  //   const dy = dot.y - fromY;
  //   const distance = Math.hypot(dx, dy) || 1;
  //   if (distance < radius) {
  //     const force = (1 - distance / radius) * strength;
  //     dot.vx += (dx / distance) * force;
  //     dot.vy += (dy / distance) * force;
  //   }
  // }

  // function updateField(now) {
  //   // Forget ripples that have faded out
  //   while (ripples.length && now - ripples[0].born > RIPPLE_LIFE) ripples.shift();

  //   for (const dot of dots) {
  //     pushAway(dot, pointer.x, pointer.y, PUSH_RADIUS, 1.2);

  //     // A ripple is a ring that grows; only dots near the ring get pushed
  //     for (const ripple of ripples) {
  //       const age = now - ripple.born;
  //       const ringRadius = (age / 1000) * RIPPLE_SPEED;
  //       const fromRing = Math.abs(Math.hypot(dot.x - ripple.x, dot.y - ripple.y) - ringRadius);
  //       if (fromRing < 20) pushAway(dot, ripple.x, ripple.y, ringRadius + 20, 3 * (1 - age / RIPPLE_LIFE));
  //     }

  //     // Spring home, with friction so it settles
  //     dot.vx = (dot.vx + (dot.homeX - dot.x) * 0.06) * 0.82;
  //     dot.vy = (dot.vy + (dot.homeY - dot.y) * 0.06) * 0.82;
  //     dot.x += dot.vx;
  //     dot.y += dot.vy;
  //   }
  // }

  // function drawField() {
  //   fieldLayer.clear();

  //   // Resting dots in grey, moving dots in the accent colour
  //   const moving = [];
  //   for (const dot of dots) {
  //     const offset = Math.abs(dot.x - dot.homeX) + Math.abs(dot.y - dot.homeY);
  //     if (offset > 3) moving.push(dot);
  //     else fieldLayer.rect(dot.x - 1, dot.y - 1, 2, 2);
  //   }
  //   fieldLayer.fill({ color: colours.muted, alpha: 0.4 });

  //   for (const dot of moving) fieldLayer.rect(dot.x - 1.5, dot.y - 1.5, 3, 3);
  //   fieldLayer.fill(colours.accent);
  // }

  // buildField();
  // window.addEventListener("resize", buildField);

  // ---------- Bubble field (BEANS style) ----------
  // Same bubbles as the BEANS page: each one orbits on its own sin/cos path.
  // The pointer pushes bubbles away, and every click works like turning a beat on:
  // more bubbles, bigger, faster, fading out over RIPPLE_LIFE.

  const palette = [0xff70ba, 0x8a79b7, 0x1989d8, 0x8ec55e, 0xffde59, 0xc61f72, 0xffad85];

  const START_BUBBLES = 35;
  const BUBBLES_PER_BEAT = 2;
  const MAX_BUBBLES = 50;

  const PUSH_RADIUS = 150;
  const RIPPLE_LIFE = 2000;     // milliseconds

  let angle = 0;
  let speed = 1;
  let scaleFactor = 1;
  let beats = 0;                // smoothed "number of active beats"

  // Each bubble keeps an offset from its orbit position (for the pointer push)
  const bubbles = Array.from({ length: MAX_BUBBLES }, () => ({
    offX: 0, offY: 0, vx: 0, vy: 0,
    x: 0, y: 0, d: 0,           // current position and diameter
  }));
  let bubbleCount = START_BUBBLES;

  function updateField(now) {
    // Forget old clicks
    while (ripples.length && now - ripples[0].born > RIPPLE_LIFE) ripples.shift();

    // Every live click counts as an active beat
    const n = Math.min(ripples.length, 10);
    beats += (n - beats) * 0.1;

    speed += ((1 + beats * 0.15) - speed) * 0.1;
    scaleFactor += ((1 + beats * 0.12) - scaleFactor) * 0.1;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const centerX = w / 2;
    const centerY = h / 2;
    const spaceX = Math.min(w * 0.35, h * 0.65);
    const spaceY = h * 0.32;

    bubbleCount = Math.min(Math.round(START_BUBBLES + beats * BUBBLES_PER_BEAT), MAX_BUBBLES);

    for (let i = 0; i < bubbleCount; i++) {
      const b = bubbles[i];

      // Orbit position
      const homeX = centerX + Math.sin(angle * (0.5 + i * 0.03) + i * 2.4) * spaceX;
      const homeY = centerY + Math.cos(angle * (0.4 + i * 0.025) + i * 3.1) * spaceY;

      // Pointer pushes the bubble away from the cursor
      const dx = homeX + b.offX - pointer.x;
      const dy = homeY + b.offY - pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < PUSH_RADIUS) {
        const force = (1 - dist / PUSH_RADIUS) * 3;
        b.vx += (dx / dist) * force;
        b.vy += (dy / dist) * force;
      }

      // Spring back to the orbit, with friction
      b.vx = (b.vx - b.offX * 0.06) * 0.85;
      b.vy = (b.vy - b.offY * 0.06) * 0.85;
      b.offX += b.vx;
      b.offY += b.vy;

      b.x = homeX + b.offX;
      b.y = homeY + b.offY;

      // Sizes, same recipe as BEANS
      let baseSize;
      if (i % 8 === 0) baseSize = 90;
      else if (i % 4 === 0) baseSize = 55;
      else baseSize = 18 + (i % 5) * 13;

      const pulse = Math.sin(angle * 2 + i) * 8;
      const extraGrowth = (i % 4 === 0) ? beats * 12 : beats * 3;
      b.d = (baseSize + pulse + extraGrowth) * scaleFactor;
    }

    angle += 0.006 * speed;
  }

  function drawField() {
    fieldLayer.clear();

    for (let i = 0; i < bubbleCount; i++) {
      const b = bubbles[i];
      const color = palette[i % palette.length];

      if (i % 3 === 0) {
        // Every third bubble is outline only
        fieldLayer.circle(b.x, b.y, b.d / 2).stroke({ width: 3, color });
      } else {
        fieldLayer.circle(b.x, b.y, b.d / 2).fill({ color, alpha: 150 / 255 });
      }
    }
  }

  // ---------- Motifs ----------
  // One drawing function per project. They all take the same arguments:
  //   g      the Graphics layer to draw into
  //   x, y   top-left corner of the tile on screen
  //   w, h   tile size
  //   t      time in seconds
  //   hover  0 (resting) to 1 (pointer on the tile)

  // A small seeded random, so the scatter looks the same on every visit
  function seededRandom(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
  }

  const random = seededRandom(7);
  const scatterPoints = Array.from({ length: 48 }, () => ({ x: random(), y: random(), phase: random() * 6.28 }));

  const motifs = {
    // Bloom: petals that open on hover
    bloom(g, x, y, w, h, t, hover) {
      const cx = x + w / 2, cy = y + h / 2;
      const petals = 14;
      const open = 0.35 + 0.15 * Math.sin(t * 0.8) + hover * 0.5;
      const length = Math.min(w, h) * 0.4 * open;

      for (let i = 0; i < petals; i++) {
        const angle = (i / petals) * Math.PI * 2 + t * 0.1;
        const side = 0.18;
        g.poly([
          cx, cy,
          cx + Math.cos(angle - side) * length * 0.6, cy + Math.sin(angle - side) * length * 0.6,
          cx + Math.cos(angle) * length, cy + Math.sin(angle) * length,
          cx + Math.cos(angle + side) * length * 0.6, cy + Math.sin(angle + side) * length * 0.6,
        ]);
      }
      g.fill({ color: colours.accent, alpha: hover * 0.25 });
      g.stroke({ width: 1.25, color: colours.ink });
    },

    // Four Idols: four figures built from stacked bars; hover makes them stand still
    idols(g, x, y, w, h, t, hover) {
      const columns = 4, rows = 12;
      const columnWidth = (w * 0.8) / columns;
      const rowHeight = (h * 0.7) / rows;
      const sway = 1 - hover;

      for (let c = 0; c < columns; c++) {
        const centre = x + w * 0.1 + columnWidth * (c + 0.5);
        for (let r = 0; r < rows; r++) {
          const barWidth = columnWidth * (0.25 + 0.5 * Math.abs(Math.sin(r * 0.7 + c * 1.3)));
          const shift = Math.sin(t * 1.2 + r * 0.4 + c) * columnWidth * 0.15 * sway;
          g.rect(centre - barWidth / 2 + shift, y + h * 0.15 + r * rowHeight, barWidth, rowHeight * 0.6);
        }
      }
      g.fill(hover > 0.5 ? colours.accent : colours.ink);
    },

    // The Unfinder: drifting points that find each other on hover
    scatter(g, x, y, w, h, t, hover) {
      const points = scatterPoints.map((p) => ({
        x: x + w * (0.1 + 0.8 * p.x) + Math.sin(t * 0.7 + p.phase) * 10,
        y: y + h * (0.1 + 0.8 * p.y) + Math.cos(t * 0.5 + p.phase) * 10,
      }));

      if (hover > 0.01) {
        for (let i = 0; i < points.length; i++) {
          for (let j = i + 1; j < points.length; j++) {
            if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < w * 0.16) {
              g.moveTo(points[i].x, points[i].y).lineTo(points[j].x, points[j].y);
            }
          }
        }
        g.stroke({ width: 1, color: colours.accent, alpha: hover * 0.8 });
      }

      for (const p of points) g.circle(p.x, p.y, 2.5);
      g.fill(colours.ink);
    },

    // Bounded: cells that grow and shrink inside a fixed frame
    grid(g, x, y, w, h, t, hover) {
      const columns = 8, rows = 6;
      const cellW = (w * 0.8) / columns, cellH = (h * 0.8) / rows;

      for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) {
          const size = 0.5 + 0.5 * Math.sin(t * (1 + hover * 2) + i * 0.6 + j * 0.9);
          const cx = x + w * 0.1 + cellW * (i + 0.5);
          const cy = y + h * 0.1 + cellH * (j + 0.5);
          g.rect(cx - (cellW * size) / 2.4, cy - (cellH * size) / 2.4, (cellW * size) / 1.2, (cellH * size) / 1.2);
        }
      }
      g.fill(hover > 0.5 ? colours.accent : colours.ink);
      g.rect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8).stroke({ width: 1.5, color: colours.ink });
    },

    // Lightmotif: rings spreading out, like a note going into a microphone
    rings(g, x, y, w, h, t, hover) {
      const cx = x + w / 2, cy = y + h / 2;
      const maxRadius = Math.min(w, h) * 0.45;
      const count = 7;

      for (let k = 0; k < count; k++) {
        const radius = (t * (18 + hover * 40) + (k * maxRadius) / count) % maxRadius;
        g.circle(cx, cy, radius).stroke({
          width: 1.5,
          color: hover > 0.5 ? colours.accent : colours.ink,
          alpha: 1 - radius / maxRadius,
        });
      }
      g.circle(cx, cy, 5 + hover * 4).fill(colours.ink);
    },

    // xan / pool: nodes and the links between them
    links(g, x, y, w, h, t, hover) {
      const count = 7;
      const cx = x + w / 2, cy = y + h / 2;
      const nodes = [];

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + t * 0.15;
        const radius = Math.min(w, h) * (0.28 + 0.08 * Math.sin(t + i * 2));
        nodes.push({ x: cx + Math.cos(angle) * radius * 1.3, y: cy + Math.sin(angle) * radius });
      }

      // Every node links to two others, so nothing is left on its own
      for (let i = 0; i < count; i++) {
        for (const step of [2, 3]) {
          const other = nodes[(i + step) % count];
          g.moveTo(nodes[i].x, nodes[i].y).lineTo(other.x, other.y);
        }
      }
      g.stroke({ width: 1.25, color: hover > 0.5 ? colours.accent : colours.ink, alpha: 0.6 + hover * 0.4 });

      for (const node of nodes) g.rect(node.x - 5, node.y - 5, 10, 10);
      g.fill(colours.ink);
    },
  };

  // function drawTiles(time) {
  //   artLayer.clear();

  //   for (const tile of tiles) {
  //     tile.hover += (tile.target - tile.hover) * 0.1;

  //     // Where is the tile on screen right now? Skip it if scrolled away.
  //     const r = tile.box.getBoundingClientRect();
  //     if (r.bottom < 0 || r.top > window.innerHeight) continue;

  //     artLayer.rect(r.left, r.top, r.width, r.height).fill(colours.tile);
  //     motifs[tile.motif](artLayer, r.left, r.top, r.width, r.height, time, tile.hover);
  //   }
  // }

  function drawTiles(time) {
    artLayer.clear();

    for (const tile of tiles) {
      // Bild eller video i rutan: rita inget på canvasen
      if (tile.box.querySelector("img, video")) continue;

      tile.hover += (tile.target - tile.hover) * 0.1;

      const r = tile.box.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) continue;

      artLayer.rect(r.left, r.top, r.width, r.height).fill(colours.tile);
      motifs[tile.motif](artLayer, r.left, r.top, r.width, r.height, time, tile.hover);
    }
  }

  // ---------- Lightbox ----------
  // Klick på en bild eller video i en ruta öppnar den stor.
  // Esc, klick utanför eller krysset stänger.

  const lightbox = document.createElement("dialog");
  lightbox.className = "lightbox";
  document.body.appendChild(lightbox);

  function openLightbox(media) {
    lightbox.innerHTML = "";

    const big = media.cloneNode(true);
    if (big.tagName === "VIDEO") {
      big.controls = true;
      big.muted = false;     // ljud är ok här, eftersom användaren klickade
      big.autoplay = true;
      big.loop = true;
    }

    const close = document.createElement("button");
    close.className = "lightbox-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", () => lightbox.close());

    lightbox.append(big, close);
    lightbox.showModal();
  }

  // Klick på den mörka bakgrunden stänger
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.close();
  });

  // Töm när den stängs, så att videon slutar spelas
  lightbox.addEventListener("close", () => { lightbox.innerHTML = ""; });

  for (const el of document.querySelectorAll(".tile")) {
    const media = el.querySelector(".art img, .art video");
    if (media) media.addEventListener("click", () => openLightbox(media));
  }

  // ---------- Frame loop ----------

  let time = 0;

  app.ticker.add((ticker) => {
    const anyHover = tiles.some((tile) => tile.target > 0);
    if (!reduceMotion || anyHover) time += ticker.deltaMS / 1000;

    const now = performance.now();
    updateField(now);
    drawField();
    drawTiles(time);
  });

}

start();
