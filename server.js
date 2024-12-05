require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth');
const { pool } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Routes
app.use('/auth', authRoutes);
/* providing access token in bearer */


// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database', err);
  } else {
    console.log('Connected to the database');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

