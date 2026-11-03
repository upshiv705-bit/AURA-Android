
const MODEL = "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function send(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS
  });
}

function safeDetails(payload) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    "Unknown API error";
  return String(message).slice(0, 500);
}

function publicError(status, details) {
  const lower = String(details).toLowerCase();

  if (status === 429 || lower.includes("quota") || lower.includes("rate limit")) {
    return {
      error: "AI temporarily busy",
      details: "Gemini free-tier quota or rate limit reached. Please wait and try again."
    };
  }

  if (status === 401 || status === 403 || lower.includes("api key")) {
    return {
      error: "AI configuration error",
      details: "Gemini API key is invalid, restricted, or does not have access to this model. Check the GEMINI_API_KEY secret in Cloudflare."
    };
  }

  if (status === 404 || lower.includes("not found")) {
    return {
      error: "AI model unavailable",
      details: `The configured Gemini model (${MODEL}) was not found or is unavailable for this API key.`
    };
  }

  if (status >= 500) {
    return {
      error: "AI temporarily unavailable",
      details: "Gemini is temporarily overloaded. Please try again shortly."
    };
  }

  return {
    error: "Gemini API error",
    details: String(details).slice(0, 500)
  };
}

async function callGemini(message, apiKey) {
  const url =
    `${API_BASE}${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{
          text: "You are AURA, a helpful personal AI assistant. Reply in Hindi when the user speaks Hindi and in English when the user speaks English. Keep answers clear, natural and useful. Do not claim to control the phone or open apps; the Android app handles those actions locally."
        }]
      },
      contents: [{
        role: "user",
        parts: [{ text: message }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024
      }
    })
  });

  const raw = await response.text();
  let result;

  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = {
      error: {
        message: raw || "Invalid response from Gemini"
      }
    };
  }

  return { response, result };
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
      return send({
        error: "Only POST requests are allowed",
        details: "Send a POST request with JSON {message: string}."
      }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return send({
        error: "Server configuration error",
        details: "GEMINI_API_KEY secret is missing in Cloudflare Worker settings."
      }, 500);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return send({
        error: "Invalid request",
        details: "Request body must be valid JSON."
      }, 400);
    }

    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return send({
        error: "Invalid request",
        details: "Please provide a non-empty message."
      }, 400);
    }

    if (message.length > 8000) {
      return send({
        error: "Message too long",
        details: "Please keep the message under 8000 characters."
      }, 413);
    }

    try {
      let result = await callGemini(message, env.GEMINI_API_KEY);

      if (
        result.response.status === 503 ||
        result.response.status === 502
      ) {
        await new Promise(resolve => setTimeout(resolve, 900));
        result = await callGemini(message, env.GEMINI_API_KEY);
      }

      if (!result.response.ok) {
        const details = safeDetails(result.result);
        return send(
          publicError(result.response.status, details),
          result.response.status
        );
      }

      const reply = result.result?.candidates?.[0]?.content?.parts
        ?.map(part => typeof part.text === "string" ? part.text : "")
        .join("")
        .trim();

      if (!reply) {
        const reason =
          result.result?.promptFeedback?.blockReason ||
          "Gemini returned an empty response.";

        return send({
          error: "Empty AI response",
          details: String(reason)
        }, 502);
      }

      return send({ reply });

    } catch (error) {
      return send({
        error: "Worker network error",
        details: "Cloudflare could not reach Gemini. Please try again."
      }, 502);
    }
  }
};
