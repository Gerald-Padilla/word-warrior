// Draw battle board: plays strokes onto a canvas. Strokes are in board units (Sketch.W x Sketch.H, 4:3);
// the canvas is redrawn at its size on screen, so lines stay sharp on a phone and on the big screen.
// A stroke is { s: id, c: color, w: size, p: [x, y, x, y, ...] }; it can arrive in pieces as it's drawn.
(function () {
  const W = 1000;
  const H = 750;
  // Index 1 is the paper's own color: the eraser.
  const COLORS = ['#1b1426', '#ffffff', '#8a8a99', '#e8371c', '#ff8c1a', '#ffd23f', '#3fae3f', '#2f6fe0', '#8e44c9', '#8b5a2b', '#ff8fb8', '#f2c49b'];
  const SIZES = [5, 12, 28];
  const ERASER = 1;

  class Sketch {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.strokes = [];
      if (window.ResizeObserver) new ResizeObserver(() => this.fit()).observe(canvas);
      window.addEventListener('resize', () => this.fit());
      this.fit();
    }

    fit() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (w === this.canvas.width && h === this.canvas.height) return;
      this.canvas.width = w;
      this.canvas.height = h;
      this.redraw();
    }

    redraw() {
      const { ctx, canvas } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = COLORS[ERASER];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const st of this.strokes) this.paint(st, 0);
    }

    set(list) {
      this.strokes = (list || []).map((st) => ({ s: st.s, c: st.c, w: st.w, p: st.p.slice() }));
      this.redraw();
    }

    // A new stroke, or more of the last one (same id): only the new part is painted.
    add({ s, c, w, p }) {
      const last = this.strokes[this.strokes.length - 1];
      if (last && last.s === s) {
        const from = last.p.length / 2 - 1;
        last.p.push(...p);
        this.paint(last, from);
      } else {
        const st = { s, c, w, p: p.slice() };
        this.strokes.push(st);
        this.paint(st, 0);
      }
    }

    undo() {
      this.strokes.pop();
      this.redraw();
    }

    clear() {
      this.strokes = [];
      this.redraw();
    }

    // Paint a stroke from point `from` on (a single point is a dot).
    paint(st, from) {
      const { ctx } = this;
      const k = this.canvas.width / W;
      const p = st.p;
      const n = p.length / 2;
      if (!n) return;
      ctx.strokeStyle = COLORS[st.c] || COLORS[0];
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = (SIZES[st.w] || SIZES[1]) * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (n === 1) {
        ctx.beginPath();
        ctx.arc(p[0] * k, p[1] * k, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      const i0 = Math.max(0, from);
      ctx.beginPath();
      ctx.moveTo(p[i0 * 2] * k, p[i0 * 2 + 1] * k);
      for (let i = i0 + 1; i < n; i++) ctx.lineTo(p[i * 2] * k, p[i * 2 + 1] * k);
      ctx.stroke();
    }
  }

  Object.assign(Sketch, { W, H, COLORS, SIZES, ERASER });
  window.Sketch = Sketch;
})();
