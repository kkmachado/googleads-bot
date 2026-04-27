const fs = require('fs');
const path = require('path');
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

app.post('/reauth', (req, res) => {
  const secret = process.env.REAUTH_SECRET;
  if (secret && req.headers['x-reauth-secret'] !== secret) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const dataDir = process.env.DATA_DIR || '/app/data';
  const storageStatePath = path.join(dataDir, 'storageState.json');

  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storageStatePath, JSON.stringify(req.body, null, 2));
    res.json({ ok: true, message: 'Sessão atualizada com sucesso' });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
