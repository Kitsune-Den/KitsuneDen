"use client";

import { useEffect, useRef } from "react";

export default function Particles() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    for (let i = 0; i < 18; i++) {
      const p = document.createElement("div");
      p.style.position = "absolute";
      p.style.borderRadius = "50%";
      p.style.opacity = "0";
      p.style.animation = `particleFloat ${6 + Math.random() * 6}s ease-in-out infinite`;
      p.style.animationDelay = `${Math.random() * 8}s`;
      p.style.left = `${Math.random() * 100}%`;
      const size = 1.5 + Math.random() * 2;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      // Mostly lantern-orange embers, with the odd cyan spark
      const hue = Math.random() > 0.6 ? "199" : "26";
      p.style.background = `hsl(${hue}, 80%, 65%)`;
      container.appendChild(p);
    }

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
    />
  );
}
