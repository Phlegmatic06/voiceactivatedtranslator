import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const from = process.env.TWILIO_WHATSAPP_NUMBER;
const to = 'whatsapp:+918089456382'; // Replace with a known test number or use an arg

async function test() {
  console.log('Sending from:', from);
  console.log('Sending to:', to);
  try {
    const message = await client.messages.create({
      body: 'Test message from Vazhi AI',
      from,
      to
    });
    console.log('Success! SID:', message.sid);
  } catch (err) {
    console.error('Failed!', err);
  }
}

test();
