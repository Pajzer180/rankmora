'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';

export default function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  // Overlay: przez pierwsze 15% czysta grafika, potem ciemnieje do 50% scrolla
  const overlayOpacity = useTransform(scrollYProgress, [0.15, 0.5], [0, 1]);

  // Tekst: pojawia się nieco po tym jak overlay zaczął ciemnieć
  const textOpacity = useTransform(scrollYProgress, [0.2, 0.6], [0, 1]);
  const textY = useTransform(scrollYProgress, [0.2, 0.6], [50, 0]);

  return (
    <section ref={sectionRef} className="relative w-full h-[300vh]">

      {/* Sticky viewport — blokuje widok na wysokości ekranu */}
      <div className="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center">

        {/* WARSTWA 1 — Grafika (statyczna, zawsze 100% ekranu, zero skalowania) */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/hero-4k.png"
            alt="Autonomiczny agent SEO — Bress.io"
            fill
            priority={true}
            unoptimized={true}
            className="object-cover object-top"
          />
        </div>

        {/* WARSTWA 2 — Overlay (scroll 0→30%: opacity 0→1, krycie 95%) */}
        <motion.div
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 bg-[#0a0a0a]/95 z-10"
        />

        {/* WARSTWA 3 — Treść (reveal: fade-in + slide-up ze scrollem) */}
        <motion.div
          style={{ opacity: textOpacity, y: textY }}
          className="relative z-20 flex flex-col items-center text-center px-4 max-w-4xl"
        >
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-gray-300">
            Autonomiczny Agent SEO
          </div>

          <h1 className="mt-6 bg-gradient-to-b from-white to-white/70 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl lg:text-7xl">
            Twój asystent SEO<br />oparty o AI.
          </h1>

          <p className="mt-5 max-w-xl mx-auto text-lg text-white/60">
            Podłącz WordPress i Search Console, porozmawiaj z agentem, wdróż zmiany jednym kliknięciem.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-700 px-8 py-3 text-base font-semibold text-white transition-all duration-200"
              >
                Rozpocznij 3-dniowy Trial
              </Link>
              <span className="text-xs text-gray-500">Wymaga karty. Anuluj w dowolnym momencie.</span>
            </div>
            <Link
              href="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors duration-200"
            >
              Zaloguj się →
            </Link>
          </div>
        </motion.div>

      </div>

    </section>
  );
}
