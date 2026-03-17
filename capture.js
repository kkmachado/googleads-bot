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

async function captureCurrentMonthPayments() {
  const dataDir = process.env.DATA_DIR || '/app/data';
  const sessionDir = path.join(dataDir, 'google-session');
  const screenshotsDir = path.join(dataDir, 'screenshots');

  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: true,
    viewport: { width: 1440, height: 1400 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const page = context.pages()[0] || await context.newPage();

  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  try {
    await page.goto('https://ads.google.com/aw/billing/summary', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    const title = await page.title().catch(() => '');

    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
      throw new Error(`Sessão Google não autenticada. URL atual: ${currentUrl}`);
    }

    const bodyText = await page.locator('body').innerText().catch(() => '');

    if (/fazer login|sign in|login/i.test(bodyText)) {
      throw new Error(`Tela de login detectada. URL atual: ${currentUrl}`);
    }

    const currentMonth = page.locator('text=(mês atual)').first();
    const count = await currentMonth.count();

    if (!count) {
      const screenshot = path.join(screenshotsDir, `no-current-month-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      throw new Error(
        `Não encontrei "(mês atual)". URL: ${currentUrl}. Título: ${title}. Início da página: ${bodyText.slice(0, 800)}`
      );
    }

    await currentMonth.waitFor({ timeout: 15000 });

    const section = currentMonth.locator('xpath=ancestor::*[self::div or self::section][1]');
    const blockText = await section.innerText();

    const match = blockText.match(/Pagamentos\s*R\$\s*([\d\.\,]+)/i);
    if (!match) {
      const screenshot = path.join(screenshotsDir, `no-payments-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      throw new Error(`Não encontrei o campo Pagamentos. Texto do bloco: ${blockText}`);
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
    const screenshot = path.join(screenshotsDir, `capture-error-${Date.now()}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    await context.close();
    throw error;
  }
}

module.exports = { captureCurrentMonthPayments };
