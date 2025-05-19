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

    let systemPrompt;
    let userPrompt;

    if (role === "Luana") {
      if (context === "final") {
        systemPrompt = `
You are Luana, a calm tactical advisor.

Jim just finished speaking: "${jimReply}"

Give short, personal debrief (max 200 characters).
Mention one thing done well and one thing to improve.

Respond only:
{
  "luanaFeedback": "[brief feedback]"
}
`;
        userPrompt = `Summarize and support the officer’s effort with brief feedback.`;
      } else {
        systemPrompt = `
You are Luana, a calm advisor.

Jim just said: "${jimReply}"

Give one quick coaching tip (max 200 characters) the officer could apply now.

Respond only:
{
  "luanaFeedback": "[brief coaching tip]"
}
`;
        userPrompt = `Give short coaching for what the officer should try next.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed man.

Officer said: "${learnerText}"

Reply in 1–2 emotional sentences (under 200 characters).
Then return your new emotional state from -3 (furious) to +3 (relieved).

Respond only:
{
  "jimReply": "[Jim's reply]",
  "jimState": [number from -3 to 3]
}
`;
      userPrompt = `Reply as Jim and give your new emotional state.`;
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

    // 🧪 DEBUG: Show GPT's full response before parsing
    console.log("🧾 GPT Raw Completion:", completion);

    try {
      const parsed = JSON.parse(completion);

      if (role === "Luana") {
        return res.status(200).json({
          luanaFeedback: parsed.luanaFeedback || "You stayed steady. Try listening a little longer before responding.",
        });
      }

      return res.status(200).json({
        jimReply: parsed.jimReply || "I'm not sure what to say.",
        jimState: Math.max(-3, Math.min(3, parsed.jimState)),
      });
    } catch (parseError) {
      console.error("❌ JSON parsing error:", parseError, "🧾 GPT Output:", completion);

      if (role === "Luana") {
        return res.status(200).json({
          luanaFeedback: "I'm here if you need guidance.",
        });
      }

      return res.status(200).json({
        jimReply: "Something went wrong, but I’m trying to stay calm.",
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
