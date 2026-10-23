"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "../landing.module.css";

/**
 * Hero backdrop: a dim field of commitments that only becomes readable under the pointer, like a
 * torch over a crowd: you can see that people are there, never who. Mouse only; touch and reduced
 * motion get the still field.
 */
export function Hero({ field, children }: { field: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--x", `${e.clientX - r.left + 24}px`);
        el.style.setProperty("--y", `${e.clientY - r.top + 24}px`);
        el.dataset.pointer = "on";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.dataset.pointer = "off";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <section ref={ref} className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.field} aria-hidden="true">
        {field}
      </div>
      <div className={styles.fieldLit} aria-hidden="true">
        {field}
      </div>
      <div className={styles.vignette} aria-hidden="true" />
      {children}
    </section>
  );
}
