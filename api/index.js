import OpenAI from "openai";

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      role = "Jim",
      learnerText = "",
      jimState = 0,
      jimReply = "",
      context = "live"
    } = req.body;

    if (role === "Jim" && !learnerText) {
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
You are Luana, a calm and supportive tactical advisor giving a debrief to a junior officer.

Jim’s final words were: "${jimReply}"

Give warm, encouraging feedback (max 200 characters). Highlight one strength and one improvement point.

Return only:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give a short debrief based on Jim’s final reply.`;
      } else {
        systemPrompt = `
You are Luana, a calm and trusted tactical advisor.

Jim just said: "${jimReply}"

Speak directly to the officer (max 200 characters).
Offer a quick, human coaching tip — how to adjust tone, pacing, or empathy.

Return only:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Give brief, in-the-moment coaching to the officer.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed man in a tense conversation with a police officer.

Reply in 1–2 emotional sentences (max 200 characters).
Then return your updated emotional state from -3 to +3.

✅ If the officer sounds calm, understanding, or patient — respond more positively.
❌ If they rush, pressure, or talk down — sound more closed or upset.

Match your tone to your score. Never mention your emotions or score directly.

Officer said: "${learnerText}"

Return only:
{
  "jimReply": "[Jim's emotional reply]",
  "jimState": [number from -3 to 3]
}
`;
      userPrompt = `Reply as Jim and update your emotional state to reflect the officer’s message.`;
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
          luanaFeedback: parsed.luanaFeedback || "You're steady under pressure. Try softening your delivery next time.",
        });
      }

      const validatedState = Math.max(-3, Math.min(3, parsed.jimState));

      return res.status(200).json({
        jimReply: parsed.jimReply || "I'm not sure what to say.",
        jimState: validatedState,
      });
    } catch (parseError) {
      return res.status(500).json({
        jimReply: "I'm not sure what to say right now.",
        jimState: jimState,
      });
    }
  } catch (error) {
    return res.status(500).json({
      jimReply: "Something went wrong.",
      jimState: jimState,
    });
  }
}
