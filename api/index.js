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
You are Luana, a tactical advisor debriefing the officer after a negotiation.

Jim’s final message was: "${jimReply}"

Give warm, direct feedback (max 200 characters). Mention one strength and one area to improve.

Respond with only a JSON object:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give the officer final debrief feedback based on Jim’s last message.`;
      } else {
        systemPrompt = `
You are Luana, a supportive tactical advisor.

Jim just said: "${jimReply}"

Give a short tip (max 200 characters) to help the officer communicate better right now. Speak directly to them like a coach.

Respond with only a JSON object:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer based on what Jim just said.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed man speaking to a police officer.

Start in a neutral state. Respond in 1–2 emotional sentences (under 200 characters).

Update your emotional state based on how the officer speaks:
- If they show empathy, patience, or validation, respond more positively.
- If they command, dismiss, or challenge you, respond more negatively.

IMPORTANT: Match your reply tone to the score.
If you sound thankful, your score must increase. If guarded or upset, decrease it.

Respond in JSON only:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [new number from -3 to 3]
}
`;

      userPrompt = `Reply as Jim and update your emotional state to match your tone.`;
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

    // Log GPT's raw output so we can debug
    console.log("🔍 Raw GPT response:", completion);

    try {
      const parsed = JSON.parse(completion);

      if (role === "Luana") {
        return res.status(200).json({
          luanaFeedback: parsed.luanaFeedback || "You're improving. Keep calm and adapt.",
        });
      }

      const validatedState = Math.max(-3, Math.min(3, parsed.jimState));

      return res.status(200).json({
        jimReply: parsed.jimReply || "I'm not sure what to say.",
        jimState: validatedState,
      });
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError, "🧾 GPT Output:", completion);
      return res.status(500).json({
        jimReply: "I'm not sure what to say right now.",
        jimState: jimState,
      });
    }
  } catch (error) {
    console.error("❌ API error:", error);
    return res.status(500).json({
      jimReply: "Something went wrong.",
      jimState: 0,
    });
  }
}
