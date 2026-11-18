import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const HEADER_OFFSET = 76; // sticky top bar plus a little air
const SNAP_RANGE = 150; // px: a section start within this distance of where scrolling stops pulls the page onto it

/** The dashboard's sections: its direct children, flattening a plain stack wrapper into its blocks. */
const collectSections = (root) => {
  const out = [];
  const usable = (el) => {
    if (!(el instanceof HTMLElement) || el.hasAttribute('data-no-scroll-fx')) return false;
    if (el.getBoundingClientRect().height < 24) return false;
    const pos = getComputedStyle(el).position;
    return pos !== 'fixed' && pos !== 'absolute' && el.getAttribute('role') !== 'dialog';
  };
  Array.from(root.children).forEach((child) => {
    if (child.classList.contains('space-y-6') && child.children.length > 1) Array.from(child.children).forEach((g) => usable(g) && out.push(g));
    else if (usable(child)) out.push(child);
  });
  return out;
};

/**
 * Page-by-page scroll for the dashboard.
 *  - Each section rises, scales and fades in as it scrolls into view (scrubbed to the scrollbar).
 *  - Scrolling settles onto the nearest section start, so the page moves in steps.
 *  - Heatmap cells ripple in, and chart bars grow from their baseline, with the scroll.
 *  - A thin progress line tracks how far down the page you are.
 * `root` is the container element (pass it from a callback ref so the effect runs once it exists).
 * Uses GSAP ScrollTrigger, synced with Lenis when it is running. Does nothing under prefers-reduced-motion.
 */
export default function useDashboardScroll(root, enabled = true) {
  useEffect(() => {
    if (!enabled || !root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const lenis = window.__lenis;
    const onLenis = () => ScrollTrigger.update();
    lenis?.on('scroll', onLenis);

    // progress line
    const bar = document.createElement('div');
    bar.setAttribute('aria-hidden', 'true');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;z-index:60;pointer-events:none;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,var(--accent),var(--accent-chart));box-shadow:0 0 10px var(--accent-chart)';
    document.body.appendChild(bar);

    let ctx = null;
    let heatSeen = new WeakSet();

    const bindHeatmaps = (scope) => {
      scope.querySelectorAll('.apexcharts-canvas').forEach((canvas) => {
        if (heatSeen.has(canvas)) return;
        const rects = canvas.querySelectorAll('.apexcharts-heatmap-rect');
        if (!rects.length) return;
        heatSeen.add(canvas);
        const card = canvas.closest('.card, .app-card, .glass, section') || canvas;
        const tl = gsap.timeline({
          scrollTrigger: { trigger: card, start: 'top 88%', end: 'center 52%', scrub: 0.8 },
        });
        tl.fromTo(
          rects,
          { opacity: 0, scale: 0.35, transformOrigin: '50% 50%', transformBox: 'fill-box' },
          { opacity: 1, scale: 1, ease: 'back.out(1.5)', stagger: { amount: 0.9, from: 'start', grid: 'auto' } },
        );
        tl.fromTo(canvas.querySelectorAll('.apexcharts-xaxis, .apexcharts-yaxis'), { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.3 }, 0);
      });
    };

    // Recharts bars: grow from their baseline as the card scrolls into view.
    const bindBars = (scope) => {
      scope.querySelectorAll('.recharts-wrapper').forEach((wrap) => {
        if (heatSeen.has(wrap)) return;
        const bars = Array.from(wrap.querySelectorAll('.recharts-bar-rectangle'));
        if (!bars.length) return;
        heatSeen.add(wrap);
        const card = wrap.closest('.app-card, .card, .glass, section') || wrap;
        const horizontal = (() => { let w = 0; let h = 0; bars.forEach((el) => { const r = el.getBoundingClientRect(); w += r.width; h += r.height; }); return w > h; })();
        gsap.timeline({ scrollTrigger: { trigger: card, start: 'top 90%', end: 'center 55%', scrub: 0.8 } }).fromTo(
          bars,
          horizontal ? { scaleX: 0, transformOrigin: 'left center', transformBox: 'fill-box' } : { scaleY: 0, transformOrigin: 'center bottom', transformBox: 'fill-box' },
          horizontal ? { scaleX: 1, ease: 'power3.out', stagger: 0.08 } : { scaleY: 1, ease: 'power3.out', stagger: 0.05 },
        );
      });
    };

    const build = () => {
      ctx?.revert();
      heatSeen = new WeakSet();
      ctx = gsap.context(() => {
        const sections = collectSections(root);
        sections.forEach((el, i) => {
          gsap.fromTo(
            el,
            { y: i === 0 ? 0 : 70, opacity: i === 0 ? 1 : 0, scale: i === 0 ? 1 : 0.965, transformOrigin: '50% 0%' },
            {
              y: 0, opacity: 1, scale: 1, ease: 'none',
              scrollTrigger: {
                trigger: el, start: 'top 94%', end: 'top 56%', scrub: 0.6,
                onUpdate: (self) => { if (self.progress === 1 && el.style.transform) el.style.transform = ''; },
              },
            },
          );
          // settle: sections lean back slightly as the next one takes over
          gsap.fromTo(el, { scale: 1, opacity: 1 }, {
            scale: 0.985, opacity: 0.72, ease: 'none', transformOrigin: '50% 100%', immediateRender: false,
            scrollTrigger: { trigger: el, start: 'bottom 26%', end: 'bottom -5%', scrub: 0.6, onLeaveBack: () => { el.style.transform = ''; } },
          });
        });

        gsap.to(bar, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.2 } });

        ScrollTrigger.create({
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          snap: {
            snapTo: (value) => {
              const max = ScrollTrigger.maxScroll(window);
              if (!max) return value;
              const y = value * max;
              let best = null;
              collectSections(root).forEach((el) => {
                const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
                const d = Math.abs(top - y);
                if (d < SNAP_RANGE && (best === null || d < best.d)) best = { d, top };
              });
              return best ? Math.min(1, Math.max(0, best.top / max)) : value;
            },
            duration: { min: 0.25, max: 0.6 },
            delay: 0.12,
            ease: 'power2.inOut',
          },
        });

        bindHeatmaps(root);
        bindBars(root);
      }, root);
      ScrollTrigger.refresh();
    };

    // Data and lazy charts arrive after mount: rebuild when the sections change, bind heatmaps as they render.
    let rebuildTimer = 0;
    let heatTimer = 0;
    let lastCount = -1;
    const mo = new MutationObserver((records) => {
      const direct = records.some((r) => r.target === root || (r.target.parentElement === root));
      if (direct) {
        const n = collectSections(root).length;
        if (n !== lastCount) { lastCount = n; clearTimeout(rebuildTimer); rebuildTimer = setTimeout(build, 280); }
      }
      clearTimeout(heatTimer);
      heatTimer = setTimeout(() => ctx && ctx.add(() => { bindHeatmaps(root); bindBars(root); }), 350);
    });
    mo.observe(root, { childList: true, subtree: true });

    const ro = new ResizeObserver(() => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(() => ScrollTrigger.refresh(), 350); });
    ro.observe(root);

    lastCount = collectSections(root).length;
    build();

    return () => {
      clearTimeout(rebuildTimer); clearTimeout(heatTimer);
      mo.disconnect(); ro.disconnect();
      lenis?.off?.('scroll', onLenis);
      ctx?.revert();
      bar.remove();
    };
  }, [root, enabled]);
}
