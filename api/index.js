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
    const { role = "Jim", learnerText, jimState = 0, jimReply = "", context = "live" } = req.body;

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
You are Luana, a tactical advisor giving a debrief to the officer after a difficult negotiation.

Jim’s final response was: "${jimReply}"

Speak directly to the officer like a trusted coach. Your comment must be:
- Short (max 200 characters)
- Warm and personal
- One thing they did well + one thing they can improve

No scores. No scriptwriting. No robotic tone.

Return only this:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give the officer a quick final debrief after hearing Jim's last response.`;
      } else {
        systemPrompt = `
You are Luana, a calm, trusted tactical advisor.

Jim just said: "${jimReply}"

Speak directly to the officer. Give a short (max 200 characters), helpful tip to improve how they communicate right now.

Do NOT write dialogue. Do NOT suggest phrases. Focus on tone and presence.

Return only this:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer on their approach using Luana’s voice.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed person talking to a police officer.

Your emotional state starts at 0 (neutral). It can go up or down depending on how the officer talks to you.

Respond in 1–2 emotional sentences (under 200 characters). Then return an updated emotional state from -3 to +3.

✅ If the officer shows empathy, calmness, or understanding, you feel better and move up.
❌ If they command, rush, or dismiss you, you feel worse and move down.

IMPORTANT: Your tone must match your state.
- If you say "thank you," your score must go UP.
- If you push back or sound guarded, your score should go DOWN.

NEVER explain emotions. NEVER say emotion scores out loud.

Officer’s message: "${learnerText}"

Return this:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [new number from -3 to 3]
}
`;
      userPrompt = `Respond as Jim and update his emotional state based on the officer’s tone.`;
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
          luanaFeedback: parsed.luanaFeedback || "You're growing. Keep staying steady and open.",
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
