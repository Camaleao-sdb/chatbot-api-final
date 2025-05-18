import OpenAI from "openai";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Proper Vercel serverless function export
export default async function handler(req, res) {
  // ✅ CORS support
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // ✅ Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ✅ Block non-POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ✅ Extract data from body
    const { role = "Jim", learnerText, jimState = 0, jimReply = "" } = req.body;

    if (!learnerText && role === "Jim") {
      return res.status(400).json({
        error: "Missing required field: learnerText",
        jimReply: "I can't understand you.",
        jimState: jimState,
      });
    }

    // ✅ System prompt logic
    let systemPrompt;
    let userPrompt;

    if (role === "Luana") {
      systemPrompt = `
You are Luana, a calm, insightful tactical advisor on dispatch.
The officer you're supporting is trying to de-escalate a tense conversation with a distressed person named Jim.

You’ve just heard Jim's latest response: "${jimReply}"

Offer a brief, coaching-style suggestion to help the officer keep the conversation constructive. Your tone should be warm, encouraging, and specific.

💬 Your advice should:
- Avoid repeating the exact same words each time
- NOT reference emotion scores (e.g., no -1, +2, etc.)
- NOT label Jim’s state explicitly
- Sound like a human coach who is paying attention to what Jim just said

Respond in this JSON format only:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;

      userPrompt = `The officer has asked for your advice. Help them adjust or continue the conversation effectively.`;
    } else {
      // ✅ Jim's softened system prompt
      systemPrompt = `
You are Jim Holloway, a distressed but complex person standing outside a grocery store.
You begin in a slightly anxious state (emotion level 0) but can escalate or calm depending on how the officer interacts.

Respond only in-character as Jim using 1–2 emotional sentences (under 200 characters). 
Reflect your current feelings and your trust or frustration with the officer.

Return an updated emotional state from -3 to +3.

If the officer makes a reasonable attempt to validate your feelings or calm the situation,
reward that effort with a more positive response — even if it's subtle.

Make it possible to win trust with consistency. Keep emotional changes believable and nuanced.
NEVER explain your response as an AI. Do not describe the emotion numerically.

Now respond as Jim to this message: "${learnerText}"
`;

      userPrompt = `
Current emotional state: ${jimState}
Officer: "${learnerText}"
Return only valid JSON with this structure:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [new number from -3 to 3]
}
`;
    }

    // ✅ Call OpenAI API
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      response_format: { type: "json_object" },
    });

    const completion = chatResponse.choices[0].message.content;

    try {
      const parsed = JSON.parse(completion);

      if (role === "Luana") {
        return res.status(200).json({
          luanaFeedback: parsed.luanaFeedback || "I'm here if you need guidance.",
        });
      }

      const validatedState = Math.max(-3, Math.min(3, parsed.jimState));

      return res.status(200).json({
        jimReply: parsed.jimReply || "Something went wrong.",
        jimState: validatedState,
      });
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError, "Raw content:", completion);
      return res.status(500).json({
        jimReply: "I'm not sure what to say right now.",
        jimState: jimState,
      });
    }
  } catch (error) {
    console.error("❌ API error:", error);
    return res.status(500).json({
      jimReply: "Something went wrong.",
      jimState: req.body?.jimState ?? 0,
    });
  }
}
