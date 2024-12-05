const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const sendOTP = async (phone, otp) => {
  try {
    await client.messages.create({
      body: `Your OTP is: ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
    console.log('OTP sent successfully');
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
};
const sendMessage = async (to, message) => {
  try {
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

module.exports = { sendOTP,sendMessage };

