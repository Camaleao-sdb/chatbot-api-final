import OpenAI from "openai";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Proper Vercel serverless function export
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { role = "Jim", learnerText, jimState = 0, jimReply = "", context = "live" } = req.body;

    if (!learnerText && role === "Jim") {
      return res.status(400).json({
        error: "Missing required field: learnerText",
        jimReply: "I can't understand you.",
        jimState,
      });
    }

    let systemPrompt;
    let userPrompt;

    if (role === "Luana") {
      if (context === "final") {
        systemPrompt = `
You are Luana, a tactical advisor providing a short debrief after a negotiation scenario has ended.

Jim’s final response was: "${jimReply}"

Give short (200–300 character max), thoughtful feedback. 
Mention one thing the officer did well, and one area to grow. 
Do not reference emotional scores or sound like a robot. Speak as a warm, supportive coach.

Respond in JSON format only:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Offer a warm debrief comment that reflects on the officer's overall performance.`;
      } else {
        systemPrompt = `
You are Luana, a calm and supportive tactical advisor on dispatch.

You just heard Jim say: "${jimReply}"

Give a brief coaching tip (200–300 characters max) to help the officer handle the conversation.
Avoid emotion scores. Do not repeat advice. Keep it clear, specific, and warm.

Respond only with JSON like this:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Offer an in-the-moment tip to help guide the officer's next move.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed but complex person standing outside a grocery store.
You begin in a slightly anxious state (emotion level 0) but can escalate or calm depending on how the officer interacts.

Respond in-character with 1–2 emotional sentences (under 200 characters). 
Reflect your current trust or tension level with the officer.

Return an updated emotional state from -3 to +3.

If the officer shows basic empathy, patience, or validation — show some improvement. 
Reward effort. Emotional changes should feel believable.

Do NOT mention emotion scores. Do NOT explain your mood. Stay fully in character.

Now respond as Jim to: "${learnerText}"
`;

      userPrompt = `
Current emotional state: ${jimState}
Officer: "${learnerText}"
Return JSON only:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [new number from -3 to 3]
}
`;
    }

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
          luanaFeedback: parsed.luanaFeedback || "You're doing your best — keep adapting.",
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
        jimState,
      });
    }
  } catch (error) {
    console.error("❌ API error:", error);
    return res.status(500).json({
      jimReply: "Something went wrong.",
      jimState,
    });
  }
}
