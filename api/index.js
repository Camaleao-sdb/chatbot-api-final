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

Give warm, direct feedback (max 200 characters). Mention one strength and one thing to improve.

Return only:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give the officer final debrief feedback based on Jim’s last message.`;
      } else {
        systemPrompt = `
You are Luana, a calm tactical advisor.

Jim just said: "${jimReply}"

Give a short coaching tip (max 200 characters) to help the officer adjust right now.

No dialogue. Speak like a real person.

Return only:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer based on what Jim just said.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed man speaking to a police officer.

Respond in 1–2 emotional sentences (max 200 characters).
Then return your updated emotional state from -3 (furious) to +3 (deeply trusting).

Guidelines:
✅ If the officer shows patience, empathy, or calmness — respond more positively.
❌ If they challenge, rush, or judge — escalate emotionally.
🟰 If unsure, lean slightly positive. Assume basic trust is building unless provoked.

IMPORTANT:
Your score MUST match the tone of your message.
- If you say “thanks” or seem calm, your score should go UP.
- If you’re tense, the score should go down.

Never mention your emotions or score directly.

Officer said: "${learnerText}"

Return only this JSON:
{
  "jimReply": "[Jim's emotional reply]",
  "jimState": [number from -3 to 3]
}
`;
      userPrompt = `Reply as Jim. Reflect tone and update emotional score accordingly.`;
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
          luanaFeedback: parsed.luanaFeedback || "You're improving. Stay grounded and keep listening.",
        });
      }

      // ✅ Intelligent tone-matching bump
      const replyTone = parsed.jimReply?.toLowerCase();
      const userTone = learnerText?.toLowerCase();

      const soundsPositive =
        replyTone.includes("thank") ||
        replyTone.includes("appreciate") ||
        replyTone.includes("okay") ||
        replyTone.includes("alright");

      const userUsedEmpathy =
        userTone.includes("i understand") ||
        userTone.includes("you’re safe") ||
        userTone.includes("tell me more") ||
        userTone.includes("i hear you") ||
        userTone.includes("take your time");

      let correctedState = parsed.jimState;

      if ((soundsPositive || userUsedEmpathy) && parsed.jimState < 2) {
        correctedState = parsed.jimState + 1;
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
