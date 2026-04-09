import express from 'express';
import cors from 'cors';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Twilio using environmental variables
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // Usually something like 'whatsapp:+14155238886' if using the sandbox

/**
 * Format the JSON travel details into a bold, emoji-rich WhatsApp Markdown String.
 */
const formatWhatsAppMessage = (details) => {
  let flightsMarkdown = '';
  if (details.flights && details.flights.length > 0) {
    flightsMarkdown = `\n\n*✈️ விமானங்கள் (Flights):*\n` + details.flights.map(f => `  • ${f.airline} | ${f.time} | ${f.price}`).join('\n');
  }

  let hotelsMarkdown = '';
  if (details.hotels && details.hotels.length > 0) {
    hotelsMarkdown = `\n\n*🏨 ஹோட்டல்கள் (Hotels):*\n` + details.hotels.map(h => `  • ${h.name} | ${h.rating} | ${h.price}`).join('\n');
  }

  return `*🌍 உங்கள் பயண உறுதிப்படுத்தல் (Travel Confirmation)*
  
*📍 புறப்படும் இடம் (From):* ${details.source || 'N/A'}
*🎯 போய் சேரும் இடம் (To):* ${details.destination || 'N/A'}
*📅 தேதி (Date):* ${details.departureDate || 'N/A'}${details.returnDate ? ` - ${details.returnDate}` : ''}
*👥 பயணிகள் (Travelers):* ${details.travelers || 'N/A'}
*🎟 செயல்பாடுகள் (Activities):* ${details.activities || 'N/A'}${flightsMarkdown}${hotelsMarkdown}

_உங்கள் பயணம் இனிதே அமைய வாழ்த்துக்கள்! (Have a great trip!)_ 🧳✨`;
};

// API Endpoint to consume the frontend frontend and sequence the delivery
app.post('/api/send-whatsapp', async (req, res) => {
  try {
    const travelDetails = req.body;
    let number = travelDetails.whatsappNumber;

    if (!number) {
      return res.status(400).json({ error: "WhatsApp number is missing from the payload." });
    }

    // Scrub the phone number to digits only
    number = number.replace(/\D/g, ''); 
    
    // Automatically prepend India country code if user just said "9123456780" mapped as 10 digits
    if (number.length === 10) {
      number = `+91${number}`;
    } else if (number.length === 12 && number.startsWith('91')) {
      number = `+${number}`;
    }

    const messageBody = formatWhatsAppMessage(travelDetails);

    // Call the Twilio SDK
    const message = await client.messages.create({
      body: messageBody,
      from: TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${number}`
    });

    console.log(`WhatsApp message successfully sequenced. SID: ${message.sid}`);
    res.status(200).json({ success: true, sid: message.sid });

  } catch (error) {
    console.error("Twilio Delivery Error:", error);
    res.status(500).json({ error: "Failed to dispatch WhatsApp message via Twilio." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`WhatsApp Delivery Service running locally on port ${PORT}`);
});
