export interface BudgetInput {
  title: string;
  identityLines: string[];
  nsvBlock?: string;
  insightLines?: string[];
  extensionBlock?: string;
  maxChars: number;
  minNsvChars?: number;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 16) return value.slice(0, Math.max(0, maxChars));
  return `${value.slice(0, maxChars - 12).trim()} [trimmed]`;
}

export function composeBoundedContext(input: BudgetInput): string {
  const baseHeader = [input.title, ...input.identityLines].join('\n');
  const maxChars = Math.max(400, input.maxChars);
  const minNsvChars = Math.max(120, input.minNsvChars ?? 320);

  let remaining = maxChars - baseHeader.length - 2;
  if (remaining <= 0) return truncateText(baseHeader, maxChars);

  let nsvBlock = input.nsvBlock?.trim() || '';
  let insightLines = (input.insightLines || []).filter(Boolean).map((line) => line.trim());
  let extensionBlock = input.extensionBlock?.trim() || '';

  // First clamp individual segments to avoid pathological growth.
  if (nsvBlock) nsvBlock = truncateText(nsvBlock, Math.min(remaining, Math.max(minNsvChars, Math.floor(maxChars * 0.45))));
  if (extensionBlock) extensionBlock = truncateText(extensionBlock, Math.min(Math.floor(maxChars * 0.25), 700));
  insightLines = insightLines.map((line) => truncateText(line, 220));

  const section = () => {
    const parts: string[] = [baseHeader];
    if (nsvBlock) parts.push(nsvBlock);
    if (insightLines.length > 0) {
      parts.push(`ACTIVE TRENDS:\n${insightLines.map((line) => `- ${line}`).join('\n')}`);
    }
    if (extensionBlock) parts.push(extensionBlock);
    return parts.join('\n');
  };

  let output = section();
  while (output.length > maxChars) {
    if (insightLines.length > 0) {
      insightLines = insightLines.slice(0, -1);
      output = section();
      continue;
    }
    if (extensionBlock.length > 0) {
      extensionBlock = truncateText(extensionBlock, Math.max(0, extensionBlock.length - 120));
      output = section();
      continue;
    }
    if (nsvBlock.length > minNsvChars) {
      nsvBlock = truncateText(nsvBlock, Math.max(minNsvChars, nsvBlock.length - 180));
      output = section();
      continue;
    }
    output = truncateText(output, maxChars);
    break;
  }

  return output;
}
