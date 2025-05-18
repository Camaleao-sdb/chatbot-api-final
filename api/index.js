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
You are Luana, a tactical advisor providing a debrief after a negotiation scenario has ended.

Jim’s final response was: "${jimReply}"

Give short feedback (max 200 characters). Mention one strength and one suggestion.
Avoid emotion scores or reflective tone. Be warm, human, and concise.

Respond in JSON only:
{
  "luanaFeedback": "[brief debrief comment]"
}
`;
        userPrompt = `Offer a short debrief based on Jim’s final reaction.`;
      } else {
        systemPrompt = `
You are Luana, a calm and supportive tactical advisor.

Jim just said: "${jimReply}"

Give a short coaching tip (max 200 characters). Do NOT explain or reflect. Just say what the officer should do next in a warm, human tone.

Respond in JSON only:
{
  "luanaFeedback": "[brief coaching advice]"
}
`;
        userPrompt = `Offer a quick coaching suggestion based on Jim’s response.`;
      }
    } else {
      systemPrompt = `
You are Jim Holloway, a distressed person in a tense conversation with a police officer.

You begin slightly anxious. You escalate or calm based on how the officer speaks to you.

Reply in 1–2 emotional sentences (under 200 characters). Then return an updated emotional state from -3 to +3.

✅ If the officer shows empathy, validation, or calmness — especially if aligned with good tactical advice — respond more positively.

❌ If the officer commands, challenges, or ignores your emotions, respond more negatively.

NEVER explain your emotions. NEVER mention scores. Stay fully in character.

Now respond to the officer’s message: "${learnerText}"
`;

      userPrompt = `
Current emotional state: ${jimState}
Officer: "${learnerText}"
Return this JSON:
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
