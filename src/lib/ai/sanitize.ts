export type SanitizedContent = {
  publicText: string;
  hasThought: boolean;
  hasAction: boolean;
};

export function stripInternalTags(content: string): SanitizedContent {
  const hasThought = /<thought>[\s\S]*?<\/thought>/.test(content);
  const hasAction = /<action[\s\S]*?<\/action>/.test(content);
  const publicText = content
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .replace(/<action[\s\S]*?<\/action>/g, '')
    .trim();

  return { publicText, hasThought, hasAction };
}
