'use client';

import { useState } from 'react';

const ASCII_ART_CHARS = /[┌┐└┘│─├┤┬┴┼╔╗╚╝║═]/;

export default function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  if (ASCII_ART_CHARS.test(children)) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-sm text-gray-200">
        {children}
      </pre>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-lg bg-gray-900 p-4">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 text-xs text-gray-400 transition-colors hover:text-white"
      >
        {copied ? '✅ Skopiowano!' : '📋 Kopiuj'}
      </button>
      <pre className="overflow-x-auto pt-4 text-sm text-gray-200">
        <code>{children}</code>
      </pre>
    </div>
  );
}
