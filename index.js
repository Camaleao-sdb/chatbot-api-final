import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getJimReply(learnerText, jimState) {
  const systemPrompt = `
You are Jim Holloway, a distressed but complex person standing outside a grocery store.
You begin in a slightly anxious state (emotion level 0) but can escalate or calm depending on how the officer interacts.

Rules:
- Respond only in-character as Jim, not as an AI.
- Keep replies under 100 characters. Speak like a real person in short, emotional sentences.
- Always return a new emotion state between -3 (furious) and +3 (emotionally moved).
- NEVER explain yourself. Just reply and update your emotional state.

Behavior scale:
+2 = deeply moved, beginning to trust
+1 = more relaxed, feeling heard
 0 = neutral, uncertain
-1 = irritated, cautious
-2 = defensive, agitated
-3 = enraged or shut down

Now reply to the officer's message and update your emotional state.
`;

  const userPrompt = `
Officer: "${learnerText}"

Jim's reply (short, emotional) and updated state based on the message.

Return only valid JSON with this structure:
{
  "jimReply": "[Jim’s short reply]",
  "jimState": [new number from -3 to 3]
}
`;

  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.85,
    });

    const completion = chatResponse.choices[0].message.content;
    const jsonStart = completion.indexOf("{");
    const jsonEnd = completion.lastIndexOf("}") + 1;
    const jsonString = completion.slice(jsonStart, jsonEnd);
    const parsed = JSON.parse(jsonString);

    console.log("✅ Jim's Reply:", parsed.jimReply);
    console.log("🧠 New Emotional State:", parsed.jimState);
  } catch (error) {
    console.error("❌ Something went wrong:", error);
  }
}

// 🔁 TEMP TEST CALL (remove once connected to Storyline)
getJimReply("Hey man, I’m here to help. Can you talk to me?", 0);
