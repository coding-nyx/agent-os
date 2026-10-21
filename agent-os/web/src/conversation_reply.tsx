import { lazy, Suspense } from 'react';

const RichText = lazy(() => import('./rich_text').then(module => ({ default: module.RichText })));

export function ConversationReply({ text }: { text: string }) {
  return <Suspense fallback={<p>{text}</p>}><RichText text={text} /></Suspense>;
}
