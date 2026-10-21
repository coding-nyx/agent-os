import { useState, type ComponentProps } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { copyText } from './api';
import './rich_text.css';

function CodeBlock({ children, ...props }: ComponentProps<'pre'>) {
  const [status, setStatus] = useState('');
  return <div className="code-block"><button type="button" onClick={async event => {
    const text = event.currentTarget.parentElement?.querySelector('pre')?.textContent || '';
    try { await copyText(text); setStatus('Copied'); } catch (error) { setStatus((error as Error).message); }
  }}>Copy code</button><span role="status">{status}</span><pre {...props}>{children}</pre></div>;
}

export function RichText({ text }: { text: string }) {
  return <div className="rich-text"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    pre: CodeBlock,
    a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
    // Remote image requests can reveal private conversation activity. Let the
    // operator choose to open the image instead of fetching it while rendering.
    img: ({ src, alt }) => <a href={typeof src === 'string' ? src : undefined} target="_blank" rel="noopener noreferrer">{alt || 'Open image'}</a>,
    table: ({ node: _node, ...props }) => <div className="markdown-table" tabIndex={0} aria-label="Scrollable table"><table {...props} /></div>,
  }}>{text}</Markdown></div>;
}
