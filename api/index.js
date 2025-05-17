import OpenAI from "openai";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Proper Vercel serverless function export
export default async function handler(req, res) {
  // ✅ Add CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Respond to preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST beyond this point
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract data from request body
    const { learnerText, jimState = 0 } = req.body;

    if (!learnerText) {
      return res.status(400).json({
        error: 'Missing required field: learnerText',
        jimReply: "I can't understand you.",
        jimState: jimState
      });
    }

    const systemPrompt = `
You are Jim Holloway, a distressed but complex person standing outside a grocery store.
You begin in a slightly anxious state (emotion level 0) but can escalate or calm depending on how the officer interacts.
Rules:
- Respond only in-character as Jim, not as an AI.
- Keep replies under 100 characters. Speak like a real person in short, emotional sentences.
- Always return a new emotion state between -3 (furious) and +3 (emotionally moved).
- NEVER explain yourself. Just reply and update your emotional state.
Behavior scale:
+2 = deeply moved, beginning to trust
+1 = more relaxed, feeling heard
 0 = neutral, uncertain
-1 = irritated, cautious
-2 = defensive, agitated
-3 = enraged or shut down
Now reply to the officer's message and update your emotional state.
`;

    const userPrompt = `
Current emotional state: ${jimState}
Officer: "${learnerText}"
Jim's reply (short, emotional) and updated state based on the message.
Return only valid JSON with this structure:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [new number from -3 to 3]
}
`;

    // Call OpenAI API
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.85,
      response_format: { type: "json_object" } // Ensure JSON response
    });

    // Extract response
    const completion = chatResponse.choices[0].message.content;

    try {
      const parsed = JSON.parse(completion);
      const validatedState = Math.max(-3, Math.min(3, parsed.jimState));

      return res.status(200).json({
        jimReply: parsed.jimReply || "Something went wrong.",
        jimState: validatedState
      });
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError, "Raw content:", completion);
      return res.status(500).json({
        jimReply: "I'm not sure what to say right now.",
        jimState: jimState
      });
    }
  } catch (error) {
    console.error("❌ API error:", error);
    return res.status(500).json({
      jimReply: "Something went wrong.",
      jimState: req.body?.jimState ?? 0
    });
  }
}
