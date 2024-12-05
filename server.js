require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const serverless = require('serverless-http');
const { pool } = require('./db');
const { sendOTP, sendMessage } = require('./utils/twilio');

const app = express();

app.use(bodyParser.json());

// Add CSP headers middleware
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live; style-src 'self' 'unsafe-inline';"
  );
  next();
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API' });
});

// Test route
app.post('/test', (req, res) => {
  res.json({ message: 'Welcome test' });
});

// Temporary storage for users in signup process
const pendingUsers = new Map();

// Auth routes
app.get('/auth', (req, res) => {
  res.send({
    activeStatus: true,
    error: false,
  });
});

// Sign-up
app.post('/auth/signup', async (req, res) => {
  const { username, email, password, phone } = req.body;
  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1 OR phone = $2', [email, phone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    pendingUsers.set(phone, { username, email, password: hashedPassword, phone, otp });

    await sendOTP(phone, otp);
    console.log(otp);
    res.status(200).json({ message: 'OTP sent to your phone. Please verify to complete registration.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Other routes (verify-otp, login, forgot-password, reset-password, forward-message) are similar to the original Express app

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Export the app as a serverless function handler
module.exports = serverless(app);
