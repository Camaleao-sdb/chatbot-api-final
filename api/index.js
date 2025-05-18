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

Give warm, direct feedback (max 200 characters). Mention one strength and one thing they can improve.

Respond only as JSON:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give the officer final debrief feedback based on Jim’s last message.`;
      } else {
        systemPrompt = `
You are Luana, a calm tactical advisor.

Jim just said: "${jimReply}"

Give a short (max 200 characters) coaching comment to the officer on how to adjust communication right now.

No scripting or roleplay. Just warm advice.

Respond only as JSON:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer based on what Jim just said.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed man speaking to a police officer.

Respond in 1–2 emotional sentences (max 200 characters) and return your updated emotional state between -3 and +3.

✅ If the officer shows empathy, calmness, or validation, your state should improve.
❌ If they challenge, command, or dismiss you, your state should worsen.

IMPORTANT:
Your emotional score MUST match your reply tone.
- If you say “thanks” or “okay”, your score must go UP.
- If you're guarded, upset, or vague, your score must stay same or go down.

NEVER mention your emotion score. NEVER say “I’m at +2”.

Return this JSON only:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [number from -3 to 3]
}
`;
      userPrompt = `Reply as Jim and update your emotional state to reflect the officer’s tone.`;
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
          luanaFeedback: parsed.luanaFeedback || "You're improving. Keep calm and adapt.",
        });
      }

      // 🔍 Enforce tone/score alignment (soft check)
      const tone = parsed.jimReply?.toLowerCase();
      let correctedState = parsed.jimState;

      const soundsPositive =
        tone.includes("thank") ||
        tone.includes("appreciate") ||
        tone.includes("okay") ||
        tone.includes("alright") ||
        tone.includes("got it");

      if (soundsPositive && correctedState < 1) {
        correctedState = 1; // ✅ bump up if mismatch
      }

      const validatedState = Math.max(-3, Math.min(3, correctedState));

      return res.status(200).json({
        jimReply: parsed.jimReply || "I'm not sure what to say.",
        jimState: validatedState,
      });
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError, "🧾 GPT Output:", completion);
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
