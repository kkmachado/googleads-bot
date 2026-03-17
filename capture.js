const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function brlToNumber(v) {
  return Number(
    String(v)
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
  );
}

async function ensureDirs(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'google-session'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'screenshots'), { recursive: true });
}

async function captureCurrentMonthPayments() {
  const dataDir = process.env.DATA_DIR || '/app/data';
  const sessionDir = path.join(dataDir, 'google-session');
  const screenshotsDir = path.join(dataDir, 'screenshots');

  await ensureDirs(dataDir);

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: true,
    viewport: { width: 1440, height: 1400 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    await page.goto('https://ads.google.com/aw/billing/summary', {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    await page.waitForLoadState('networkidle', { timeout: 120000 });

    const currentMonth = page.locator('text=(mês atual)').first();
    await currentMonth.waitFor({ timeout: 120000 });

    const section = currentMonth.locator('xpath=ancestor::*[self::div or self::section][1]');
    const blockText = await section.innerText();

    const match = blockText.match(/Pagamentos\s*R\$\s*([\d\.\,]+)/i);
    if (!match) {
      throw new Error(`Não foi possível encontrar o campo Pagamentos. Texto capturado: ${blockText}`);
    }

    const paymentsText = `R$ ${match[1]}`;
    const paymentsValue = brlToNumber(paymentsText);

    const monthMatch = blockText.match(/^([^\n]+\(mês atual\))/im);
    const monthLabel = monthMatch ? monthMatch[1].trim() : 'mês atual';

    await context.close();

    return {
      monthLabel,
      paymentsText,
      paymentsValue,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    const file = path.join(screenshotsDir, `capture-error-${Date.now()}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true });
    } catch {}

    await context.close();
    throw error;
  }
}

module.exports = { captureCurrentMonthPayments };
