
const { stripInternalTags } = require('./src/llm-engine/sanitize');

const testStream = () => {
  let fullText = "Hello";
  let publicTextAccumulated = "";

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

  console.log("--- Testing multiple spaces (fixed code) ---");
  emit(" ");
  emit(" ");
  emit("world");
  
  console.log("\n--- Testing trailing unclosed tag (flicker protection) ---");
  fullText = "Hello ";
  publicTextAccumulated = "Hello";
  emit("<thou");
  emit("ght");
  emit(">Internal");
  emit("</thought>");
  emit(" world");
};

testStream();
