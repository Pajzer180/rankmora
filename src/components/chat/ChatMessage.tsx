'use client';

import { Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import ChangeJobCard from './ChangeJobCard';
import type { ChangeJobCardProps } from './ChangeJobCard';
import SeoCard from './SeoCard';
import type { SeoCardData } from '@/app/api/chat/route';

interface MessagePart {
  type: string;
  [key: string]: unknown;
}

interface Props {
  message: {
    id: string;
    role: 'user' | 'assistant';
    parts: MessagePart[];
  };
  userInitial: string;
}

function extractText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } & MessagePart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

const SEO_MARKER = /__SEO_DATA__:([\s\S]+?)__END_SEO__\n?/;
const SEO_STRIP = /__SEO_DATA__:[\s\S]+?__END_SEO__\n?/g;

const CHANGE_JOB_MARKER = /__CHANGE_JOB__:([\s\S]+?)__END_CHANGE_JOB__\n?/g;
const CHANGE_JOB_STRIP = /__CHANGE_JOB__:[\s\S]+?__END_CHANGE_JOB__\n?/g;

function parseMessageContent(text: string): {
  seoData: SeoCardData | null;
  changeJobs: ChangeJobCardProps[];
  cleanBody: string;
} {
  const seoMatch = text.match(SEO_MARKER);
  const seoData = seoMatch ? (() => { try { return JSON.parse(seoMatch[1]) as SeoCardData; } catch { return null; } })() : null;

  const changeJobs: ChangeJobCardProps[] = [];
  let jobMatch: RegExpExecArray | null;
  const jobRegex = new RegExp(CHANGE_JOB_MARKER.source, 'g');
  while ((jobMatch = jobRegex.exec(text)) !== null) {
    try {
      changeJobs.push(JSON.parse(jobMatch[1]) as ChangeJobCardProps);
    } catch { /* skip malformed */ }
  }

  const cleanBody = text.replace(SEO_STRIP, '').replace(CHANGE_JOB_STRIP, '').trim();

  return { seoData, changeJobs, cleanBody };
}

const markdownComponents: Components = {
  code({ children, ...props }) {
    const isBlock = !props.node?.position || String(children).includes('\n');
    if (isBlock) {
      return <CodeBlock>{String(children).replace(/\n$/, '')}</CodeBlock>;
    }
    return (
      <code className="rounded bg-gray-800 px-1 py-0.5 text-xs text-gray-200" {...props}>
        {children}
      </code>
    );
  },
  a({ children, ...props }) {
    return (
      <a
        {...props}
        className="text-gray-400 no-underline transition-colors duration-150 hover:text-gray-200 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  },
};

export default function ChatMessage({ message, userInitial }: Props) {
  const text = extractText(message.parts);
  if (!text) return null;

  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          isUser
            ? 'bg-purple-600/20 text-purple-400'
            : 'border border-white/10 bg-white/5 text-gray-300'
        }`}
      >
        {isUser ? userInitial : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      {isUser ? (
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-purple-600 px-4 py-2.5 text-sm leading-relaxed text-white">
          <span className="whitespace-pre-wrap">{text}</span>
        </div>
      ) : (() => {
        const { seoData, changeJobs, cleanBody } = parseMessageContent(text);
        return (
          <div className="max-w-[75%] min-w-0">
            {seoData && <SeoCard {...seoData} />}
            {changeJobs.map((job) => (
              <ChangeJobCard key={job.jobId} {...job} />
            ))}
            {cleanBody && (
              <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-2.5 text-sm leading-relaxed text-gray-200">
                <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                  {cleanBody}
                </ReactMarkdown>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
