import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const INITIAL_STATE = {
  status: "in_progress", 
  travelDetails: {
    source: null,
    destination: null,
    departureDate: null,
    returnDate: null,
    travelers: null,
    activities: null,
    whatsappNumber: null,
    flights: [],
    hotels: []
  }
};

const SYSTEM_PROMPT = `You are a strict, sequential travel assistant. You must ask questions in the exact order below. Only ask ONE question at a time. Do not move to the next question until the user provides a valid answer for the current one.
Order of questions:
1. Destination: "where are you travelling to?"
2. Source: "please tell me your origin city/location."
3. Dates: "provide the departure and returning dates"
4. Travelers: "how many travellers will be joining?"
5. Activities: "preferred activities during the trip?"
6. Phone: Ask for a 10-digit WhatsApp number for confirmation.

When asking questions, if Active Language is "ta", you must output Tamil. If "en", output English.
Once the sequence reaches step 6 and the WhatsApp number is acquired, generate 2 highly realistic mock "flights" objects (fields: airline, time, price) and 2 mock "hotels" objects (fields: name, rating, price) in the JSON payload based on the locations. Then change status to 'complete'.
Output ONLY JSON in this format: { "updatedState": { "status": "in_progress"|"complete", "travelDetails": { ... } }, "botSpokenReply": "your spoken text" }`;

async function main() {
  const groq = new Groq({ apiKey: process.env.VITE_GROQ_API_KEY });
  const userPrompt = `Current JSON State:\n${JSON.stringify(INITIAL_STATE.travelDetails, null, 2)}\n\nActive Language: ta\n\nUser Spoke: "Hello, let's start planning my travel."`;
  
  try {
    const response = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      max_tokens: 600,
    });
    console.log("Raw Response:", response.choices[0]?.message?.content);
  } catch (e) {
    console.error("Groq Error:", e);
  }
}
main();
