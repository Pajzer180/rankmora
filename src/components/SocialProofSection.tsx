'use client';

import { motion } from 'framer-motion';
import { Command, Hexagon, Triangle, Circle, Square } from 'lucide-react';

const logos = [
  { icon: Command,  name: 'Acme Corp'    },
  { icon: Hexagon,  name: 'Nexus Studio' },
  { icon: Triangle, name: 'Orion Labs'   },
  { icon: Circle,   name: 'Vanta Growth' },
  { icon: Square,   name: 'Pulsar HQ'    },
];

export default function SocialProofSection() {
  return (
    <section className="py-16 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-4 flex flex-col items-center gap-10">

        <p className="text-sm text-slate-500 tracking-widest uppercase">
          Zaufali nam liderzy i nowoczesne agencje
        </p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6"
        >
          {logos.map(({ icon: Icon, name }) => (
            <div
              key={name}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-400 transition-colors"
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span className="text-sm font-medium tracking-wide">{name}</span>
            </div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
