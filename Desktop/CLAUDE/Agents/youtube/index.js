const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = "dB9f4B02ocpTICIEY";

async function fetchTranscript(videoUrl) {
  const apiUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: [videoUrl],
      includeTimestamps: "Yes",
    }),
  });

  if (!response.ok) {
    throw new Error(`Apify API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.length === 0 || !data[0].text) {
    throw new Error("No transcript found for this video");
  }

  return data[0].text;
}

app.post("/summarise", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "YouTube URL is required" });
  }

  try {
    // Step 1: Fetch transcript from Apify
    const transcript = await fetchTranscript(url);

    // Step 2: Summarise transcript with Gemini
    let summary = null;
    try {
      const prompt = `You are a professional research analyst.

Summarize the following YouTube video transcript in a concise but insightful way.

Requirements:
- Write 1 well-structured paragraph (150–250 words).
- Start by describing the context or situation that prompted the video.
- Clearly identify the central argument or thesis.
- Briefly explain how the speaker supports their argument (examples, stories, frameworks).
- Highlight the key themes or principles discussed.
- End with the core takeaway or conclusion.

Tone:
- Analytical, not motivational.
- Clear and structured.
- No bullet points.
- No fluff.
- No repetition.
- Do not restate obvious details.

After the summary, give me different thoughts and information that are in this transcript, making them as different chapters. Each chapter heading MUST include the starting timestamp from the transcript in this exact format: ## [M:SS] Chapter Title (e.g. ## [2:35] The Power of Habits). Use the closest timestamp from the transcript for when that topic begins. Follow each heading with the summary of that information with these requirements:

Requirements:
- Write 1 well-structured paragraph (75–150 words).
- Clearly identify the central argument or thesis.
- Briefly explain how the speaker supports their argument (examples, stories, frameworks).
- Highlight the key themes or principles discussed.
- End with the core takeaway or conclusion.

Tone:
- Analytical, not motivational.
- Clear and structured.
- No bullet points.
- No fluff.
- No repetition.
- Do not restate obvious details.

Transcript:
${transcript}`;
      const result = await model.generateContent(prompt);
      summary = result.response.text();
    } catch (aiErr) {
      console.error("Gemini error:", aiErr.message);
    }

    res.json({ summary, transcript });
  } catch (err) {
    console.error(err);
    const message = err.message.includes("No transcript")
      ? err.message
      : "Failed to fetch transcript";
    res.status(500).json({ error: message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
