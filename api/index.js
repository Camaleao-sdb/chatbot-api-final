import OpenAI from "openai";

// Initialize OpenAI client with better error handling for API key
const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("❌ OpenAI API key is missing");
    throw new Error("OpenAI API key is not configured");
  }
  return new OpenAI({ apiKey });
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let openai;
  try {
    // Get OpenAI client or throw informative error
    openai = getOpenAIClient();
  } catch (err) {
    console.error("❌ OpenAI Client Error:", err.message);
    return res.status(500).json({
      error: "API configuration error",
      jimReply: "Connection issue. Please try again later.",
      jimState: 0,
      luanaFeedback: "We're experiencing technical difficulties."
    });
  }

  try {
    // Parse and validate request body with enhanced error reporting
    let body;
    try {
      body = req.body;
      if (typeof body === "string") {
        body = JSON.parse(body);
      }
    } catch (err) {
      console.error("❌ Request Body Parse Error:", err.message);
      return res.status(400).json({ error: "Invalid request format" });
    }

    // Extract parameters with validation
    const {
      role = "Jim",
      learnerText = "",
      jimState = 0,
      jimReply = "",
      context = "live"
    } = body;

    console.log(`📝 Processing request: role=${role}, context=${context}, jimState=${jimState}`);

    // Prepare prompts based on role
    let systemPrompt = "";
    let userPrompt = "";

    if (role === "Luana") {
      if (context === "final") {
        systemPrompt = `You are Luana, a tactical advisor for police crisis negotiation training.
        
Your task is to provide a final debrief summary based on the scenario's conclusion.

CONTEXT:
- Jim's final statement: "${jimReply || "No final statement available"}"
- Jim's final emotional state: ${jimState} (scale: -3 furious to +3 relieved)

INSTRUCTIONS:
1. Provide ONE clear strength in the officer's approach
2. Suggest ONE specific area for improvement
3. Keep your feedback under 200 characters
4. Be supportive but direct

YOU MUST respond in this exact JSON format:
{"luanaFeedback": "your brief feedback here"}`;

        userPrompt = `Provide final debrief feedback on the officer's performance.`;
      } else {
        systemPrompt = `You are Luana, a tactical advisor for police crisis negotiation training.
        
Your task is to provide real-time coaching to the officer during the scenario.

CONTEXT:
- Jim just said: "${jimReply || "No reply available"}"
- Jim's current emotional state: ${jimState} (scale: -3 furious to +3 relieved)

INSTRUCTIONS:
1. Provide ONE actionable coaching tip
2. Focus on improving the officer's next response
3. Keep your advice under 200 characters
4. Be supportive but direct

YOU MUST respond in this exact JSON format:
{"luanaFeedback": "your coaching tip here"}`;

        userPrompt = `Provide a tactical coaching tip based on the current situation.`;
      }
    } else {
      // Validate learnerText is present for Jim role
      if (!learnerText) {
        console.warn("⚠️ Empty learnerText for Jim role");
      }

      systemPrompt = `You are Jim Holloway, a distressed civilian in a crisis negotiation scenario.
      
Your task is to respond emotionally to the officer's communication.

CONTEXT:
- The officer just said: "${learnerText || "The officer is waiting for your response"}"
- Your current emotional state is: ${jimState} (scale: -3 furious to +3 relieved)

INSTRUCTIONS:
1. Respond authentically as Jim in under 200 characters
2. Adjust your emotional state based on the officer's approach
3. If the officer is empathetic and validating, move your state in a positive direction
4. If the officer is dismissive or confrontational, move your state in a negative direction
5. Stay within the -3 to +3 range

YOU MUST respond in this exact JSON format without any additional text:
{"jimReply": "your in-character response here", "jimState": number}

The "jimState" MUST be a whole number between -3 and 3, inclusive.`;

      userPrompt = `Respond to the officer as Jim Holloway.`;
    }

    console.log(`🔄 Calling OpenAI API for role: ${role}`);

    // Make API call with improved error handling
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
      temperature: 0.7, // Slightly lower temperature for more consistent results
      response_format: { type: "json_object" }, // Updated format syntax
      max_tokens: 300, // Limit token usage
    }).catch(err => {
      console.error("❌ OpenAI API Error:", err.message);
      throw new Error(`OpenAI API call failed: ${err.message}`);
    });

    // Extract and validate raw content
    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("❌ No content received from OpenAI.");
      throw new Error("Empty response from OpenAI");
    }

    console.log("🧠 Raw OpenAI response:", rawContent);

    // Parse JSON with enhanced validation
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
      
      // Validate expected fields exist
      if (role === "Luana" && typeof parsed.luanaFeedback !== "string") {
        console.error("❌ Missing luanaFeedback in response:", parsed);
        throw new Error("Invalid Luana response format");
      }
      
      if (role === "Jim") {
        if (typeof parsed.jimReply !== "string") {
          console.error("❌ Missing jimReply in response:", parsed);
          throw new Error("Invalid Jim response format");
        }
        
        if (typeof parsed.jimState !== "number" || 
            parsed.jimState < -3 || 
            parsed.jimState > 3) {
          console.error("❌ Invalid jimState in response:", parsed);
          parsed.jimState = Math.max(-3, Math.min(3, jimState || 0));
        }
      }
    } catch (err) {
      console.error("❌ JSON Parse Error:", err.message, "Raw:", rawContent);
      throw new Error(`Failed to parse OpenAI response: ${err.message}`);
    }

    // Return sanitized response based on role
    if (role === "Luana") {
      return res.status(200).json({
        luanaFeedback: parsed.luanaFeedback || "Focus on active listening and validating emotions.",
      });
    } else {
      return res.status(200).json({
        jimReply: parsed.jimReply || "I need a moment to gather my thoughts.",
        jimState: Math.round(Math.max(-3, Math.min(3, parsed.jimState))),
      });
    }
  } catch (err) {
    // Global error handler with role-specific fallbacks
    console.error("❌ Server Error:", err.message);
    
    const role = req.body?.role || "Unknown";
    
    // Provide graceful degradation with role-specific defaults
    if (role === "Luana") {
      return res.status(500).json({
        error: "Internal server error",
        luanaFeedback: "Technical issue. Focus on validating emotions and maintaining rapport."
      });
    } else {
      return res.status(500).json({
        error: "Internal server error",
        jimReply: "I'm not able to respond right now.",
        jimState: req.body?.jimState || 0
      });
    }
  }
}