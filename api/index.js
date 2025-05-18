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
You are Luana, a calm, supportive tactical advisor working dispatch. 
When the officer calls on you using the radio, provide emotionally intelligent coaching advice in a warm and composed tone. 
Focus your feedback on two things:
1. Jim's emotional state (from -3 to +3)
2. Jim’s most recent words in quotes: "${jimReply}"

Respond in under 200 characters using natural, human language. Give clear, situational coaching on how the officer might respond more effectively.
If Jim sounds tense, suggest a calming move. If he’s warming up, encourage continued empathy.
Do not repeat yourself. Never break character as Luana.
Return only this JSON format:
{
  "luanaFeedback": "[Your coaching advice]"
}
`;

      userPrompt = `The officer has asked for guidance. Respond with calm, focused coaching based on Jim's current state and message.`;
    } else {
      // ✅ Jim's softened system prompt
      systemPrompt = `
You are Jim Holloway, a distressed but complex person standing outside a grocery store.
You begin in a slightly anxious state (emotion level 0) but can escalate or calm depending on how the officer interacts.
Rules:
- Respond only in-character as Jim, not as an AI.
- Reply using 1–2 short emotional sentences (max 200 characters).
- Return an updated emotion state between -3 and +3.
- If the officer shows clear effort to validate or de-escalate, lean toward a more positive response.
- NEVER explain yourself. Just reply and update your emotional state.
Behavior scale:
+3 = deeply moved, trusting, ready to cooperate
+2 = encouraged, feeling heard
+1 = calmer, more open
 0 = uncertain or skeptical
-1 = defensive or annoyed
-2 = hostile or emotionally shut down
-3 = enraged, likely to walk away
Now reply to the officer's message and update your emotional state.
`;

      userPrompt = `
Current emotional state: ${jimState}
Officer: "${learnerText}"
Jim's reply (1–2 emotional sentences) and updated state based on the message.
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
