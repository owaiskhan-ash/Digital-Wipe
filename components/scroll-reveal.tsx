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
 *
 * `data-reveal="now"` means the block animates on arrival whatever the fold
 * says, and every screen of the app uses it. A report whose rows wait to be
 * scrolled to is a report that looks like it is missing rows: the count says
 * seven, the page shows two, and nothing tells the reader the rest are there
 * but shy. The scroll entrance belongs to the story pages, where a block that
 * has not been reached yet genuinely has not been looked at.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Without the observer nothing could ever be brought back, so nothing is
    // hidden: every block simply arrives.
    if (typeof IntersectionObserver === "undefined") {
      document
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((el) => el.classList.add("reveal-in"));
      return;
    }

    const reveal = (el: HTMLElement, animate = true) => {
      el.classList.remove("reveal-pending");
      if (animate && !el.classList.contains("reveal-in")) {
        el.classList.add("reveal-in");
      }
      observer.unobserve(el);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target as HTMLElement);
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

          const alwaysAnimate = el.dataset.reveal === "now";
          if (alwaysAnimate || el.getBoundingClientRect().top <= viewport * 0.94) {
            el.classList.add("reveal-in");
            return;
          }

          // Below the fold: hold it back, let the observer bring it in.
          el.classList.add("reveal-pending");
          observer.observe(el);
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

    // Paper has no scroll to wait for, and a browser without the observer
    // would otherwise never show these blocks at all.
    const showPending = () =>
      document
        .querySelectorAll<HTMLElement>(".reveal-pending")
        .forEach((el) => reveal(el, false));
    window.addEventListener("beforeprint", showPending);

    return () => {
      window.removeEventListener("beforeprint", showPending);
      observer.disconnect();
      mutations.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
