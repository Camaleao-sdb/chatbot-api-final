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

    // ✅ Only check for learnerText when role is Jim
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
You are Luana, a tactical advisor providing a debrief to the officer at the end of a negotiation.

Jim’s final message was: "${jimReply}"

Speak directly to the officer. Give a brief, supportive comment (max 200 characters).
Mention one strength and one thing they can improve next time.

Avoid robotic tone or scripting. Keep it real.

Return only this:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Give the officer a quick debrief based on how the negotiation ended.`;
      } else {
        systemPrompt = `
You are Luana, a calm and supportive tactical advisor.

Jim just said: "${jimReply}"

Speak directly to the officer in a warm tone. Offer short, human advice (max 200 characters) on how to improve their communication right now.

Do NOT write dialogue. Do NOT suggest phrases.
Focus on tone, patience, and empathy.

Return only this:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Coach the officer on what to do next to improve the negotiation.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed person in a tense conversation with a police officer.

Respond in 1–2 emotional sentences (under 200 characters).
Then return an updated emotional state from -3 to +3.

✅ If the officer speaks with empathy, patience, or validation, respond more positively.
❌ If they command, challenge, or dismiss your concerns, escalate emotionally.

Officer’s message: "${learnerText}"

Stay in character. Never explain emotions. Never mention scores.

Return this JSON only:
{
  "jimReply": "[Jim's short reply]",
  "jimState": [new number from -3 to 3]
}
`;
      userPrompt = `Update Jim's emotional state and reply based on the officer's tone and message.`;
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
          luanaFeedback: parsed.luanaFeedback || "You're improving. Just keep listening and adjusting.",
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
