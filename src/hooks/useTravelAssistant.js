import { useState, useRef } from 'react';
import Groq from 'groq-sdk';

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

// Field order determines the question sequence
const FIELD_ORDER = ['destination', 'source', 'departureDate', 'travelers', 'activities', 'whatsappNumber'];

/**
 * Compute which step we're on (1-6) by finding the first null field.
 * Returns 7 if all fields are filled (ready for completion).
 */
function getCurrentStep(travelDetails) {
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    if (!travelDetails[FIELD_ORDER[i]]) return i + 1;
  }
  return 7; // all filled
}

const SYSTEM_PROMPT = `You are a travel planning assistant. You collect travel details ONE question at a time.

You will receive:
- The current travelDetails JSON (showing what has been collected so far)
- A "CURRENT STEP" number telling you exactly which question to handle
- The user's spoken answer

YOUR JOB for each step:
Step 1 → Extract DESTINATION from user's answer. Ask next: "Please tell me your origin city or location."
Step 2 → Extract SOURCE from user's answer. Ask next: "What are your departure and return dates?"
Step 3 → Extract DEPARTURE DATE and RETURN DATE from user's answer. Ask next: "How many travellers will be joining?"
Step 4 → Extract number of TRAVELERS from user's answer. Ask next: "What are your preferred activities during the trip?"
Step 5 → Extract ACTIVITIES from user's answer. Accept ANY answer as valid activities (sightseeing, relaxing, exploring, etc). Do NOT re-ask this question. Store whatever the user said. Ask next: "Please provide your 10-digit WhatsApp number for confirmation."
Step 6 → Extract WHATSAPP NUMBER from user's answer. Then generate 2 mock flights (fields: airline, time, price) and 2 mock hotels (fields: name, rating, price). Set status to "complete". Say a short goodbye/thank-you message.

RULES:
- Fill ONLY the field(s) for the current step. Keep all other fields exactly as given.
- Your botSpokenReply should contain ONLY the next question (or summary at step 6).
- Keep botSpokenReply SHORT — one or two sentences max.

LANGUAGE:
- If Active Language is "ta": botSpokenReply must be 100% Tamil only.
- If Active Language is "en": botSpokenReply must be 100% English only.

OUTPUT (strict JSON only, no extra text):
{ "updatedState": { "status": "in_progress"|"complete", "travelDetails": { ...all fields preserved... } }, "botSpokenReply": "text" }`;

export function useTravelAssistant() {
  const [assistantState, setAssistantState] = useState(INITIAL_STATE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Synchronous ref — updated IMMEDIATELY, no useEffect delay
  const stateRef = useRef(INITIAL_STATE);
  
  // Conversation history as proper alternating messages for Groq
  const historyRef = useRef([]);

  // Atomic state commit
  const commitState = (newState) => {
    stateRef.current = newState;
    setAssistantState(newState);
  };

  const processUserAudio = async (audioBlob, activeLanguage) => {
    setIsProcessing(true);
    setError(null);
    const currentState = stateRef.current;
    
    try {
      const SARVAM_KEY = import.meta.env.VITE_SARVAM_API_KEY;
      const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;

      if (!SARVAM_KEY || !GROQ_KEY) {
        throw new Error("Missing API Keys - check your .env file.");
      }

      const groq = new Groq({ apiKey: GROQ_KEY, dangerouslyAllowBrowser: true });
      const langCode = activeLanguage === 'en' ? 'en-IN' : 'ta-IN'; 

      // =========================================================
      // Step A: Sarvam STT (The Ears)
      // =========================================================
      const formData = new FormData();
      const baseMimeType = (audioBlob.type || 'audio/wav').split(';')[0];
      formData.append('file', new File([audioBlob], 'audio.wav', { type: baseMimeType }));
      formData.append('language_code', langCode);
      formData.append('model', 'saaras:v3');

      const sttResponse = await fetch('/api/sarvam/speech-to-text', {
        method: 'POST',
        headers: { 'api-subscription-key': SARVAM_KEY },
        body: formData
      });
      
      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        throw new Error(`Sarvam STT failed: ${sttResponse.status} - ${errorText}`);
      }
      const sttData = await sttResponse.json();
      const transcribedText = sttData.transcript || "";
      
      if (!transcribedText.trim()) throw new Error("No speech detected.");

      // =========================================================
      // Step B: Groq API (The Brain)
      // =========================================================
      const step = getCurrentStep(currentState.travelDetails);
      
      // Build proper alternating message history for the LLM
      // Only keep last 4 messages (2 exchanges) to save tokens
      const recentHistory = historyRef.current.slice(-4);
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentHistory,
        // Current turn: state context + user's new answer
        { 
          role: 'user', 
          content: `CURRENT STEP: ${step}\nActive Language: ${activeLanguage}\n\nCurrent travelDetails:\n${JSON.stringify(currentState.travelDetails, null, 2)}\n\nUser's answer: "${transcribedText}"` 
        }
      ];

      const groqResponse = await groq.chat.completions.create({
        messages,
        model: 'llama-3.1-8b-instant',
        response_format: { type: 'json_object' },
        max_tokens: 1200,
      });

      const rawText = groqResponse.choices[0]?.message?.content || "{}";
      console.log(`[Step ${step}] Groq raw:`, rawText);
      
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawText);
      } catch (e) {
        console.error("JSON parse failed. Raw:", rawText);
        throw new Error("Failed to parse Groq JSON response.");
      }

      const { updatedState, botSpokenReply } = parsedResponse;

      if (!botSpokenReply) {
        throw new Error("LLM returned empty botSpokenReply.");
      }

      // Merge: LLM fills its fields, everything else preserved from current
      const safeState = {
        ...currentState,
        status: updatedState?.status || currentState.status,
        travelDetails: {
          ...currentState.travelDetails,
          ...((updatedState && updatedState.travelDetails) || {})
        }
      };
      
      commitState(safeState);

      // Append to history as proper role-alternating messages
      historyRef.current.push(
        { role: 'user', content: `User answered: "${transcribedText}"` },
        { role: 'assistant', content: rawText }
      );

      // =========================================================
      // Step C: Sarvam TTS (The Mouth)
      // =========================================================
      const ttsResponse = await fetch('/api/sarvam/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': SARVAM_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: [botSpokenReply],
          target_language_code: langCode,
          speaker: "kavitha",
          pace: 0.95,
          speech_sample_rate: 8000,
          enable_preprocessing: true,
          model: 'bulbul:v3'
        })
      });

      if (!ttsResponse.ok) throw new Error("Sarvam TTS failed to generate speech.");
      const ttsData = await ttsResponse.json();

      return {
        transcribedText,
        updatedState: safeState,
        botSpokenReply,
        audioBase64: ttsData.audios?.[0] || null
      };

    } catch (err) {
      console.error('Pipeline Error:', err);
      setError(err.message);
      return { audioBase64: null, errorDetail: err.message };
    } finally {
      setIsProcessing(false);
    }
  };

  const startConversation = async (activeLanguage) => {
    setIsProcessing(true);
    setError(null);
    historyRef.current = [];
    
    try {
      const SARVAM_KEY = import.meta.env.VITE_SARVAM_API_KEY;
      const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;
      if (!SARVAM_KEY || !GROQ_KEY) throw new Error("Missing API Keys.");
      
      const groq = new Groq({ apiKey: GROQ_KEY, dangerouslyAllowBrowser: true });
      const langCode = activeLanguage === 'en' ? 'en-IN' : 'ta-IN';

      // For the kickoff, we just need the greeting question
      const kickoffPrompt = activeLanguage === 'en' 
        ? "Hello! Where are you travelling to?"
        : "வணக்கம்! நீங்கள் எங்கு பயணம் செல்ல விரும்புகிறீர்கள்?";

      // Skip Groq entirely for the opening — it's always the same question
      const ttsResponse = await fetch('/api/sarvam/text-to-speech', {
        method: 'POST',
        headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: [kickoffPrompt], target_language_code: langCode, speaker: "kavitha",
          pace: 0.95, speech_sample_rate: 8000,
          enable_preprocessing: true, model: 'bulbul:v3'
        })
      });
      
      if (!ttsResponse.ok) throw new Error("TTS failed for kickoff.");
      const ttsData = await ttsResponse.json();
      
      // Seed history with the opening exchange
      historyRef.current.push(
        { role: 'user', content: 'User said: "Hello, start planning."' },
        { role: 'assistant', content: JSON.stringify({ updatedState: INITIAL_STATE, botSpokenReply: kickoffPrompt }) }
      );
      
      return { audioBase64: ttsData.audios?.[0] || null };
    } catch (err) {
      console.error('Kickoff Error:', err);
      setError(err.message);
      return { audioBase64: null, errorDetail: err.message };
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    commitState(INITIAL_STATE);
    historyRef.current = [];
  };

  return {
    assistantState,
    isProcessing,
    error,
    processUserAudio,
    startConversation,
    resetState
  };
}
