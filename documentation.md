# Voice-First Travel Orchestrator: Architecture & Workflow

This application was engineered specifically for extreme accessibility: enabling elderly users to seamlessly book complex technical travel logistics utilizing zero buttons and purely native regional Tamil dialects. 

## 1. Tech Stack & Component Rationale

| Layer | Technology | Why we used it? |
| :--- | :--- | :--- |
| **Frontend/UI** | React.js & Tailwind CSS | React's state management is perfect for transitioning visual feedback instantly (Listening -> Thinking -> Speaking). Tailwind allowed us to effortlessly build massive, high-contrast accessible buttons with complex CSS pulsing animations out of the box. |
| **Audio Capture** | Native HTML MediaRecorder | We utilized the browser's built-in web API. This requires strictly zero external packages and seamlessly streams cross-browser microphone feeds directly into manageable wav chunks. |
| **"Ears & Mouth"**| Sarvam AI (Saaras & Bulbul) | Hand-selected over generic giants (like Google STT). Sarvam models are hyper-tuned specifically for deep Indian linguistic dialects, ensuring highly accurate Tamil transcription and generating culturally appropriate, natural-sounding audio responses. |
| **The "Brain"**  | Groq API (Llama-3-70B) | Swapped in place of standard LLMs due to Groq's ultra-low latency LPU engine. For a voice-to-voice app, sub-second inference is mandatory to simulate a real phone call. Additionally, its native json_mode enforces strict data extraction safely. |
| **Delivery Server** | Node.js, Express & Twilio | Built an isolated, lightweight backend REST interface exclusively for finalizing the loop. Twilio acts as the robust commercial bridge required to trigger automated WhatsApp SMS dispatches without exposing your sensitive API Account Secrets to the client-side browser. |

---

## 2. Process Workflow (How It Actually Works)

The entire application relies on a **Self-Healing State Machine Loop**. Rather than writing rigid if/else coding trees, the system is completely fluid and relies on the LLM "Brain" to continuously update a JSON payload until all empty fields are filled.

Here is the exact step-by-step sequence of a single interaction:

1. **Audio Capture**
   - The user taps the massive Mic button in the React UI and speaks naturally in Tamil. 
   - The Native MediaRecorder buffers their voice and triggers our orchestrator (`useTravelAssistant.js`) the moment they tap stop.

2. **Speech-to-Text (The Ears)**
   - The audio file is fired asynchronously directly to the Sarvam STT `saaras:v1` model endpoint.
   - Output: A precise, timestamped transcribed Tamil text string.

3. **State Parsing (The Brain)**
   - The newly transcribed text, alongside the in-memory JSON state block, is pushed to the Groq Llama 3 engine via the `json_object` format. 
   - The LLM cross-references the transcript. It dynamically parses extracted entities (e.g., "Madurai") directly into the corresponding JSON layout keys (`source`, `destination`, `date`). 
   - Output: It then effortlessly generates the exact next conversational response asking the user for whatever piece of information is still missing, localized in Tamil.

4. **Text-to-Speech (The Mouth)**
   - The newly generated bot response is pushed directly up to Sarvam's TTS `bulbul:v1` engine endpoint. 
   - Output: Produces a real-time `base64` audio byte-stream.
   - React Updates: The browser translates the byte-stream natively back into standard HTML5 Web Audio (`new Audio()`), playing it aloud for the user and dynamically disabling the Microphone button so they cannot interrupt.

5. **Completion Sequence & WhatsApp Dispatch**
   - The cyclical "Ears -> Brain -> Mouth" loop repeats organically. 
   - The precise moment the JSON schema fills completely (`source`, `destination`, `date`, `number`), Groq flips the internal operational status flag to `complete`.
   - React's `useEffect` visually overrides the microphone interface and fires an isolated `POST` payload entirely under-the-hood to your Express/Node.js `/api/send-whatsapp` local backend. 
   - Finally, the Twilio SDK cleanly structures their confirmed itinerary into an emoji-rich Markdown message and drops it instantly into their personal WhatsApp.
