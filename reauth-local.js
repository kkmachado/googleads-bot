const { chromium } = require('playwright');

const SERVER_URL = process.env.PUBLIC_URL || 'http://localhost:3000';
const REAUTH_SECRET = process.env.REAUTH_SECRET || '';

async function reauth() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const page = await context.newPage();

  console.log('Abrindo Google Ads...');
  await page.goto('https://ads.google.com/aw/billing/summary', {
    waitUntil: 'domcontentloaded',
  });

  console.log('Faça login no Google Ads. Aguardando autenticação...');
  await page.waitForURL(
    (url) => !url.includes('accounts.google.com') && !url.includes('signin'),
    { timeout: 120000 }
  );

  await page.waitForTimeout(3000);
  console.log('Login detectado! Salvando sessão...');

  const storageState = await context.storageState();
  await browser.close();

  console.log(`Enviando sessão para ${SERVER_URL}/reauth ...`);
  const response = await fetch(`${SERVER_URL}/reauth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-reauth-secret': REAUTH_SECRET,
    },
    body: JSON.stringify(storageState),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro ao enviar sessão: ${response.status} — ${text}`);
  }

  console.log('Sessão atualizada com sucesso! O bot já pode ser usado.');
}

reauth().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
