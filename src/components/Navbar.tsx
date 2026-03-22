'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Jak to działa', href: '/#how-it-works' },
  { label: 'Cennik',        href: '/cennik'        },
  { label: 'O nas',         href: '/o-nas'         },
  { label: 'Demo',          href: '/demo'          },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 w-full z-50 bg-black/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-8 h-16 grid grid-cols-3 items-center">

        {/* LEWA — Logo */}
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-white"
        >
          Bress.io
        </Link>

        {/* ŚRODEK — Linki (desktop) */}
        <nav className="hidden md:flex items-center justify-center space-x-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 rounded-md text-[13px] font-medium tracking-wide text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* PRAWA — CTA (desktop) + Hamburger (mobile) */}
        <div className="flex items-center justify-end space-x-6">
          <Link
            href="/login"
            className="hidden md:inline-flex items-center px-3 py-1.5 rounded-md text-[13px] font-medium tracking-wide text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
          >
            Zaloguj
          </Link>
          <Link
            href="/register"
            className="hidden md:inline-flex items-center text-sm font-semibold px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200"
          >
            Wypróbuj Bress.io
          </Link>

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Zamknij menu' : 'Otwórz menu'}
            className="block md:hidden p-1.5 text-white/60 hover:text-white transition-colors"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

      </div>

      {/* Menu mobilne */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-black px-6 py-4 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-white/60 hover:text-white transition-colors py-1"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-2 flex flex-col gap-3 border-t border-white/5 pt-4">
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-white/60 hover:text-white transition-colors"
            >
              Zaloguj
            </Link>
            <Link
              href="/register"
              onClick={() => setMobileOpen(false)}
              className="inline-flex justify-center items-center text-sm font-semibold px-4 py-2.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              Wypróbuj Bress.io
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
