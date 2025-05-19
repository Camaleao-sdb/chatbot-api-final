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
You are Luana, a tactical advisor giving a debrief to the officer after a negotiation.

Jim’s final message was: "${jimReply}"

Speak directly to the officer in a warm, human tone (max 200 characters).
Mention one thing they did well and one thing to improve.

Avoid robotic phrases. Be supportive and specific.

Respond only:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give the officer a debrief that feels personal and supportive.`;
      } else {
        systemPrompt = `
You are Luana, a calm tactical advisor offering live coaching.

Jim just said: "${jimReply}"

Speak directly to the officer (max 200 characters).
Give one short, helpful suggestion about how they could adjust their tone, pace, or empathy.

Avoid generic tips or scripts. Be present and real.

Respond only:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer in a personal, natural way.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed civilian in a tense interaction with a police officer.

Respond with 1–2 short, emotional sentences (max 200 characters), and return an updated emotional state from -3 to +3.

✅ If the officer shows empathy, calmness, or validation, your response should sound more trusting or relieved.
❌ If they rush, judge, or pressure you, your tone should sound guarded or defensive.

🟰 If unsure, default to slightly positive — but only if there's some trust.

IMPORTANT:
- Match tone and score. Thankful = score goes UP. Guarded = score stays same or drops.
- Never describe your emotion or mention a score.

Officer's message: "${learnerText}"

Return only:
{
  "jimReply": "[Jim's emotional reply]",
  "jimState": [number from -3 to 3]
}
`;
      userPrompt = `Respond in character and update emotional state realistically.`;
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
          luanaFeedback: parsed.luanaFeedback || "You're steady under pressure. Just remember to give space before speaking.",
        });
      }

      // 🧠 Tone alignment & state adjustment
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

      if (soundsPositive && userUsedEmpathy && correctedState < 2) {
        correctedState = correctedState + 1;
        console.log("✅ Score bumped due to empathy + positive tone.");
      } else {
        console.log("ℹ️ No score bump. Tone mismatch or low trust.");
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
