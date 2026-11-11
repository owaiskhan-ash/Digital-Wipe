"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * A blur entrance for blocks marked with `data-reveal`.
 *
 * Runs after paint, so the markup is always readable without JavaScript: an
 * element is hidden only once this code has decided it is still below the fold
 * and therefore not being looked at. Anything already on screen animates on
 * arrival instead of waiting for a scroll.
 *
 * Elements are grouped by their parent, which gives a row of cards a stagger
 * without any of them having to know its index. A mutation observer picks up
 * blocks that mount later — the report after hydration, a tab switch, a scan's
 * findings — so they get the same entrance instead of appearing flat.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.remove("reveal-pending");
          el.classList.add("reveal-in");
          observer.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.08 }
    );

    let frame = 0;

    const scan = () => {
      frame = 0;
      const fresh = Array.from(
        document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])")
      );
      if (!fresh.length) return;

      // Group by parent so siblings arrive in sequence rather than together.
      const groups = new Map<Element | null, HTMLElement[]>();
      for (const el of fresh) {
        const list = groups.get(el.parentElement) ?? [];
        list.push(el);
        groups.set(el.parentElement, list);
      }

      const viewport = window.innerHeight;
      for (const list of groups.values()) {
        list.forEach((el, index) => {
          el.dataset.revealed = "1";
          const delay = Math.min(index, 5) * 70;
          if (delay) el.style.animationDelay = `${delay}ms`;

          if (el.getBoundingClientRect().top > viewport * 0.94) {
            // Not on screen yet: hold it back, let the observer bring it in.
            el.classList.add("reveal-pending");
            observer.observe(el);
          } else {
            el.classList.add("reveal-in");
          }
        });
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(scan);
    };

    schedule();

    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
