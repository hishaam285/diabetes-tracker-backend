require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const nutrition = JSON.parse(cleaned);

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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `This is a photo of a glucometer (blood glucose meter) display. Read the numeric glucose value and unit shown on the screen.

Respond with ONLY valid JSON, no other text, no markdown fences. Format:
{ "value": number or null, "unit": "mg/dL" or "mmol/L" or null, "confident": true or false }

If you cannot clearly read a number, return value: null and confident: false.`,
            },
          ],
        },
      ],
    });

    const rawText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);

    res.json(result);
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
  console.log(`   Accessible on your network at http://192.168.100.214:${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/health`);
  console.log(`   Meal route   → POST http://localhost:${PORT}/meal-nutrition`);
  console.log(`   Image route  → POST http://localhost:${PORT}/read-glucose-image`);
});