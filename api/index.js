const express = require('express');
const app = express();
const port = 3000;

// Add the auth router import
const authRouter = require('./auth');

app.get('/', (req, res) => {
  res.send('Hello from the root route!');
});

// Use the auth router
app.use('/auth', authRouter);

app.get('*', (req, res) => {
  res.status(404).send('Not Found');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});