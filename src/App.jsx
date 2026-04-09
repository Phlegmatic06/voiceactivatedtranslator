import React, { useState, useRef, useEffect } from 'react';
import { Mic, Navigation, MapPin, Calendar, Users, Activity, CheckCircle, Plane, Bed } from 'lucide-react';
import { useTravelAssistant } from './hooks/useTravelAssistant';
import './index.css';

const T = {
  ta: {
    appTitle: "பயண வழிகாட்டி", // Travel Guide
    tapToSpeak: "பேச மைக் பட்டனை அழுத்தவும்", // Tap to Speak
    listening: "கவனிக்கிறது...", // Listening
    thinking: "சிந்திக்கிறது...", // Thinking
    speaking: "பதில் அளிக்கிறது...", // Speaking
    completeTitle: "பயண உறுதிப்படுத்தல்", // Confirmation
    completeDesc: "வாட்ஸ்அப் மூலம் உறுதிப்படுத்தலை அனுப்ப உள்ளோம்.", // WhatsApp confirmation prompt
    sentTitle: "வெற்றி!", // Success
    sentDesc: "பயண திட்டம் உங்கள் வாட்ஸ்அப்பிற்கு அனுப்பப்பட்டுள்ளது!", // Travel plan sent to WhatsApp
    errorDesc: "வாட்ஸ்அப்பில் அனுப்புவதில் பிழை.", // Error sending WhatsApp
    fields: {
      source: "புறப்படும் இடம்", // Source
      destination: "போய் சேரும் இடம்", // Destination
      date: "தேதி", // Date
      flights: "விமானங்கள்", // Flights
      hotels: "ஹோட்டல்கள்", // Hotels
      travelers: "பயணிகள்", // Travelers
      activities: "செயல்பாடுகள்" // Activities
    }
  },
  en: {
    appTitle: "Travel Planner",
    tapToSpeak: "Tap to Speak",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    completeTitle: "Itinerary Confirmation",
    completeDesc: "We are ready to send this itinerary to your WhatsApp.",
    sentTitle: "Success!",
    sentDesc: "Travel plan has been sent to your WhatsApp!",
    errorDesc: "Failed to send to WhatsApp.",
    fields: {
      source: "Source",
      destination: "Destination",
      date: "Date",
      flights: "Flights",
      hotels: "Hotels",
      travelers: "Travelers",
      activities: "Activities"
    }
  }
};

function App() {
  const [lang, setLang] = useState('ta');
  const [uiState, setUiState] = useState('idle'); // 'idle' | 'listening' | 'thinking' | 'speaking' | 'complete'
  
  const [hasStarted, setHasStarted] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const clickLockRef = useRef(false);
  const currentAudioRef = useRef(null);
  const whatsappSentRef = useRef(false);

  // Import our custom architecture logic from Step 2
  const { assistantState, processUserAudio, startConversation } = useTravelAssistant();

  const t = T[lang];

  // The Completion Trigger hook — fires ONCE when status becomes 'complete'
  useEffect(() => {
    if (assistantState.status !== 'complete') return;
    if (whatsappSentRef.current) return; // GUARD: only send once per session
    whatsappSentRef.current = true;

    setUiState('complete');

    const dispatchWhatsAppItinerary = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/send-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(assistantState.travelDetails)
        });
        
        if (!response.ok) throw new Error("Failed connecting to Twilio Backend");
        setUiState('complete_sent');
      } catch (err) {
        console.error("Delivery sequence failed:", err);
        setUiState('complete_error');
      }
    };

    dispatchWhatsAppItinerary();
  }, [assistantState.status]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // --- VAD (Voice Activity Detection) Setup ---
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.minDecibels = -50;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // --- VAD State ---
      let speechConfirmed = false;
      let consecutiveLoudFrames = 0;
      const LOUD_FRAMES_REQUIRED = 5;
      let speechStartTimestamp = null;
      const MIN_SPEECH_DURATION = 1500;
      let silenceTimer = null;
      let isChecking = true;
      const monitoringStartTime = Date.now();
      const DEBOUNCE_MS = 1000;

      const checkAudioLevel = () => {
        if (!isChecking) return;
        analyser.getByteFrequencyData(dataArray);
        
        // Debounce: ignore first second (TTS echo, mic pop)
        if (Date.now() - monitoringStartTime < DEBOUNCE_MS) {
          requestAnimationFrame(checkAudioLevel);
          return;
        }
        
        // Count frequency bins above energy threshold
        let loudBins = 0;
        for (let i = 0; i < bufferLength; i++) {
          if (dataArray[i] > 30) loudBins++;
        }
        const isSilence = loudBins < 3;

        if (!isSilence) {
          consecutiveLoudFrames++;
          if (!speechConfirmed && consecutiveLoudFrames >= LOUD_FRAMES_REQUIRED) {
            speechConfirmed = true;
            speechStartTimestamp = Date.now();
          }
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
        } else {
          consecutiveLoudFrames = 0;
          if (speechConfirmed && !silenceTimer) {
            const elapsed = Date.now() - speechStartTimestamp;
            const remainingMinDuration = Math.max(0, MIN_SPEECH_DURATION - elapsed);
            silenceTimer = setTimeout(() => {
              if (mediaRecorder.state === "recording") {
                isChecking = false;
                mediaRecorder.stop();
              }
            }, remainingMinDuration + 4000);
          }
        }

        if (isChecking) {
          requestAnimationFrame(checkAudioLevel);
        }
      };
      
      // Begin monitoring
      requestAnimationFrame(checkAudioLevel);
      // -------------------------------------------

      mediaRecorder.onstop = async () => {
        isChecking = false;
        if (silenceTimer) clearTimeout(silenceTimer);
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(console.error);
        }
        
        // Build the audio blob once the recording stream is cut
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/wav' });
        
        // Ensure browser microphone tracks are properly released
        stream.getTracks().forEach((track) => track.stop());

        // QUALITY GATE: If no real speech was confirmed, or blob is tiny,
        // skip the entire pipeline and just re-open the mic
        if (!speechConfirmed || audioBlob.size < 2000) {
          console.log("VAD: No real speech detected, re-opening mic...");
          startRecording();
          return;
        }

        // Update UI to indicate backend processing
        setUiState('thinking');
        
        // Pass to our Engine (Step 2 Implementation)
        const result = await processUserAudio(audioBlob, lang);
        
        if (result && result.audioBase64) {
          const isFinal = result?.updatedState?.status === 'complete';
          handleAudioPlayback(result.audioBase64, isFinal);
        } else {
           if (result?.updatedState?.status === 'complete') {
             setUiState('complete');
           } else {
             console.error("Pipeline error:", result?.errorDetail);
             // Don't alert — just silently re-open mic for retry
             startRecording();
           }
        }
      };

      mediaRecorder.start();
      setUiState('listening');
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      alert("Microphone access is required to use the Travel Guide.");
    }
  };

  const handleAudioPlayback = (audioBase64, isFinal) => {
    setUiState('speaking');
    clickLockRef.current = true;
    
    // Kill any previous audio cleanly
    if (currentAudioRef.current) {
      const oldAudio = currentAudioRef.current;
      oldAudio.onended = null;  // Prevent ghost callbacks
      oldAudio.pause();
      oldAudio.src = '';        // Release media resource
      currentAudioRef.current = null;
    }

    const audioUrl = `data:audio/wav;base64,${audioBase64}`;
    const audio = new Audio(audioUrl);
    currentAudioRef.current = audio;
    
    audio.onended = () => {
      currentAudioRef.current = null;
      clickLockRef.current = false;
      if (isFinal) {
        setUiState('complete');
      } else {
        startRecording();
      }
    };
    
    // Small delay to let the browser release the old audio resource
    setTimeout(() => {
      audio.play().catch((err) => {
        console.error("Audio playback failed:", err);
        currentAudioRef.current = null;
        clickLockRef.current = false;
        if (!isFinal) startRecording();
        else setUiState('complete');
      });
    }, 50);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleMicClick = async () => {
    if (clickLockRef.current) return;

    // CRUCIAL: Disable interactions when bot is thinking or actively speaking
    if (uiState === 'thinking' || uiState === 'speaking') return;

    if (!hasStarted) {
      clickLockRef.current = true;
      setHasStarted(true);
      setUiState('thinking'); // Simulate thinking for the initial API payload fetch
      const result = await startConversation(lang);
      
      if (result && result.audioBase64) {
        handleAudioPlayback(result.audioBase64, false);
      } else {
        // Fallback: If kickoff failed (usually because .env keys aren't loaded)
        setHasStarted(false);
        setUiState('idle'); 
        clickLockRef.current = false;
        alert("Assistant failed to start. Ensure your server was restarted after saving the .env file.");
      }
      return;
    }

    if (uiState === 'idle') {
      clickLockRef.current = true;
      await startRecording();
      clickLockRef.current = false;
    } else if (uiState === 'listening') {
      stopRecording();
    }
  };

  const details = assistantState.travelDetails;
  const isComplete = uiState === 'complete' || uiState === 'complete_sent' || uiState === 'complete_error';

  // Has elements check for rendering the bottom component
  const hasDetails = details.source || details.destination || details.departureDate || details.travelers || details.activities;

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col justify-between items-center p-4 sm:p-6 font-sans">
      
      {/* App Header & Language Switcher */}
      <header className="w-full max-w-md flex justify-between items-center mt-2 mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
          {t.appTitle}
        </h1>
        
        {/* Language Switcher Pill */}
        <div className="flex bg-slate-200/70 p-1.5 rounded-full shadow-inner border border-slate-300">
          <button 
            onClick={() => setLang('ta')}
            disabled={uiState !== 'idle' && !isComplete}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
               (uiState !== 'idle' && !isComplete) ? 'opacity-50 cursor-not-allowed' : ''
            } ${
              lang === 'ta' 
                ? 'bg-white text-orange-600 shadow-md ring-1 ring-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            தமிழ்
          </button>
          <button 
            onClick={() => setLang('en')}
            disabled={uiState !== 'idle' && !isComplete}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all duration-300 ${
               (uiState !== 'idle' && !isComplete) ? 'opacity-50 cursor-not-allowed' : ''
            } ${
              lang === 'en' 
                ? 'bg-white text-orange-600 shadow-md ring-1 ring-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            ENG
          </button>
        </div>
      </header>

      {/* Main Stage */}
      <main className="w-full max-w-md flex flex-col items-center flex-grow">
        
        {!isComplete ? (
          <>
            {/* Visual Status Indicator */}
            <div className="h-10 mb-8 flex items-center justify-center">
              <p className={`text-2xl font-bold tracking-wide transition-all duration-300 ${
                uiState === 'listening' ? 'text-green-600 animate-pulse' :
                uiState === 'thinking' ? 'text-amber-500 animate-pulse' :
                uiState === 'speaking' ? 'text-blue-500 animate-bounce' :
                'text-slate-400'
              }`}>
                {uiState === 'idle' && !hasStarted ? t.tapToSpeak : t[uiState === 'idle' ? 'listening' : uiState]}
              </p>
            </div>

            {/* Massive Microphone Button */}
            <div className="relative mb-16 mt-2 flex items-center justify-center">
              
              {/* Animated Glow Rings when Listening or Speaking */}
              {uiState === 'listening' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute w-[280px] h-[280px] bg-green-500 rounded-full opacity-20 animate-ping"></div>
                  <div className="absolute w-[340px] h-[340px] bg-green-400 rounded-full opacity-10 animate-pulse duration-[1500ms]"></div>
                </div>
              )}

              {uiState === 'speaking' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute w-[280px] h-[280px] bg-blue-400 rounded-full opacity-20 animate-pulse duration-700"></div>
                </div>
              )}

              {/* Primary Button */}
              <button 
                onClick={handleMicClick}
                disabled={uiState === 'thinking' || uiState === 'speaking'}
                className={`
                  relative z-10 flex items-center justify-center 
                  w-56 h-56 rounded-full shadow-[0_20px_50px_rgba(249,115,22,0.3)] 
                  transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                  ${uiState === 'listening' 
                    ? 'bg-gradient-to-br from-green-500 to-green-600 scale-[0.98] shadow-[inset_0_4px_15px_rgba(0,0,0,0.2)]' 
                    : uiState === 'thinking'
                      ? 'bg-gradient-to-br from-amber-400 to-amber-500 opacity-90 cursor-not-allowed'
                      : uiState === 'speaking'
                        ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-[0_10px_30px_rgba(59,130,246,0.4)] cursor-not-allowed'
                        : 'bg-gradient-to-br from-orange-400 to-orange-600 hover:scale-105 hover:shadow-[0_25px_60px_rgba(249,115,22,0.4)] active:scale-95'
                  }
                `}
                aria-label="Toggle Microphone"
              >
                <Mic 
                  className={`w-28 h-28 text-white drop-shadow-sm transition-all duration-300 ${uiState === 'listening' ? 'animate-bounce text-green-50' : ''}`} 
                  strokeWidth={1.5} 
                />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex-grow flex flex-col items-center justify-center transition-opacity duration-1000">
             {/* Completion Replaces Microphone */}
             <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
               <CheckCircle className="w-12 h-12 text-green-600" />
             </div>
             <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight text-center mb-2">
               {uiState === 'complete_sent' ? t.sentTitle : t.completeTitle}
             </h2>
             <p className={`text-center mb-10 mx-6 leading-relaxed ${uiState === 'complete_error' ? 'text-red-500' : 'text-slate-500'}`}>
               {uiState === 'complete_sent' ? t.sentDesc : uiState === 'complete_error' ? t.errorDesc : t.completeDesc}
             </p>

          </div>
        )}

        {/* Live Feedback / Partial Itinerary Info (Always shows when available) */}
        {(hasDetails || isComplete) && (
          <div className={`w-full mt-auto bg-white rounded-3xl p-6 shadow-xl border ${isComplete ? 'border-green-400 shadow-[0_0_40px_rgba(74,222,128,0.2)]' : 'border-slate-200'} relative overflow-hidden transition-all duration-700`}>
            {/* Soft decorative blur circles */}
            <div className={`absolute -right-10 -top-10 w-32 h-32 rounded-full blur-3xl opacity-60 ${isComplete ? 'bg-green-100' : 'bg-orange-50'}`}></div>
            <div className={`absolute -left-10 -bottom-10 w-32 h-32 rounded-full blur-3xl opacity-60 ${isComplete ? 'bg-blue-100' : 'bg-blue-50'}`}></div>
            
            <div className="relative z-10 flex flex-col gap-4">
              
              <div className="grid grid-cols-2 gap-3">
                
                {/* Source Component */}
                {(details.source || isComplete) && (
                  <div className="flex flex-col gap-1 p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.fields.source}</span>
                    <div className="flex items-center gap-2 text-slate-700 font-bold">
                      <MapPin className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <span className="truncate">{details.source || '---'}</span>
                    </div>
                  </div>
                )}

                {/* Destination Component */}
                {(details.destination || isComplete) && (
                  <div className="flex flex-col gap-1 p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.fields.destination}</span>
                    <div className="flex items-center gap-2 text-slate-700 font-bold">
                      <MapPin className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span className="truncate">{details.destination || '---'}</span>
                    </div>
                  </div>
                )}

                {/* Departure Date Component */}
                {(details.departureDate || isComplete) && (
                  <div className="flex flex-col gap-1 p-3 bg-slate-50/80 rounded-2xl border border-slate-100 col-span-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.fields.date}</span>
                    <div className="flex items-center gap-3 text-slate-700 font-bold">
                      <Calendar className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm">
                        {details.departureDate || '---'} 
                        {details.returnDate && <span className="text-slate-400 ml-1 font-medium">(Return: {details.returnDate})</span>}
                      </span>
                    </div>
                  </div>
                )}

                {/* Combined Details List Component */}
                {(details.travelers || details.activities) && (
                  <div className="flex flex-col gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 col-span-2">
                     {details.travelers && (
                        <div className="flex items-start gap-3 text-slate-700 font-medium">
                          <Users className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm leading-snug">{details.travelers}</span>
                        </div>
                     )}
                     {details.activities && (
                        <div className="flex items-start gap-3 text-slate-700 font-medium pt-2 border-t border-slate-200/60">
                          <Activity className="w-4 h-4 text-pink-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm leading-snug">{details.activities}</span>
                        </div>
                     )}
                  </div>
                )}
                
                {/* Flights Component */}
                {details.flights?.length > 0 && (
                  <div className="flex flex-col gap-2 p-4 bg-sky-50/80 rounded-2xl border border-sky-100 col-span-2">
                    <span className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">{t.fields.flights}</span>
                    <div className="flex flex-col gap-2">
                       {details.flights.map((flight, idx) => (
                         <div key={idx} className="flex flex-row items-center justify-between text-sm py-2 border-b border-sky-100/50 last:border-0">
                           <div className="flex items-center gap-3">
                             <Plane className="w-4 h-4 text-sky-500" />
                             <span className="font-bold text-slate-700">{flight.airline}</span>
                           </div>
                           <div className="flex items-center gap-3 text-slate-500 font-medium">
                             <span>{flight.time}</span>
                             <span className="bg-sky-100 px-2 rounded-md font-bold text-sky-600">{flight.price}</span>
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                {/* Hotels Component */}
                {details.hotels?.length > 0 && (
                  <div className="flex flex-col gap-2 p-4 bg-amber-50/80 rounded-2xl border border-amber-100 col-span-2">
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{t.fields.hotels}</span>
                    <div className="flex flex-col gap-2">
                       {details.hotels.map((hotel, idx) => (
                         <div key={idx} className="flex flex-row items-center justify-between text-sm py-2 border-b border-amber-100/50 last:border-0">
                           <div className="flex items-center gap-3">
                             <Bed className="w-4 h-4 text-amber-500" />
                             <span className="font-bold text-slate-700">{hotel.name}</span>
                           </div>
                           <div className="flex items-center gap-3 text-slate-500 font-medium">
                             <span>{hotel.rating}</span>
                             <span className="bg-amber-100 px-2 rounded-md font-bold text-amber-600">{hotel.price}</span>
                           </div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

              </div>

            </div>
          </div>
        )}
      </main>

    </div>
  );
}

export default App;
