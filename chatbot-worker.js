/**
 * mini-Pratham — Cloudflare Worker proxy for the portfolio chatbot.
 *
 * WHY: GitHub Pages is a static host, so an API key placed in index.html
 * would be public. This tiny Worker keeps the key server-side and is the
 * only thing your site talks to.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SETUP (free, ~5 minutes)
 * ─────────────────────────────────────────────────────────────────────
 * 1. Get a free API key:
 *      • Groq  (recommended, fastest): https://console.groq.com/keys
 *      • OR Gemini: https://aistudio.google.com/apikey
 * 2. Create a Worker:
 *      • Easiest: https://workers.cloudflare.com → "Create Worker" →
 *        paste this file's contents → Deploy.
 *      • Or via CLI:  npm i -g wrangler && wrangler deploy
 * 3. Add your key as a secret (Worker → Settings → Variables, "Encrypt"):
 *      • For Groq:   name GROQ_API_KEY,   value = your key
 *      • For Gemini: name GEMINI_API_KEY, value = your key
 *    (CLI:  wrangler secret put GROQ_API_KEY)
 * 4. (Optional but recommended) Lock it to your site by setting a plain
 *    var ALLOWED_ORIGIN = https://pratham8902.github.io
 * 5. Copy the Worker URL (e.g. https://mini-pratham.<you>.workers.dev) and
 *    paste it into CHAT_API_URL in index.html.
 *
 * The Worker auto-selects Groq if GROQ_API_KEY exists, else Gemini.
 */

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODEL = "gemini-2.0-flash";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allowed === "*" ? "*" : allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405, cors);
    }
    if (allowed !== "*" && origin && origin !== allowed) {
      return json({ error: "forbidden origin" }, 403, cors);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "bad json" }, 400, cors); }

    const system = String(body.system || "You are a helpful assistant.").slice(0, 8000);
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!messages.length) return json({ error: "no messages" }, 400, cors);

    try {
      const reply = env.GROQ_API_KEY
        ? await callGroq(env.GROQ_API_KEY, system, messages)
        : await callGemini(env.GEMINI_API_KEY, system, messages);
      return json({ reply }, 200, cors);
    } catch (err) {
      return json({ error: "upstream", detail: String(err) }, 502, cors);
    }
  },
};

async function callGroq(key, system, messages) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.6,
      max_tokens: 400,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callGemini(key, system, messages) {
  if (!key) throw new Error("no api key configured");
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
