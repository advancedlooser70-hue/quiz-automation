// generator.js
import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// STRICT Instruction to ensure buttons and scoring work perfectly
const SYSTEM_INSTRUCTION = `
You are a quiz generator API. 
Analyze the provided meeting minutes (MOM) and generate exactly 10 multiple-choice questions.

RULES:
1. Return ONLY a raw JSON array. No text before or after.
2. Each question MUST have exactly 4 options.
3. 'correctIndex' must be 0, 1, 2, or 3.

JSON STRUCTURE:
[
  { 
    "id": 1, 
    "question": "Question text here?", 
    "options": ["Red Option", "Blue Option", "Green Option", "Yellow Option"], 
    "correctIndex": 0 //MUST be the integer index (0-3) of the correct option
  }
]
`;

// Helper function to pause execution (for retries)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateQuiz(momText) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
        try {
            console.log(`🔄 Sending to AI (Attempt ${attempts + 1}/${maxAttempts})...`);

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash", // Using 1.5-flash for speed and stability
                contents: momText,
                config: {
                    systemInstruction: SYSTEM_INSTRUCTION,
                    responseMimeType: "application/json",
                },
            });
            
            // Clean the output (Remove markdown if AI adds it)
            let rawText = response.text.trim();
            if (rawText.startsWith('```json')) {
                rawText = rawText.replace(/^```json/, '').replace(/```$/, '');
            } else if (rawText.startsWith('```')) {
                rawText = rawText.replace(/^```/, '').replace(/```$/, '');
            }

            // Parse JSON
            const quizData = JSON.parse(rawText);

            // Validate data to protect the buttons
            if (!Array.isArray(quizData) || !quizData[0].options) {
                throw new Error("Invalid Data Structure received");
            }

            console.log("✅ Quiz generated successfully!");
            return quizData;

        } catch (error) {
            console.error(`❌ Attempt ${attempts + 1} failed: ${error.message}`);
            attempts++;
            
            if (attempts < maxAttempts) {
                console.log("⏳ Waiting 2 seconds before retry...");
                await wait(2000); // Wait 2s before retrying
            } else {
                console.error("💀 All AI attempts failed.");
                return null;
            }
        }
    }
}

export { generateQuiz };