
const stripInternalTags = (content) => {
  let publicText = content
    .replace(/<thought>[\s\S]*?<\/thought>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { publicText };
};

let fullText = "Hello";
let publicTextAccumulated = "";

const emit = (content) => {
  fullText += content;
  const { publicText } = stripInternalTags(fullText);
  const delta = publicText.slice(publicTextAccumulated.length);
  if (delta.length > 0) {
    console.log(`EMIT: "${delta}"`);
    publicTextAccumulated = publicText;
  } else {
    console.log(`SKIP: "${content}" (publicText: "${publicText}")`);
  }
};

console.log("--- Testing multiple spaces ---");
emit(" ");
emit(" ");
emit("world");
