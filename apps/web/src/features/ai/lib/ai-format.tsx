'use client';

import React from 'react';

const KNOWN_MODEL_PREFIXES: Array<{ re: RegExp; label: string }> = [
  { re: /^qwen(\d+(?:\.\d+)?)$/i, label: 'Qwen $1' },
  { re: /^llama(\d+(?:\.\d+)?)$/i, label: 'Llama $1' },
  { re: /^gemma(\d+(?:\.\d+)?)$/i, label: 'Gemma $1' },
  { re: /^deepseek[-_]?r(\d+(?:\.\d+)?)$/i, label: 'DeepSeek R$1' },
  { re: /^mistral$/i, label: 'Mistral' },
  { re: /^phi(\d+(?:\.\d+)?)$/i, label: 'Phi $1' },
];

/**
 * Formats a raw Ollama model identifier (e.g. `qwen2.5:3b`, `qwen2.5:7b`)
 * into a concise human-readable label (e.g. `Qwen 2.5 3B`, `Qwen 2.5 7B`).
 */
export function formatOllamaModelLabel(modelId?: string | null): string {
  const raw = modelId?.trim();
  if (!raw) return 'LLM Lokal';

  const [familyRaw, tagRaw] = raw.split(':');
  let family = familyRaw || raw;

  for (const entry of KNOWN_MODEL_PREFIXES) {
    if (entry.re.test(family)) {
      family = family.replace(entry.re, entry.label);
      break;
    }
  }

  if (family === familyRaw) {
    family = family.charAt(0).toUpperCase() + family.slice(1);
  }

  if (!tagRaw || tagRaw.toLowerCase() === 'latest') {
    return family;
  }

  const formattedTag = tagRaw
    .split('-')
    .map((part) => (/^\d+(?:\.\d+)?[bBmMkK]$/.test(part) ? part.toUpperCase() : part))
    .join('-');

  return `${family} ${formattedTag}`;
}

function renderInlineFormatting(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null = tokenRe.exec(text);
  let partIdx = 0;

  while (match !== null) {
    if (match.index > lastIdx) {
      nodes.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${partIdx}`} className="ai-msg-strong">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c-${partIdx}`} className="ai-msg-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIdx = match.index + token.length;
    partIdx += 1;
    match = tokenRe.exec(text);
  }

  if (lastIdx < text.length) {
    nodes.push(text.slice(lastIdx));
  }

  return nodes;
}

/**
 * Safe React-only Markdown subset renderer for AI assistant bubbles.
 * Renders headings, bullet/numbered lists, bold, and inline code without innerHTML.
 */
export function AiMessageContent({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block (``` ... ```)
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i += 1;
      }
      if (codeLines.length > 0) {
        blocks.push(
          <pre key={`blk-${blockIdx}`} className="ai-msg-code-block">
            <code>{codeLines.join('\n')}</code>
          </pre>,
        );
        blockIdx += 1;
      }
      continue;
    }

    // Horizontal rule (--- or ***)
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push(<hr key={`blk-${blockIdx}`} className="ai-msg-hr" />);
      blockIdx += 1;
      i += 1;
      continue;
    }

    // Markdown heading (####, ###, ##, #)
    const headingMatch = /^#{1,4}\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      blocks.push(
        <p key={`blk-${blockIdx}`} className="ai-msg-heading">
          {renderInlineFormatting(headingMatch[1], `h-${blockIdx}`)}
        </p>,
      );
      blockIdx += 1;
      i += 1;
      continue;
    }

    // Unordered list (- or * item)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`blk-${blockIdx}`} className="ai-msg-list ai-msg-list--ul">
          {items.map((item, idx) => (
            <li key={`ul-${blockIdx}-${idx}`}>
              {renderInlineFormatting(item, `ul-${blockIdx}-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      blockIdx += 1;
      continue;
    }

    // Ordered list (1. item) — preserves `start` when sub-bullets split consecutive numbered items
    const orderedFirstMatch = /^(\d+)[.)]\s+/.exec(trimmed);
    if (orderedFirstMatch) {
      const startNum = Number.parseInt(orderedFirstMatch[1], 10);
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol
          key={`blk-${blockIdx}`}
          className="ai-msg-list ai-msg-list--ol"
          start={Number.isFinite(startNum) && startNum > 1 ? startNum : undefined}
        >
          {items.map((item, idx) => (
            <li key={`ol-${blockIdx}-${idx}`}>
              {renderInlineFormatting(item, `ol-${blockIdx}-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      blockIdx += 1;
      continue;
    }

    // Regular paragraph (group consecutive non-empty plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(?:---|\*\*\*|___)\s*$/.test(lines[i].trim()) &&
      !/^#{1,4}\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={`blk-${blockIdx}`} className="ai-msg-para">
        {paraLines.map((line, lineIdx) => (
          <React.Fragment key={`p-${blockIdx}-${lineIdx}`}>
            {lineIdx > 0 && <br />}
            {renderInlineFormatting(line, `p-${blockIdx}-${lineIdx}`)}
          </React.Fragment>
        ))}
      </p>,
    );
    blockIdx += 1;
  }

  return <div className="ai-msg-rich">{blocks}</div>;
}
