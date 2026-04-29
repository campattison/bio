// Drifting-node background. Pure canvas, no deps.
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let w = 0, h = 0, dpr = 1, accent = '#8a4a2a';

  function resolveAccent() {
    const computed = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (computed) accent = computed;
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const num = parseInt(hex, 16);
    return [num >> 16 & 255, num >> 8 & 255, num & 255];
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Spawn ~1 node per 14000 px²; cap at 120, floor at 30.
  const targetCount = () => Math.max(30, Math.min(120, Math.round((w * h) / 14000)));
  let nodes = [];

  function seed() {
    const n = targetCount();
    nodes = [];
    for (let i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1 + Math.random() * 1.6
      });
    }
  }

  let mouseX = -9999, mouseY = -9999;
  window.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouseX = -9999;
    mouseY = -9999;
  });

  function step() {
    resolveAccent();
    const [r, g, b] = hexToRgb(accent);
    ctx.clearRect(0, 0, w, h);

    // Update positions
    for (const p of nodes) {
      p.x += p.vx;
      p.y += p.vy;
      // Wrap edges
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      // Subtle attraction toward cursor when near
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 22500) {
        const f = (1 - d2 / 22500) * 0.04;
        p.vx += (dx / Math.sqrt(d2 || 1)) * f;
        p.vy += (dy / Math.sqrt(d2 || 1)) * f;
      }
      // Damping
      p.vx *= 0.992;
      p.vy *= 0.992;
      // Floor velocity so nodes never fully stop
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < 0.05) {
        p.vx += (Math.random() - 0.5) * 0.04;
        p.vy += (Math.random() - 0.5) * 0.04;
      }
    }

    // Draw connection lines (O(n^2), fine for n<=120)
    const linkDist = 140;
    const linkDist2 = linkDist * linkDist;
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const c = nodes[j];
        const dx = a.x - c.x;
        const dy = a.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < linkDist2) {
          const alpha = (1 - Math.sqrt(d2) / linkDist) * 0.18;
          ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    for (const p of nodes) {
      const dx = mouseX - p.x;
      const dy = mouseY - p.y;
      const dm2 = dx * dx + dy * dy;
      const hover = dm2 < 22500;
      ctx.fillStyle = hover
        ? `rgba(${r},${g},${b},0.85)`
        : `rgba(${r},${g},${b},0.4)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hover ? p.r * 1.6 : p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(step);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      seed();
    }, 150);
  });

  resize();
  seed();
  requestAnimationFrame(step);
})();
