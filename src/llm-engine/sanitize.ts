export type SanitizedContent = {
  publicText: string;
  thoughtText: string | null;
  isThinking: boolean;
};

export function stripInternalTags(content: string): SanitizedContent {
  // 1. Extract thought if completed
  const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/);
  const thoughtText = thoughtMatch ? thoughtMatch[1].trim() : null;
  
  // 2. Check if currently thinking (open tag but no close tag)
  const isThinking = content.includes('<thought>') && !content.includes('</thought>');

  // 3. Aggressively clean public text
  // Remove completed tags
  let publicText = content
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .replace(/<action[\s\S]*?<\/action>/g, '');

  // Remove any unclosed tags at the end (for streaming)
  publicText = publicText
    .replace(/<thought>[\s\S]*/g, '')
    .replace(/<action[\s\S]*/g, '')
    .trim();

  return { publicText, thoughtText, isThinking };
}
