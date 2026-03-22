'use client';

import { motion, type Variants } from 'framer-motion';
import { MessageSquare, GitCompareArrows, TrendingUp } from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'Agent w chacie',
    description:
      'Porozmawiaj z AI, które zna Twoje dane z Search Console i proponuje konkretne zmiany.',
  },
  {
    icon: GitCompareArrows,
    title: 'Podgląd i wdrożenie',
    description:
      'Przed zmianą widzisz porównanie before/after. Po akceptacji agent wdraża zmianę w WordPress.',
  },
  {
    icon: TrendingUp,
    title: 'Pomiar efektu i rollback',
    description:
      'Agent mierzy wpływ zmian po 7, 14 i 30 dniach. Jednym kliknięciem cofniesz każdą zmianę.',
  },
];

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
};

export default function FeaturesSection() {
  return (
    <section className="py-32">
      <div className="max-w-6xl mx-auto px-4">

        {/* Nagłówek */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold text-white tracking-tight">
            Wszystko czego potrzebujesz do SEO.
          </h2>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            Bress.io łączy dane z Google Search Console z mocą AI, żebyś mógł optymalizować WordPress bez zgadywania.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {features.map(({ icon: Icon, title, description }) => (
            <motion.div
              key={title}
              variants={cardVariants}
              className="group bg-[#111] border border-white/10 rounded-2xl p-8 hover:border-purple-500/50 transition-colors duration-300"
            >
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-purple-500/10 border border-purple-500/20 mb-6">
                <Icon className="w-5 h-5 text-purple-400" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
