const express = require('express');
const { captureBillingSummary } = require('./capture');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/capture-billing-summary', async (_req, res) => {
  try {
    const result = await captureBillingSummary();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message,
      capturedAt: new Date().toISOString(),
    });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
