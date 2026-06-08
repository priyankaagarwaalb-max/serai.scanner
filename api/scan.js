// /api/scan.js
// Vercel serverless function — Node runtime, 60s timeout.
// Proxies to Anthropic API. ANTHROPIC_API_KEY from Vercel env vars.

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    // Body is already parsed by Vercel for application/json
    const body = req.body;

    if (!body || !body.messages) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await anthropicRes.json();

console.error("Anthropic response:", JSON.stringify(data, null, 2));

return res.status(anthropicRes.status).json(data);
  } catch (err) {
    console.error("Scanner error:", err);
    return res.status(500).json({
      error: err.message || "Unknown error",
      stack: err.stack,
    });
  }
}