const express = require('express');
const { captureCurrentMonthPayments } = require('./capture');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/capture-current-payments', async (_req, res) => {
  try {
    const result = await captureCurrentMonthPayments();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
      capturedAt: new Date().toISOString(),
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});