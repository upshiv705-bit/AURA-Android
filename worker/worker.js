
const MODEL = "gemini-3.1-flash-lite";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8"
};

function send(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (request.method !== "POST") {
      return send({ error: "Only POST requests are allowed" }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return send({ error: "GEMINI_API_KEY secret is missing" }, 500);
    }

    try {
      const body = await request.json();
      const message = body.message;

      if (typeof message !== "string" || !message.trim()) {
        return send({ error: "Please provide a valid message" }, 400);
      }

      const apiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "You are AURA, a helpful personal AI assistant. Reply in Hindi when the user speaks Hindi and in English when the user speaks English. Keep answers clear, natural and useful."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: message.trim() }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return send({
          error: "Gemini API error",
          details: result.error?.message || "Unknown API error"
        }, response.status);
      }

      const reply = result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (!reply) {
        return send({
          error: "AI did not return a response",
          details: result.promptFeedback?.blockReason || "Empty response"
        }, 502);
      }

      return send({ reply });

    } catch (error) {
      return send({
        error: "Server error",
        details: error.message || "Unknown error"
      }, 500);
    }
  }
};
