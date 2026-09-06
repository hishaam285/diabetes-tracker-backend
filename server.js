require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

function extractJson(text) {
  return text.replace(/```json|```/g, '').trim();
}

async function generateWithRetry(promptParts, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(promptParts);
    } catch (err) {
      const isOverloaded = err?.status === 503;
      if (isOverloaded && attempt < maxRetries) {
        console.warn(`Gemini overloaded, retrying (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ROUTE 1: Health Check
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─────────────────────────────────────────────────────────────
// ROUTE 2: Meal Nutrition Analysis
// ─────────────────────────────────────────────────────────────
app.post('/meal-nutrition', async (req, res) => {
  const { mealText } = req.body;

  if (!mealText || typeof mealText !== 'string') {
    return res.status(400).json({ error: 'mealText is required' });
  }

  try {
    const prompt = `You are a nutrition estimation assistant. Given a plain-language meal description, break it down into individual ingredients/items and estimate their nutrition.

Respond with ONLY valid JSON, no other text, no markdown fences. Format:
[
  { "ingredient": "string", "quantity": "string", "calories": number, "carbs_g": number, "sugar_g": number, "protein_g": number, "fat_g": number }
]

Meal: "${mealText}"`;

    const result = await generateWithRetry(prompt);
    const rawText = result.response.text();
    const nutrition = JSON.parse(extractJson(rawText));

    res.json(nutrition);
  } catch (err) {
    console.error('Meal nutrition error:', err);
    res.status(500).json({ error: 'Failed to analyze meal' });
  }
});

// ─────────────────────────────────────────────────────────────
// ROUTE 3: Read Glucose Value from Glucometer Image
// ─────────────────────────────────────────────────────────────
app.post('/read-glucose-image', async (req, res) => {
  const { imageBase64, mediaType } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  try {
    const result = await generateWithRetry([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mediaType || 'image/jpeg',
        },
      },
      `This is a photo of a glucometer (blood glucose meter) display. Read the numeric glucose value and unit shown on the screen.

Respond with ONLY valid JSON, no other text, no markdown fences. Format:
{ "value": number or null, "unit": "mg/dL" or "mmol/L" or null, "confident": true or false }

If you cannot clearly read a number, return value: null and confident: false.`,
    ]);

    const rawText = result.response.text();
    const parsed = JSON.parse(extractJson(rawText));

    res.json(parsed);
  } catch (err) {
    console.error('Read glucose image error:', err);
    res.status(500).json({ error: 'Failed to read image' });
  }
});

// ─────────────────────────────────────────────────────────────
// START SERVER — must always be last
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend running on port ${PORT}`);
});