'use client';

import Image from 'next/image';
import { useRef, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
} from 'framer-motion';

export default function HeroImage() {
  const containerRef = useRef<HTMLDivElement>(null);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [8, -8]), {
    stiffness: 150,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-8, 8]), {
    stiffness: 150,
    damping: 20,
  });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const { left, top, width, height } = el.getBoundingClientRect();
      const x = (e.clientX - left) / width - 0.5;
      const y = (e.clientY - top) / height - 0.5;
      rawX.set(x);
      rawY.set(y);
    },
    [rawX, rawY],
  );

  const handleMouseLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: '1200px' }}
      className="relative w-full"
    >
      {/* Glow w tle */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 m-auto h-2/3 w-2/3 rounded-full bg-purple-600/25 blur-[120px]"
      />

      {/* Wrapper animowany — floating + tilt */}
      <motion.div
        animate={{ y: [0, -15, 0] }}
        transition={{
          duration: 6,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'loop',
        }}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative w-full will-change-transform"
      >
        <Image
          src="/images/hero-ai-seo.png"
          alt="Autonomiczny agent SEO — Bress.io"
          width={1120}
          height={630}
          priority
          className="w-full h-auto object-contain rounded-2xl shadow-2xl shadow-black/60 ring-1 ring-white/10"
          style={{ transformStyle: 'preserve-3d' }}
        />
      </motion.div>

      {/* Gradient fade — dół obrazka wtapia się w tło strony */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-2/5 bg-gradient-to-t from-gray-950 to-transparent z-10"
      />
    </div>
  );
}
