'use client';

import { motion, type Variants } from 'framer-motion';

const steps = [
  {
    number: '1',
    title: 'Podłącz WordPress i Search Console',
    description:
      'Podaj dane logowania do WP i połącz konto Google. Zajmuje to 2 minuty.',
  },
  {
    number: '2',
    title: 'Porozmawiaj z agentem',
    description:
      'Agent analizuje Twoje dane z GSC, wskazuje okazje i proponuje zmiany w tytułach, opisach i treści.',
  },
  {
    number: '3',
    title: 'Podgląd, wdrożenie i pomiar',
    description:
      'Widzisz dokładnie co się zmieni. Po kliknięciu agent wdraża zmianę w WordPress i mierzy efekt.',
  },
];

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.2 } },
};

const stepVariants: Variants = {
  hidden:  { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function HowItWorksSection() {
  return (
    <section className="py-32 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-4">

        {/* Nagłówek */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white tracking-tight">
            Od podłączenia do wyników w 3 krokach
          </h2>
        </motion.div>

        {/* Kroki */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {steps.map(({ number, title, description }) => (
            <motion.div
              key={number}
              variants={stepVariants}
              className="relative flex flex-col"
            >
              {/* Wielki numer w tle */}
              <span className="text-[8rem] font-black leading-none text-white/5 select-none -mb-6">
                {number}
              </span>

              {/* Treść kroku */}
              <div className="bg-[#111] border border-white/10 rounded-2xl p-6 hover:border-purple-500/30 transition-colors duration-300">
                <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
