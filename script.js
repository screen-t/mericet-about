/* ==========================================================================
   Mericet — script.js
   Vanilla JS, no build step. Organized into independent pieces — safe to
   delete any one block without breaking the others.

   The hero visual is a real Three.js scene (loaded via CDN in index.html):
   a 3D infinity loop, lit and staged like a physical object. Click it to
   send a pulse of light around the loop. If Three.js or WebGL isn't
   available, the canvas just stays empty — the CSS glow behind it
   (.hero::before in style.css) still makes the hero look intentional.
   ========================================================================== */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     1. Header: switch to the compact/blurred state after scrolling
     ------------------------------------------------------------------ */
  const header = document.getElementById("site-header");
  const setHeaderState = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  setHeaderState();
  window.addEventListener("scroll", setHeaderState, { passive: true });

  /* ------------------------------------------------------------------
     2. Mobile nav toggle
     ------------------------------------------------------------------ */
  const navToggle = document.getElementById("nav-toggle");
  const mainNav = document.getElementById("main-nav");

  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    });
  });

  /* ------------------------------------------------------------------
     3. Scroll reveals (IntersectionObserver)
     ------------------------------------------------------------------ */
  const revealTargets = document.querySelectorAll(".reveal, .manifesto");

  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.35 }
    );
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add("is-visible"));
  }

  /* ------------------------------------------------------------------
     4. 3D tilt on rows ([data-tilt]: problem rows, team rows)
     ------------------------------------------------------------------ */
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (supportsHover && !reduceMotion) {
    const MAX_TILT = 4; // degrees — subtle

    document.querySelectorAll("[data-tilt]").forEach((card) => {
      let rect = null;
      card.addEventListener("pointerenter", () => {
        rect = card.getBoundingClientRect(); // read once per hover, not per pixel of movement
      });

      card.addEventListener("pointermove", (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const tiltX = (0.5 - py) * MAX_TILT * 2;
        const tiltY = (px - 0.5) * MAX_TILT * 2;
        card.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
      });

      card.addEventListener("pointerleave", () => {
        rect = null;
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    });
  }

  /* ------------------------------------------------------------------
     5. Hero visual — a 3D infinity loop (a lemniscate — the "sideways 8"
     shape), built as a real glossy tube with three-point lighting and a
     layered atmosphere, not a flat icon. Click it to send a pulse of
     light traveling around the loop. The CSS glow behind the canvas
     (.hero::before in style.css) already makes the hero look intentional
     on its own, so if Three.js or WebGL isn't available, the canvas just
     stays empty.
     ------------------------------------------------------------------ */
  const canvas = document.getElementById("hero-canvas");
  const heroSection = canvas.closest(".hero");
  let triggerHeroReplay = null; // wired up once the scene exists; used by the "capable" easter egg too

  function hasWebGL() {
    try {
      const test = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (test.getContext("webgl") || test.getContext("experimental-webgl")));
    } catch (e) {
      return false;
    }
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // A lemniscate of Bernoulli — the actual infinity-symbol curve, oriented
  // upright (like the numeral 8, loops stacked vertically) rather than the
  // usual sideways "∞" — with a gentle sine twist through Z so the loop
  // reads as a real dimensional object from more than one angle.
  class InfinityCurve extends THREE.Curve {
    constructor(scale) {
      super();
      this.scale = scale;
    }
    getPoint(t, target) {
      target = target || new THREE.Vector3();
      const angle = t * Math.PI * 2;
      const s = this.scale;
      const denom = 1 + Math.sin(angle) * Math.sin(angle);
      const x = (s * Math.sin(angle) * Math.cos(angle)) / denom;
      const y = (s * Math.cos(angle)) / denom;
      const z = Math.sin(angle * 2) * s * 0.22;
      return target.set(x, y, z);
    }
  }

  function initLogoScene() {
    let width = heroSection.clientWidth;
    let height = heroSection.clientHeight;

    // The loop plays big on wide screens and scales itself down on
    // narrow ones, rather than using one fixed size for every viewport.
    const SCALE = width < 640 ? 1.1 : width < 1100 ? 1.5 : 1.9;
    const X_OFFSET = width < 640 ? 0 : 1.6;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    // Lighting kept cool and blue-tinted throughout — nothing near-white,
    // so every highlight on the glossy tube reads as brand blue rather
    // than a stray white hotspot. Four lights, not five — every extra
    // light is extra per-pixel cost, and the kicker wasn't earning its
    // keep next to the rim light doing the same job.
    scene.add(new THREE.AmbientLight(0x1a2340, 0.55));
    const key = new THREE.DirectionalLight(0x9fc4ff, 0.95);
    key.position.set(3.5, 4, 6);
    scene.add(key);
    const fillLight = new THREE.PointLight(0x2a3350, 0.5, 30);
    fillLight.position.set(-4, -1, 4);
    scene.add(fillLight);
    const rim = new THREE.PointLight(0x0a4ad6, 1.5, 30);
    rim.position.set(-3, -2, -3);
    scene.add(rim);

    const group = new THREE.Group();
    group.position.x = X_OFFSET;
    group.rotation.x = 0.18; // a slight default tilt so the loop reads as 3D even on a static (reduced-motion) render
    scene.add(group);

    const loopScale = 2.15 * SCALE;
    const tubeRadius = 0.34 * SCALE;
    const curve = new InfinityCurve(loopScale);

    // Segment counts kept as low as still reads perfectly round at this
    // size — a quarter of the triangles of the first pass, same silhouette.
    const loop = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 130, tubeRadius, 16, true),
      new THREE.MeshPhongMaterial({
        color: 0x0a4ad6,
        emissive: 0x0d3aa8,
        emissiveIntensity: 0.18,
        shininess: 70,
        specular: 0x6fa8ff,
      })
    );
    group.add(loop);

    // A slightly larger, additive "skin" around the tube for a soft rim
    // glow along its whole silhouette — a cheap stand-in for reflections
    // without needing an environment map. Kept brand-blue, and the only
    // glow in the scene — the space around the loop stays black.
    const rimGlow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 130, tubeRadius * 1.3, 12, true),
      new THREE.MeshBasicMaterial({
        color: 0x1e97f5,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      })
    );
    group.add(rimGlow);

    // A small glowing pulse that can travel once around the loop —
    // fired on click, and by the "capable" easter egg.
    const pulses = [];
    function spawnPulse() {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(tubeRadius * 1.7, 12, 12),
        new THREE.MeshBasicMaterial({
          color: 0x1e97f5,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(mesh);
      pulses.push({ mesh, start: performance.now(), duration: 2600 });
    }

    function replayAssembly() {
      spawnPulse();
    }
    triggerHeroReplay = replayAssembly;

    canvas.addEventListener("click", () => {
      spawnPulse();
    });

    // Gentle sway toward the pointer, damped, layered on top of a slow
    // continuous turn — a closed loop (unlike a flat mark) looks good
    // from every angle, so it can actually keep spinning.
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let heroRect = heroSection.getBoundingClientRect();

    function onPointerMove(e) {
      const nx = ((e.clientX - heroRect.left) / heroRect.width) * 2 - 1;
      const ny = ((e.clientY - heroRect.top) / heroRect.height) * 2 - 1;
      targetY = nx * 0.3;
      targetX = ny * 0.16;
    }
    heroSection.addEventListener("pointermove", onPointerMove);
    heroSection.addEventListener("pointerleave", () => { targetX = 0; targetY = 0; });

    function resize() {
      width = heroSection.clientWidth;
      height = heroSection.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      heroRect = heroSection.getBoundingClientRect();
    }
    let resizeTimer = null;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
      },
      { passive: true }
    );
    window.addEventListener("scroll", () => { heroRect = heroSection.getBoundingClientRect(); }, { passive: true });

    let raf = null;
    let running = false;
    const startTime = performance.now();
    const ROT_SPEED = reduceMotion ? 0 : 0.0022;

    function animate(now) {
      const t = (now - startTime) / 1000;

      // Arrives rather than just appearing — scales in once, over the
      // first ~0.7s, then this line costs nothing further (already at 1).
      const introT = Math.min(1, t / 0.7);
      if (introT < 1) group.scale.setScalar(easeOutCubic(introT));

      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      group.rotation.x = 0.18 + curX;
      group.rotation.y = curY + t * ROT_SPEED * 60;
      group.position.y = Math.sin(t * 0.2) * 0.12 * SCALE;

      for (let i = pulses.length - 1; i >= 0; i--) {
        const pl = pulses[i];
        const localT = (now - pl.start) / pl.duration;
        if (localT >= 1) {
          group.remove(pl.mesh);
          pl.mesh.material.dispose();
          pl.mesh.geometry.dispose();
          pulses.splice(i, 1);
          continue;
        }
        const eased = easeInOutCubic(Math.min(1, localT));
        curve.getPoint(eased, pl.mesh.position);
        const fade = localT < 0.08 ? localT / 0.08 : localT > 0.85 ? (1 - localT) / 0.15 : 1;
        pl.mesh.material.opacity = Math.max(0, fade);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }

    function start() {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(animate);
      }
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      start();
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (!reduceMotion) start();
    });
  }

  if (typeof THREE !== "undefined" && hasWebGL()) {
    try {
      initLogoScene();
    } catch (err) {
      /* canvas stays empty; the CSS glow behind it still carries the hero */
    }
  }

  /* ------------------------------------------------------------------
     6. Hidden things for visitors, not developers — a small handful,
     easy to miss, none of them required to use the site.
     ------------------------------------------------------------------ */

  // a) Type "capable" anywhere on the page for a quick flourish, and to
  //    send a pulse around the hero loop.
  let typedBuffer = "";
  window.addEventListener("keydown", (e) => {
    if (e.key.length !== 1) return;
    typedBuffer = (typedBuffer + e.key).slice(-10).toLowerCase();
    if (typedBuffer.includes("capable")) {
      typedBuffer = "";
      if (reduceMotion) return;
      const overlay = document.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:9999;pointer-events:none;" +
        "background:radial-gradient(circle at 60% 40%, rgba(111,208,255,0.32), transparent 62%);" +
        "opacity:0;transition:opacity 0.5s ease;";
      document.body.appendChild(overlay);
      requestAnimationFrame(() => { overlay.style.opacity = "1"; });
      setTimeout(() => { overlay.style.opacity = "0"; }, 450);
      setTimeout(() => overlay.remove(), 1400);
      if (triggerHeroReplay) triggerHeroReplay();
    }
  });

  // b) Five clicks on the footer logo within two seconds gently pulses
  //    the whole page once — a quiet reward, not a full theme change.
  const footerBrand = document.querySelector(".site-footer .brand");
  if (footerBrand) {
    let clicks = 0;
    let clickTimer = null;
    footerBrand.addEventListener("click", () => {
      clicks += 1;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clicks = 0; }, 2000);
      if (clicks >= 5) {
        clicks = 0;
        if (reduceMotion || !document.body.animate) return;
        document.body.animate(
          [{ filter: "brightness(1)" }, { filter: "brightness(1.35)" }, { filter: "brightness(1)" }],
          { duration: 700, easing: "ease-in-out" }
        );
      }
    });
  }

  /* c) A third one is left for you to find by reading the page source. */

  /* ------------------------------------------------------------------
     7. Footer year
     ------------------------------------------------------------------ */
  const yearEl = document.getElementById("copyright-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------------
     8. Headline decode — "Mericet" resolves from scrambled characters
     once on load. Screen readers get the real word immediately via
     aria-label regardless of what the visible text shows mid-animation.
     ------------------------------------------------------------------ */
  if (!reduceMotion) {
    const heroH1 = document.querySelector(".hero h1");
    if (heroH1) {
      const finalText = heroH1.textContent;
      const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+";
      const chars = finalText.split("");
      const totalFrames = 20;
      let frame = 0;

      function tick() {
        let out = "";
        for (let i = 0; i < chars.length; i++) {
          if (chars[i] === " ") {
            out += " ";
            continue;
          }
          const lockAt = (i / chars.length) * totalFrames;
          out += frame >= lockAt ? chars[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
        }
        heroH1.textContent = out;
        frame++;
        if (frame <= totalFrames) {
          setTimeout(tick, 38);
        } else {
          heroH1.textContent = finalText;
        }
      }
      tick();
    }
  }

  /* ------------------------------------------------------------------
     9. Scroll progress, traced as the infinity mark rather than a bar.
     ------------------------------------------------------------------ */
  const tracer = document.getElementById("progress-tracer");
  const progressFill = document.getElementById("progress-fill");
  if (tracer && progressFill) {
    const pathLength = progressFill.getTotalLength();
    progressFill.style.strokeDasharray = String(pathLength);
    progressFill.style.strokeDashoffset = String(pathLength);

    let idleTimer = null;
    function updateProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;
      progressFill.style.strokeDashoffset = String(pathLength * (1 - pct));
      tracer.classList.toggle("is-visible", scrollTop > window.innerHeight * 0.6);

      // A quiet idle pulse once scrolling stops — pure CSS animation
      // (see .progress-tracer.is-idle in style.css), so there's nothing
      // running at all while the page is actually still.
      tracer.classList.remove("is-idle");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => tracer.classList.add("is-idle"), 1000);
    }
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });
  }

  /* ------------------------------------------------------------------
     10. Magnetic buttons — a gentle pull toward the cursor. Fine
     pointers only; touch devices are untouched.
     ------------------------------------------------------------------ */
  if (supportsHover) {
    document.querySelectorAll(".btn").forEach((btn) => {
      let rect = null;
      btn.addEventListener("pointerenter", () => {
        rect = btn.getBoundingClientRect(); // read once per hover, not per pixel of movement
      });
      btn.addEventListener("pointermove", (e) => {
        if (!rect) rect = btn.getBoundingClientRect();
        const relX = e.clientX - (rect.left + rect.width / 2);
        const relY = e.clientY - (rect.top + rect.height / 2);
        btn.style.transform = `translate(${relX * 0.25}px, ${relY * 0.35}px)`;
      });
      btn.addEventListener("pointerleave", () => {
        rect = null;
        btn.style.transform = "";
      });
    });
  }

  /* ------------------------------------------------------------------
     11. Custom cursor — fine pointers only. The body class that hides
     the real cursor is added here, in JS, so if anything above throws
     first, the real cursor was never hidden in the first place.
     ------------------------------------------------------------------ */
  if (supportsHover) {
    const cursorEl = document.getElementById("custom-cursor");
    if (cursorEl) {
      document.body.classList.add("custom-cursor-active");
      cursorEl.classList.add("is-active");

      // The "catches up to the pointer" lag is a CSS transition on
      // transform (see .custom-cursor in style.css) — the browser
      // compositor handles the interpolation for free. No per-frame JS
      // loop needed, and nothing runs at all while the pointer is still.
      window.addEventListener(
        "pointermove",
        (e) => {
          cursorEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
          const hovering = e.target.closest("a, button, summary, input, [data-tilt]");
          cursorEl.classList.toggle("is-hovering", !!hovering);
        },
        { passive: true }
      );
    }
  }

  /* ------------------------------------------------------------------
     12. Tab-away title — a small callback when you look away, and
     back to normal the moment you return.
     ------------------------------------------------------------------ */
  const ORIGINAL_TITLE = document.title;
  document.addEventListener("visibilitychange", () => {
    document.title = document.hidden ? "Still becoming? — Mericet" : ORIGINAL_TITLE;
  });

})();