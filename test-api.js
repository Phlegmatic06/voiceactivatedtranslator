import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Very simple dot-env parser
const envRaw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envRaw.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const GROQ_KEY = env['VITE_GROQ_API_KEY'];

if (!GROQ_KEY) {
  console.log("NO GROQ KEY FOUND");
  process.exit(0);
}

const groq = new Groq({ apiKey: GROQ_KEY });

async function test() {
  console.log("Testing Groq...");
  try {
    const res = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'Output ONLY JSON in this format: { "botSpokenReply": "text here" }' },
        { role: 'user', content: 'Say hello in Tamil.' }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      max_tokens: 100,
    });
    console.log("GROQ SUCCESS:", res.choices[0]?.message?.content);
  } catch(e) {
    console.log("GROQ ERROR:", e.message);
  }
}

test();
