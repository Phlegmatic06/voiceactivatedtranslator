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
Step 3 → Extract DEPARTURE DATE and RETURN DATE from user's answer. FORMAT: YYYY-MM-DD. If the user doesn't mention a year, assume 2026. Ask next: "How many travellers will be joining?"
Step 4 → Extract number of TRAVELERS from user's answer. Ask next: "What are your preferred activities during the trip?"
Step 5 → Extract ACTIVITIES from user's answer. The user's spoken words ARE the activities — store them EXACTLY as transcribed. Do NOT invent, add, or substitute your own activity suggestions. Do NOT re-ask this question. Ask next: "Please provide your 10-digit WhatsApp number for confirmation."
Step 6 → Extract WHATSAPP NUMBER from user's answer. Do NOT generate any flights or hotels — leave flights and hotels arrays EMPTY. Set status to "complete". Say: "Thank you! We are now searching for the best flights and hotels for your trip. Your itinerary will be sent to your WhatsApp shortly."

RULES:
- Fill ONLY the field(s) for the current step. Keep all other fields exactly as given.
- Your botSpokenReply should contain ONLY the next question (or summary at step 6).
- Keep botSpokenReply SHORT — one or two sentences max.
- NEVER populate flights or hotels arrays. Always leave them as empty arrays [].

LANGUAGE:
- If Active Language is "ta": botSpokenReply must be 100% Tamil only.
- If Active Language is "en": botSpokenReply must be 100% English only.

OUTPUT (strict JSON only, no extra text):
{ "updatedState": { "status": "in_progress"|"complete", "travelDetails": { ...all fields preserved... } }, "botSpokenReply": "text" }`;

export function useTravelAssistant() {
  const [assistantState, setAssistantState] = useState(INITIAL_STATE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearchingTravel, setIsSearchingTravel] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState(null); // null | 'sending' | 'sent' | 'error'
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

  /**
   * After the conversation completes, search for real flights and hotels
   * using the SerpApi-powered backend endpoints.
   */
  /**
   * After the conversation completes:
   * 1. Search for real flights and hotels via SerpApi
   * 2. Merge results into state
   * 3. Dispatch the WhatsApp itinerary with the FINAL data
   */
  const searchAndDispatch = async (travelDetails) => {
    setIsSearchingTravel(true);

    let flights = [];
    let hotels = [];

    try {
      console.log('[Search] Starting parallel flight + hotel search...');
      console.log('[Search] Source:', travelDetails.source, '→ Destination:', travelDetails.destination);
      console.log('[Search] Dates:', travelDetails.departureDate, '→', travelDetails.returnDate);

      const [flightsRes, hotelsRes] = await Promise.allSettled([
        fetch('http://localhost:3001/api/search-flights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: travelDetails.source,
            destination: travelDetails.destination,
            departureDate: travelDetails.departureDate,
            returnDate: travelDetails.returnDate,
            travelers: travelDetails.travelers,
          })
        }),
        fetch('http://localhost:3001/api/search-hotels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: travelDetails.destination,
            checkInDate: travelDetails.departureDate,
            checkOutDate: travelDetails.returnDate,
            travelers: travelDetails.travelers,
          })
        })
      ]);

      if (flightsRes.status === 'fulfilled' && flightsRes.value.ok) {
        const flightsData = await flightsRes.value.json();
        flights = flightsData.flights || [];
        console.log('[Search] Flights:', flights.length, 'results');
      } else {
        const reason = flightsRes.status === 'rejected' 
          ? flightsRes.reason?.message 
          : `HTTP ${flightsRes.value?.status}`;
        console.warn('[Search] Flights failed:', reason);
        // Try to log server error message
        if (flightsRes.status === 'fulfilled' && !flightsRes.value.ok) {
          try {
            const errBody = await flightsRes.value.json();
            console.warn('[Search] Flights error detail:', errBody);
          } catch (e) { /* ignore */ }
        }
      }

      if (hotelsRes.status === 'fulfilled' && hotelsRes.value.ok) {
        const hotelsData = await hotelsRes.value.json();
        hotels = hotelsData.hotels || [];
        console.log('[Search] Hotels:', hotels.length, 'results');
      } else {
        const reason = hotelsRes.status === 'rejected'
          ? hotelsRes.reason?.message
          : `HTTP ${hotelsRes.value?.status}`;
        console.warn('[Search] Hotels failed:', reason);
        if (hotelsRes.status === 'fulfilled' && !hotelsRes.value.ok) {
          try {
            const errBody = await hotelsRes.value.json();
            console.warn('[Search] Hotels error detail:', errBody);
          } catch (e) { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('[Search] Network error:', err);
    }

    // Merge real data into state
    const finalDetails = {
      ...travelDetails,
      flights,
      hotels,
    };
    const updatedState = {
      ...stateRef.current,
      travelDetails: finalDetails,
    };
    commitState(updatedState);
    setIsSearchingTravel(false);

    // ==========================================
    // DISPATCH WHATSAPP — with the final data
    // ==========================================
    console.log('[WhatsApp] Dispatching to:', finalDetails.whatsappNumber);
    setWhatsappStatus('sending');

    try {
      const response = await fetch('http://localhost:3001/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalDetails)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[WhatsApp] Server returned error:', response.status, errText);
        throw new Error(`Twilio error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[WhatsApp] Sent successfully! SID:', result.sid);
      setWhatsappStatus('sent');
    } catch (err) {
      console.error('[WhatsApp] Dispatch failed:', err);
      setWhatsappStatus('error');
    }
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
          ...((updatedState && updatedState.travelDetails) || {}),
          // Force flights/hotels to stay empty until real API populates them
          flights: [],
          hotels: [],
        }
      };
      
      commitState(safeState);

      // Append to history as proper role-alternating messages
      historyRef.current.push(
        { role: 'user', content: `User answered: "${transcribedText}"` },
        { role: 'assistant', content: rawText }
      );

      // =========================================================
      // Step C: If conversation is complete, search + dispatch WhatsApp
      // =========================================================
      if (safeState.status === 'complete') {
        // Fire off real search + WhatsApp in the background (non-blocking for TTS)
        searchAndDispatch(safeState.travelDetails);
      }

      // =========================================================
      // Step D: Sarvam TTS (The Mouth)
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
    setIsSearchingTravel(false);
    setWhatsappStatus(null);
  };

  return {
    assistantState,
    isProcessing,
    isSearchingTravel,
    whatsappStatus,
    error,
    processUserAudio,
    startConversation,
    resetState
  };
}
