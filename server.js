require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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

app.get('/test', (req, res, next) => {
  try {
    res.json({ message: 'Welcome test' });
  } catch (error) {
    next(error);
  }
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

// Sign up
app.get('/auth/signup', async (req, res) => {
  const { username, email, password, phone } = req.body;
  try {
    // Check if user already exists
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1 OR phone = $2', [email, phone]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store user data temporarily
    pendingUsers.set(phone, {
      username,
      email,
      password: hashedPassword,
      phone,
      otp
    });

    // Send OTP via Twilio
    await sendOTP(phone, otp);
    console.log(otp);
    res.status(200).json({ message: 'OTP sent to your phone. Please verify to complete registration.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify OTP and complete registration
app.get('/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  try {
    const pendingUser = pendingUsers.get(phone);
    if (!pendingUser) {
      return res.status(400).json({ message: 'No pending registration found for this phone number' });
    }

    if (pendingUser.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Insert user into database
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password, phone, is_verified) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [pendingUser.username, pendingUser.email, pendingUser.password, pendingUser.phone, true]
    );

    // Remove user from pending list
    pendingUsers.delete(phone);

    // Generate JWT
    const token = jwt.sign({ id: newUser.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ message: 'User registered successfully', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
app.get('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.rows[0].is_verified) {
      return res.status(400).json({ message: 'Please verify your account first' });
    }

    const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Forgot password
app.get('/auth/forgot-password', async (req, res) => {
  const { phone } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP temporarily
    if (!global.otpStore) {
      global.otpStore = new Map();
    }
    global.otpStore.set(phone, otp);

    // Send OTP via Twilio to the user's phone number
    await sendOTP(phone, otp);
    console.log("password-reset otp " + otp);
    res.json({ message: 'OTP sent to your phone number' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset password
app.get('/auth/reset-password', async (req, res) => {
  const { phone, otp, newPassword } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (user.rows.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Verify OTP
    const storedOTP = global.otpStore.get(phone);
    if (!storedOTP || storedOTP !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user's password
    await pool.query('UPDATE users SET password = $1 WHERE phone = $2', [hashedPassword, phone]);

    // Remove OTP from the store after password reset
    global.otpStore.delete(phone);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Forward message
app.get('/auth/forward-message', async (req, res) => {
  const { text, senderPhone } = req.body;

  if (!text || !senderPhone) {
    return res.status(400).json({ message: 'Text and sender phone number are required' });
  }

  try {
    // Retrieve all registered and verified users
    const users = await pool.query('SELECT phone FROM users WHERE is_verified = true');

    if (users.rows.length === 0) {
      return res.status(404).json({ message: 'No registered users found' });
    }

    // Forward the message to each user
    const sendPromises = users.rows.map(user => 
      sendMessage(user.phone, `Message from ${senderPhone}: ${text}`)
    );
    
    await Promise.all(sendPromises);

    res.status(200).json({ message: `Message forwarded to ${users.rows.length} users` });
  } catch (error) {
    console.error('Error forwarding message:', error);
    res.status(500).json({ message: 'Server error while forwarding message' });
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database', err);
  } else {
    console.log('Connected to the database');
  }
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

console.log('Server initialized');

// Export the Express app
module.exports = app;

