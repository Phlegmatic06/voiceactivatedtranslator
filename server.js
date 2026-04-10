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
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// =========================================================
// IATA Airport Code Lookup
// =========================================================
const CITY_TO_IATA = {
  // Major Indian Cities
  'chennai': 'MAA', 'madras': 'MAA', 'சென்னை': 'MAA',
  'mumbai': 'BOM', 'bombay': 'BOM', 'மும்பை': 'BOM',
  'delhi': 'DEL', 'new delhi': 'DEL', 'தில்லி': 'DEL', 'புது டெல்லி': 'DEL',
  'bangalore': 'BLR', 'bengaluru': 'BLR', 'பெங்களூரு': 'BLR',
  'hyderabad': 'HYD', 'ஹைதராபாத்': 'HYD',
  'kolkata': 'CCU', 'calcutta': 'CCU', 'கொல்கத்தா': 'CCU',
  'ahmedabad': 'AMD', 'அகமதாபாத்': 'AMD',
  'kochi': 'COK', 'cochin': 'COK', 'கொச்சி': 'COK',
  'pune': 'PNQ', 'புனே': 'PNQ',
  'goa': 'GOI', 'கோவா': 'GOI',
  'jaipur': 'JAI', 'ஜெய்ப்பூர்': 'JAI',
  'lucknow': 'LKO', 'லக்னோ': 'LKO',
  'thiruvananthapuram': 'TRV', 'trivandrum': 'TRV', 'திருவனந்தபுரம்': 'TRV',
  'amritsar': 'ATQ', 'அமிர்தசரஸ்': 'ATQ',
  'guwahati': 'GAU', 'குவஹாத்தி': 'GAU',
  'bhubaneswar': 'BBI', 'புவனேசுவர்': 'BBI',
  'srinagar': 'SXR', 'ஸ்ரீநகர்': 'SXR',
  'indore': 'IDR', 'இந்தோர்': 'IDR',
  'visakhapatnam': 'VTZ', 'vizag': 'VTZ', 'விசாகப்பட்டினம்': 'VTZ',
  'patna': 'PAT', 'பாட்னா': 'PAT',
  'coimbatore': 'CJB', 'கோயம்புத்தூர்': 'CJB',
  'trivandrum': 'TRV', 'thiruvananthapuram': 'TRV', 'திருவனந்தபுரம்': 'TRV',
  
  // Tamil Nadu Cities (High priority for this app)
  'madurai': 'IXM', 'மதுரை': 'IXM',
  'trichy': 'TRZ', 'tiruchirappalli': 'TRZ', 'திருச்சி': 'TRZ',
  'coimbatore': 'CJB', 'கோவை': 'CJB', 'கோயம்புத்தூர்': 'CJB',
  'tuticorin': 'TCR', 'thoothukudi': 'TCR', 'தூத்துக்குடி': 'TCR',
  'salem': 'SXV', 'சேலம்': 'SXV',
  'pondicherry': 'PNY', 'புதுச்சேரி': 'PNY', 'பாண்டிச்சேரி': 'PNY',

  // International (Common from TN)
  'singapore': 'SIN', 'சிங்கப்பூர்': 'SIN',
  'dubai': 'DXB', 'துபாய்': 'DXB',
  'colombo': 'CMB', 'கொழும்பு': 'CMB',
  'male': 'MLE', 'maldives': 'MLE', 'மாலத்தீவு': 'MLE',
  'kuala lumpur': 'KUL', 'கோலாலம்பூர்': 'KUL', 'malaysia': 'KUL',
  'london': 'LHR', 'லண்டன்': 'LHR',
  'paris': 'CDG', 'பாரிஸ்': 'CDG',
  'tokyo': 'NRT', 'டோக்கியோ': 'NRT',
  'bangkok': 'BKK', 'பாங்காக்': 'BKK',
  'hong kong': 'HKG', 'ஹாங்காங்': 'HKG',
  'sydney': 'SYD', 'சிட்னி': 'SYD',
  'abu dhabi': 'AUH', 'அபுதாபி': 'AUH',
  'doha': 'DOH', 'தோஹா': 'DOH',
  'muscat': 'MCT', 'மஸ்கட்': 'MCT',
};

/**
 * Resolve city name (English or Tamil) to IATA airport code or Knowledge Graph ID.
 * Returns the best match ID for SerpApi engines.
 */
async function resolveLocationId(cityName) {
  if (!cityName) return null;
  const normalized = cityName.trim().toLowerCase();

  // 1. Check Hardcoded Fast Path
  if (CITY_TO_IATA[normalized]) return CITY_TO_IATA[normalized];
  
  // Try partial match in dictionary
  for (const [key, code] of Object.entries(CITY_TO_IATA)) {
    if (normalized.includes(key)) return code;
  }

  // 2. Dynamic Lookup via SerpApi Autocomplete (The "Pro" Fallback)
  try {
    console.log(`[Resolve] Unknown city "${cityName}", calling SerpApi Autocomplete...`);
    const params = new URLSearchParams({
      engine: 'google_flights_autocomplete',
      api_key: SERPAPI_KEY,
      q: cityName,
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    const data = await response.json();

    if (data.suggestions && data.suggestions.length > 0) {
      const best = data.suggestions[0];
      // Prefer IATA ID if available, fallback to Knowledge Graph ID
      const resolvedId = best.id || (best.airports && best.airports[0]?.id);
      if (resolvedId) {
        console.log(`[Resolve] "${cityName}" → ${resolvedId} (${best.name || ''})`);
        return resolvedId;
      }
    }
  } catch (err) {
    console.error(`[Resolve] Failed for "${cityName}":`, err);
  }

  // 3. Last Resort Fallback
  return cityName.trim();
}

/**
 * Parse date strings from conversational LLM output into YYYY-MM-DD format.
 * Handles formats like "April 15, 2026", "15/04/2026", "2026-04-15", "April 15" etc.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Strip ordinal suffixes: "10th April" → "10 April", "April 3rd" → "April 3"
  let cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').trim();
  
  // Handle DD/MM/YYYY or DD-MM-YYYY (common Indian format)
  const ddmmyyyy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try parsing the cleaned string
  let parsed = new Date(cleaned);
  
  // If that fails, try prepending a month name hint
  // "10 April" parses fine, but "April 2026 10" might not
  if (isNaN(parsed.getTime())) {
    // Try reversing day/month order: "10 April" → "April 10"
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      parsed = new Date(parts.reverse().join(' '));
    }
  }

  if (!isNaN(parsed.getTime())) {
    // If year is missing or in the past, use current/next year
    const now = new Date();
    if (parsed.getFullYear() < 2000 || parsed < now) {
      parsed.setFullYear(now.getFullYear());
      if (parsed < now) parsed.setFullYear(now.getFullYear() + 1);
    }
    return parsed.toISOString().split('T')[0];
  }

  console.warn(`[parseDate] Could not parse: "${dateStr}" (cleaned: "${cleaned}")`);
  return null;
}


// =========================================================
// SerpApi: Google Flights Search
// =========================================================
app.post('/api/search-flights', async (req, res) => {
  try {
    if (!SERPAPI_KEY || SERPAPI_KEY === 'your_serpapi_key_here') {
      return res.status(500).json({ error: 'SERPAPI_KEY not configured in .env' });
    }

    const { source, destination, departureDate, returnDate, travelers } = req.body;

    // Resolve IDs in parallel
    const [departureId, arrivalId] = await Promise.all([
      resolveLocationId(source),
      resolveLocationId(destination)
    ]);
    
    const outboundDate = parseDate(departureDate);
    const inboundDate = parseDate(returnDate);

    if (!departureId || !arrivalId || !outboundDate) {
      return res.status(400).json({ 
        error: 'Could not resolve airports or dates', 
        details: { departureId, arrivalId, outboundDate } 
      });
    }

    const params = new URLSearchParams({
      engine: 'google_flights',
      api_key: SERPAPI_KEY,
      departure_id: departureId,
      arrival_id: arrivalId,
      outbound_date: outboundDate,
      currency: 'INR',
      hl: 'en',
      gl: 'in', // Localization for India
      type: inboundDate ? '1' : '2', // 1 = round trip, 2 = one way
    });

    if (inboundDate) params.append('return_date', inboundDate);
    if (travelers) {
      const numTravelers = parseInt(travelers) || 1;
      params.append('adults', Math.min(numTravelers, 9).toString());
    }

    console.log(`[Flights] Params: ${departureId} → ${arrivalId} (${outboundDate})`);

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      console.error('[Flights] SerpApi error:', data.error);
      return res.status(502).json({ error: 'SerpApi returned an error', details: data.error });
    }

    // Extract and normalize flight data
    const rawFlights = [...(data.best_flights || []), ...(data.other_flights || [])];

    const flights = rawFlights.slice(0, 5).map(flightGroup => {
      const legs = flightGroup.flights || [];
      const firstLeg = legs[0] || {};
      const lastLeg = legs[legs.length - 1] || {};

      // Generate a stable Google Flights search link for this itinerary
      const searchLink = `https://www.google.com/travel/flights?q=Flights%20to%20${arrivalId}%20from%20${departureId}%20on%20${outboundDate}`;

      return {
        airline: firstLeg.airline || 'Unknown Airline',
        airlineLogo: firstLeg.airline_logo || null,
        flightNumber: firstLeg.flight_number || '',
        departure: firstLeg.departure_airport?.time || '',
        departureAirport: firstLeg.departure_airport?.name || '',
        arrival: lastLeg.arrival_airport?.time || '',
        arrivalAirport: lastLeg.arrival_airport?.name || '',
        duration: flightGroup.total_duration ? `${Math.floor(flightGroup.total_duration / 60)}h ${flightGroup.total_duration % 60}m` : '',
        stops: legs.length - 1,
        price: flightGroup.price ? `₹${flightGroup.price.toLocaleString('en-IN')}` : 'Price unavailable',
        rawPrice: flightGroup.price || 0,
        link: searchLink
      };
    });

    console.log(`[Flights] Found ${flights.length} results`);
    res.json({ flights, priceInsights: data.price_insights || null, debug_params: { departureId, arrivalId, outboundDate } });

  } catch (error) {
    console.error('[Flights] Server error:', error);
    res.status(500).json({ error: 'Failed to search flights', flights: [] });
  }
});


// =========================================================
// SerpApi: Google Hotels Search
// =========================================================
app.post('/api/search-hotels', async (req, res) => {
  try {
    if (!SERPAPI_KEY || SERPAPI_KEY === 'your_serpapi_key_here') {
      return res.status(500).json({ error: 'SERPAPI_KEY not configured in .env' });
    }

    const { destination, checkInDate, checkOutDate, travelers } = req.body;

    const [resolvedDestination, checkin, checkout] = await Promise.all([
      resolveLocationId(destination), // Ensure the location is correctly identified
      Promise.resolve(parseDate(checkInDate)),
      Promise.resolve(parseDate(checkOutDate))
    ]);

    // Build search query using the resolved location string for accuracy
    const query = `Hotels in ${destination}`;

    const params = new URLSearchParams({
      engine: 'google_hotels',
      api_key: SERPAPI_KEY,
      q: query,
      currency: 'INR',
      hl: 'en',
      gl: 'in',
    });

    if (checkin) params.append('check_in_date', checkin);
    if (checkout) params.append('check_out_date', checkout);
    if (travelers) {
      const numAdults = parseInt(travelers) || 2;
      params.append('adults', Math.min(numAdults, 9).toString());
    }

    console.log(`[Hotels] Searching: ${query} (${checkin} → ${checkout})`);

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
    const data = await response.json();

    if (data.error) {
      console.error('[Hotels] SerpApi error:', data.error);
      return res.status(502).json({ error: 'SerpApi returned an error', details: data.error });
    }

    const rawHotels = data.properties || [];

    const hotels = rawHotels.slice(0, 5).map(hotel => {
      const rateInfo = hotel.rate_per_night || {};
      return {
        name: hotel.name || 'Unknown Hotel',
        rating: hotel.overall_rating ? `${hotel.overall_rating}★` : 'N/A',
        ratingValue: hotel.overall_rating || 0,
        reviews: hotel.reviews ? `${hotel.reviews} reviews` : '',
        price: rateInfo.lowest || rateInfo.before_taxes_fees || 'Price unavailable',
        rawPrice: rateInfo.extracted_lowest || rateInfo.extracted_before_taxes_fees || 0,
        amenities: (hotel.amenities || []).slice(0, 5).join(', '),
        thumbnail: hotel.images?.[0]?.thumbnail || null,
        hotelClass: hotel.hotel_class ? `${hotel.hotel_class}-star` : '',
        checkInTime: hotel.check_in_time || '',
        checkOutTime: hotel.check_out_time || '',
        link: hotel.link || `https://www.google.com/search?q=Hotels+in+${encodeURIComponent(destination)}`
      };
    });

    console.log(`[Hotels] Found ${hotels.length} results`);
    res.json({ hotels });

  } catch (error) {
    console.error('[Hotels] Server error:', error);
    res.status(500).json({ error: 'Failed to search hotels', hotels: [] });
  }
});


// =========================================================
// WhatsApp Delivery (Twilio) — Existing endpoint
// =========================================================
const formatWhatsAppMessage = (details) => {
  return `*🌍 உங்கள் பயண உறுதிப்படுத்தல் (Travel Confirmation)*
  
*📍 புறப்படும் இடம் (From):* ${details.source || 'N/A'}
*🎯 போய் சேரும் இடம் (To):* ${details.destination || 'N/A'}
*📅 தேதி (Date):* ${details.departureDate || 'N/A'}${details.returnDate ? ` - ${details.returnDate}` : ''}
*👥 பயணிகள் (Travelers):* ${details.travelers || 'N/A'}

*✈️ விமானங்கள் (Flights):*
${details.flights && details.flights.length > 0 
  ? details.flights.map((f, i) => `${i+1}. ${f.airline} (${f.price})\n   🔗 Link: ${f.link}`).join('\n') 
  : 'விமானங்கள் எதுவும் கிடைக்கவில்லை. (No flights found)'}

*🏨 ஹோட்டல்கள் (Hotels):*
${details.hotels && details.hotels.length > 0 
  ? details.hotels.map((h, i) => `${i+1}. ${h.name} (${h.price})\n   🔗 Link: ${h.link}`).join('\n') 
  : 'ஹோட்டல்கள் எதுவும் கிடைக்கவில்லை. (No hotels found)'}

*🎟 செயல்பாடுகள் (Activities):* ${details.activities || 'N/A'}

_உங்கள் பயணம் இனிதே அமைய வாழ்த்துக்கள்! (Have a great trip!)_ 🧳✨`;
};

app.post('/api/send-whatsapp', async (req, res) => {
  try {
    const travelDetails = req.body;
    let number = travelDetails.whatsappNumber;

    if (!number) {
      return res.status(400).json({ error: "WhatsApp number is missing from the payload." });
    }

    number = number.replace(/\D/g, '');

    if (number.length === 10) {
      number = `+91${number}`;
    } else if (number.length === 12 && number.startsWith('91')) {
      number = `+${number}`;
    }

    const messageBody = formatWhatsAppMessage(travelDetails);

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
  console.log(`Backend running on port ${PORT}`);
  console.log(`  SerpApi: ${SERPAPI_KEY && SERPAPI_KEY !== 'your_serpapi_key_here' ? '✅ Configured' : '❌ NOT configured — add SERPAPI_KEY to .env'}`);
});
