export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method !== "POST") {
      return Response.json(
        { error: "Only POST requests are allowed" },
        { status: 405, headers: cors }
      );
    }

    try {
      const body = await request.json();
      const message = String(body.message || "").trim();

      if (!message) {
        return Response.json(
          { error: "Message is empty" },
          { status: 400, headers: cors }
        );
      }

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          encodeURIComponent(env.GEMINI_API_KEY),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are AURA, a helpful personal AI assistant. Reply naturally in Hindi when the user speaks Hindi and in English when the user speaks English. Keep answers clear and useful."
              }]
            },
            contents: [{
              parts: [{ text: message }]
            }]
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return Response.json(
          { error: data.error?.message || "AI service error" },
          { status: response.status, headers: cors }
        );
      }

      const reply =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "माफ कीजिए, अभी जवाब नहीं मिल पाया।";

      return Response.json({ reply }, { headers: cors });

    } catch (error) {
      return Response.json(
        { error: "Server error: " + error.message },
        { status: 500, headers: cors }
      );
    }
  }
};
