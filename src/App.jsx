import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, Languages, MessageCircle, MapPin, Calendar, 
  Users, Activity, Plane, Hotel, CheckCircle2, 
  Clock, ArrowRight, Star, ExternalLink, Mail, 
  WifiOff, AlertCircle, Loader2, Search
} from 'lucide-react';
import { useTravelAssistant } from './hooks/useTravelAssistant';
import './index.css';

const T = {
  ta: {
    appTitle: "வழி", // Vazhi
    tapToSpeak: "பேச மைக் பட்டனை அழுத்தவும்",
    listening: "கவனிக்கிறது...",
    thinking: "சிந்திக்கிறது...",
    speaking: "பதில் அளிக்கிறது...",
    completeTitle: "பயண உறுதிப்படுத்தல்",
    completeDesc: "வாட்ஸ்அப் மூலம் உறுதிப்படுத்தலை அனுப்ப உள்ளோம்.",
    searchingTitle: "தேடுகிறது...",
    searchingFlights: "சிறந்த விமானங்களை தேடுகிறது",
    searchingHotels: "ஹோட்டல்களை கண்டறிகிறது",
    noFlights: "விமானங்கள் கிடைக்கவில்லை",
    noHotels: "ஹோட்டல்கள் கிடைக்கவில்லை",
    direct: "நேரடி",
    stops: "நிறுத்தங்கள்",
    sentTitle: "வெற்றி!",
    sentDesc: "பயண திட்டம் உங்கள் வாட்ஸ்அப்பிற்கு அனுப்பப்பட்டுள்ளது!",
    errorDesc: "வாட்ஸ்அப்பில் அனுப்புவதில் பிழை.",
    howToUse: "எப்படி பயன்படுத்துவது?",
    steps: [
      "மைக் பட்டனை அழுத்தவும்",
      "உங்கள் இலக்கை கூறவும் (எ.கா: மதுரை)",
      "கேள்விகளுக்கு பதில் அளிக்கவும்",
      "உங்கள் பயத்திட்டம் வாட்ஸ்அப்பில் கிடைக்கும்!"
    ],
    whatsapp: {
      sending: "பயணத் திட்டம் அனுப்பப்படுகிறது...",
      sent: "பயணத் திட்டம் வாட்ஸ்அப்பிற்கு அனுப்பப்பட்டது!",
      error: "வாட்ஸ்அப் அனுப்பத் தவறிவிட்டது. மீண்டும் முயலவும்.",
    },
    fields: {
      source: "புறப்படும் இடம்",
      destination: "போய் சேரும் இடம்",
      date: "தேதி",
      flights: "விமானங்கள்",
      hotels: "ஹோட்டல்கள்",
      travelers: "பயணிகள்",
      activities: "செயல்பாடுகள்"
    }
  },
  en: {
    appTitle: "Vazhi",
    tapToSpeak: "Tap to Speak",
    listening: "Listening...",
    thinking: "Thinking...",
    speaking: "Speaking...",
    completeTitle: "Itinerary Confirmation",
    completeDesc: "We are ready to send this itinerary to your WhatsApp.",
    searchingTitle: "Searching...",
    searchingFlights: "Finding the best flights for you",
    searchingHotels: "Discovering top-rated hotels",
    noFlights: "No flights found for this route",
    noHotels: "No hotels found for this destination",
    direct: "Direct",
    stops: "stop(s)",
    sentTitle: "Success!",
    sentDesc: "Travel plan has been sent to your WhatsApp!",
    errorDesc: "Failed to send to WhatsApp.",
    howToUse: "How to Use?",
    steps: [
      "Tap the mic button",
      "Speak your destination (e.g., London)",
      "Answer follow-up questions",
      "Get your itinerary on WhatsApp!"
    ],
    whatsapp: {
      sending: "Sending your itinerary...",
      sent: "Itinerary sent to WhatsApp!",
      error: "WhatsApp failed to send. Please try again.",
    },
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

  // Import our custom architecture logic from Step 2
  const { assistantState, isSearchingTravel, whatsappStatus, whatsappError, sentToNumber, processUserAudio, startConversation } = useTravelAssistant();

  const t = T[lang];

  // The Completion Trigger hook — fires ONCE when status becomes 'complete'
  useEffect(() => {
    if (assistantState.status !== 'complete') return;
    setUiState('complete');
  }, [assistantState.status]);

  // Drive UI from hook's whatsappStatus (hook handles dispatch internally)
  useEffect(() => {
    if (whatsappStatus === 'sent') setUiState('complete_sent');
    if (whatsappStatus === 'error') setUiState('complete_error');
  }, [whatsappStatus]);

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
    <div className="relative min-h-[100dvh] bg-slate-100 flex flex-col items-center p-4 sm:p-6 font-sans overflow-x-hidden transition-all duration-500">
      
      {/* Dynamic Travel Background */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-1000"
        style={{ backgroundImage: 'url("/bg.png")' }}
      >
        {/* Modern Overlay for content visibility */}
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 w-full max-w-md flex flex-col min-h-screen">
        
        {/* App Header & Language Switcher */}
        <header className="w-full flex justify-between items-center mt-2 mb-8">
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
        <main className="w-full flex-grow flex flex-col items-center">
          
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
               {/* Completion / Searching State */}
               {isSearchingTravel ? (
                 <>
                   <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mb-6 shadow-inner border-2 border-orange-200 animate-pulse">
                     <Search className="w-10 h-10 text-orange-500 animate-bounce" />
                   </div>
                   <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight text-center mb-4">
                     {t.searchingTitle}
                   </h2>
                   <div className="flex flex-col gap-3 items-center">
                     <div className="flex items-center gap-3 text-slate-500">
                       <Loader2 className="w-5 h-5 animate-spin text-sky-500" />
                       <span className="text-sm font-medium">{t.searchingFlights}</span>
                     </div>
                     <div className="flex items-center gap-3 text-slate-500">
                       <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                       <span className="text-sm font-medium">{t.searchingHotels}</span>
                     </div>
                   </div>
                 </>
               ) : (
                 <div className="text-center py-6 px-4 animate-in fade-in zoom-in duration-500">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-emerald-50 shadow-emerald-200">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <h2 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">{t.success}</h2>
                    <p className="text-slate-500 font-medium mb-6 leading-relaxed max-w-[240px] mx-auto">{t.sent}</p>
                    
                    {/* WhatsApp Status Indicator */}
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border transition-all duration-300 ${
                      whatsappStatus === 'sending' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      whatsappStatus === 'sent' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      whatsappStatus === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                      'bg-slate-50 text-slate-400 border-slate-100 opacity-0'
                    }`}>
                      {whatsappStatus === 'sending' && <Loader2 className="w-4 h-4 animate-spin" />}
                      {whatsappStatus === 'sent' && <MessageCircle className="w-4 h-4" />}
                      {whatsappStatus === 'error' && <AlertCircle className="w-4 h-4" />}
                      <span>
                        {whatsappStatus === 'sending' ? t.whatsapp.sending :
                         whatsappStatus === 'sent' ? `${t.whatsapp.sent} (${sentToNumber})` :
                         whatsappStatus === 'error' ? (whatsappError ? `${t.whatsapp.error}: ${whatsappError}` : t.whatsapp.error) : ''}
                      </span>
                    </div>
                  </div>
               )}
            </div>
          )}

          {/* Live Feedback / Partial Itinerary Info (Always shows when available) */}
          {(hasDetails || isComplete) && (
            <div className={`w-full bg-white rounded-3xl p-6 shadow-xl border ${isComplete ? 'border-green-400 shadow-[0_0_40px_rgba(74,222,128,0.2)]' : 'border-slate-200'} relative overflow-hidden transition-all duration-700 mb-8`}>
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
                  
                  {/* Flights Component — Rich Cards */}
                  {isComplete && !isSearchingTravel && (
                    <div className="flex flex-col gap-3 p-4 bg-sky-50/80 rounded-2xl border border-sky-100 col-span-2">
                      <span className="text-[10px] font-bold text-sky-500 uppercase tracking-wider flex items-center gap-2">
                        <Plane className="w-3 h-3" />
                        {t.fields.flights}
                      </span>
                      {details.flights?.length > 0 ? (
                        <div className="flex flex-col gap-3">
                          {details.flights.map((flight, idx) => (
                            <div key={idx} className="bg-white rounded-xl p-3 border border-sky-100 shadow-sm hover:shadow-md transition-shadow">
                              {/* Airline Header */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {flight.airlineLogo ? (
                                    <img src={flight.airlineLogo} alt={flight.airline} className="w-6 h-6 rounded object-contain" />
                                  ) : (
                                    <Plane className="w-4 h-4 text-sky-500" />
                                  )}
                                  <span className="font-bold text-slate-700 text-sm">{flight.airline}</span>
                                  {flight.flightNumber && <span className="text-xs text-slate-400">{flight.flightNumber}</span>}
                                </div>
                                <span className="bg-sky-100 px-2.5 py-1 rounded-lg font-bold text-sky-700 text-sm">{flight.price}</span>
                              </div>
                              {/* Time / Route Row */}
                              <div className="flex items-center justify-between text-xs text-slate-600">
                                <div className="text-center">
                                  <p className="font-bold text-sm text-slate-800">{flight.departure?.split(' ').pop() || flight.departure || '—'}</p>
                                  <p className="text-[10px] text-slate-400 truncate max-w-[80px]">{flight.departureAirport || ''}</p>
                                </div>
                                <div className="flex-1 flex flex-col items-center mx-2">
                                  <span className="text-[10px] text-slate-400">{flight.duration}</span>
                                  <div className="w-full flex items-center">
                                    <div className="flex-1 border-t border-dashed border-slate-300"></div>
                                    <ArrowRight className="w-3 h-3 text-sky-400 mx-1" />
                                    <div className="flex-1 border-t border-dashed border-slate-300"></div>
                                  </div>
                                  <span className="text-[10px] text-slate-400">
                                    {flight.stops === 0 ? t.direct : `${flight.stops} ${t.stops}`}
                                  </span>
                                </div>
                                <div className="text-center">
                                  <p className="font-bold text-sm text-slate-800">{flight.arrival?.split(' ').pop() || flight.arrival || '—'}</p>
                                  <p className="text-[10px] text-slate-400 truncate max-w-[80px]">{flight.arrivalAirport || ''}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                          <WifiOff className="w-4 h-4" />
                          <span>{t.noFlights}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hotels Component — Rich Cards */}
                  {isComplete && !isSearchingTravel && (
                    <div className="flex flex-col gap-3 p-4 bg-amber-50/80 rounded-2xl border border-amber-100 col-span-2">
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                        <Hotel className="w-3 h-3" />
                        {t.fields.hotels}
                      </span>
                      {details.hotels?.length > 0 ? (
                        <div className="flex flex-col gap-3">
                          {details.hotels.map((hotel, idx) => (
                            <div key={idx} className="bg-white rounded-xl overflow-hidden border border-amber-100 shadow-sm hover:shadow-md transition-shadow">
                              <div className="flex">
                                {/* Thumbnail */}
                                {hotel.thumbnail && (
                                  <div className="w-24 h-24 flex-shrink-0">
                                    <img src={hotel.thumbnail} alt={hotel.name} className="w-full h-full object-cover" />
                                  </div>
                                )}
                                {/* Details */}
                                <div className="flex-1 p-3 flex flex-col justify-between">
                                  <div>
                                    <div className="flex items-start justify-between gap-2">
                                      <h4 className="font-bold text-slate-700 text-sm leading-tight">{hotel.name}</h4>
                                      <span className="bg-amber-100 px-2 py-0.5 rounded-lg font-bold text-amber-700 text-xs whitespace-nowrap">{hotel.price}</span>
                                    </div>
                                    {hotel.hotelClass && <span className="text-[10px] text-amber-500 font-medium">{hotel.hotelClass}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {hotel.ratingValue > 0 && (
                                      <div className="flex items-center gap-1">
                                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                                        <span className="text-xs font-bold text-slate-600">{hotel.ratingValue}</span>
                                      </div>
                                    )}
                                    {hotel.reviews && <span className="text-[10px] text-slate-400">({hotel.reviews})</span>}
                                  </div>
                                  {hotel.amenities && (
                                    <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{hotel.amenities}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-3">
                          <WifiOff className="w-4 h-4" />
                          <span>{t.noHotels}</span>
                        </div>
                      )}
                    </div>
                  )}

                </div>

              </div>
            </div>
          )}
        </main>

        {/* Localized "How to Use" Section */}
        <footer className="w-full mt-12 mb-8">
          <div className="bg-white/60 backdrop-blur-md rounded-3xl p-6 border border-white/40 shadow-lg">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
              {t.howToUse}
            </h3>
            <div className="space-y-3">
              {t.steps.map((step, i) => (
                <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-left duration-500" style={{ animationDelay: `${i * 150}ms` }}>
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-orange-100 text-orange-600 rounded-lg text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm text-slate-600 font-medium leading-tight pt-0.5">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}

export default App;
