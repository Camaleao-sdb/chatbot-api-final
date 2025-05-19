import OpenAI from "openai";

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

    let systemPrompt;
    let userPrompt;

    if (role === "Luana") {
      if (context === "final") {
        systemPrompt = `
You are Luana, a tactical advisor debriefing the officer.

Jim’s final message was: "${jimReply}"

Give brief feedback (max 200 characters). One strength, one thing to improve.

Return only:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give feedback based on Jim’s final words.`;
      } else {
        systemPrompt = `
You are Luana, a tactical advisor.

Jim just said: "${jimReply}"

Give a quick (max 200 characters) tip to the officer to help them adjust their tone.

Return only:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer based on Jim’s latest message.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed man speaking with a police officer.

Respond in 1–2 emotional sentences (max 200 characters).
Then return your updated emotional state from -3 to +3.

Officer said: "${learnerText}"

Return only:
{
  "jimReply": "[Jim's reply]",
  "jimState": [number from -3 to 3]
}
`;
      userPrompt = `Respond as Jim and update your state.`;
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
          luanaFeedback: parsed.luanaFeedback || "Good effort. Keep your tone steady and let him speak.",
        });
      }

      return res.status(200).json({
        jimReply: parsed.jimReply || "I'm not sure what to say.",
        jimState: Math.max(-3, Math.min(3, parsed.jimState)),
      });
    } catch {
      return res.status(500).json({
        jimReply: "I'm not sure what to say right now.",
        jimState: jimState,
      });
    }
  } catch {
    return res.status(500).json({
      jimReply: "Something went wrong.",
      jimState: 0,
    });
  }
}
