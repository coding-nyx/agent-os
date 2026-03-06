const stripInternalTags = (content, options = {}) => {
  let publicText = content
    .replace(/<thought>[\s\S]*?<\/thought>/g, ' ')
    .replace(/<action[\s\S]*?<\/action>/g, ' ')
    .replace(/<tool_calls_begin>[\s\S]*?<tool_calls_end>/g, ' ')
    .replace(/<tool_call_begin>[\s\S]*?<tool_call_end>/g, ' ')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, ' ');

  publicText = publicText
    .replace(/<thought>[\s\S]*/g, ' ')
    .replace(/<action[\s\S]*/g, ' ')
    .replace(/<tool_calls_begin>[\s\S]*/g, ' ')
    .replace(/<tool_call_begin>[\s\S]*/g, ' ')
    .replace(/<tool_call>[\s\S]*/g, ' ')
    .replace(/<(?:t(?:h(?:o(?:u(?:g(?:ht?)?)?)?)?)?|a(?:c(?:t(?:i(?:on?)?)?)?)?|tool_call(?:s_begin|_begin)?)$/i, '');

  if (!options.retainSpacings) {
    publicText = publicText.replace(/\s+/g, ' ');
  }
  
  return { publicText: publicText.trim() };
};

let fullText = "Hello";
let publicTextAccumulated = "Hello";

const emit = (content) => {
  fullText += content;
  const { publicText } = stripInternalTags(fullText, { retainSpacings: true });
  const delta = publicText.slice(publicTextAccumulated.length);
  if (delta.length > 0) {
    console.log(`EMIT: "${delta}"`);
    publicTextAccumulated = publicText;
  } else {
    console.log(`SKIP: "${content}" (publicText: "${publicText}")`);
  }
};

console.log("--- Verification of Space Preservation ---");
emit(" ");
emit(" ");
emit("world");
