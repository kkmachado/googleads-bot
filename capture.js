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

function extractMoneyValues(text) {
  return [...text.matchAll(/R\$\s*[\d\.\,]+/g)].map((m) => m[0]);
}

function normalizeMonthLabel(label) {
  return label.replace(/\s+/g, ' ').trim();
}

const monthMap = {
  janeiro: 1,
  fevereiro: 2,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

function extractMonthNumber(monthLabel) {
  const normalized = monthLabel
    .toLowerCase()
    .replace(/\s+\(mês atual\)/i, '')
    .trim();

  return monthMap[normalized] || null;
}

function buildMonthDate(referenceYear, monthLabel) {
  const monthNumber = extractMonthNumber(monthLabel);
  if (!referenceYear || !monthNumber) return null;

  return `${referenceYear}-${String(monthNumber).padStart(2, '0')}-01`;
}

async function captureBillingSummary() {
  const dataDir = process.env.DATA_DIR || '/app/data';
  const screenshotsDir = path.join(dataDir, 'screenshots');
  const storageStatePath = path.join(dataDir, 'storageState.json');

  fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  const contextOptions = {
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  };

  if (fs.existsSync(storageStatePath)) {
    contextOptions.storageState = storageStatePath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  try {
    await page.goto('https://ads.google.com/aw/billing/summary', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
      throw new Error(`Sessão Google não autenticada. URL atual: ${currentUrl}`);
    }

    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/fazer login|sign in|login/i.test(bodyText)) {
      throw new Error(`Tela de login detectada. URL atual: ${currentUrl}`);
    }

    let referenceYear = null;

    const yearCandidates = await page.locator('text=/^20\\d{2}$/').allInnerTexts().catch(() => []);

    if (yearCandidates.length) {
      const years = yearCandidates
        .map((y) => Number(String(y).trim()))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);

      if (years.length) {
        referenceYear = Math.max(...years);
      }
    }

    if (!referenceYear) {
      const bodyYearMatches = [...bodyText.matchAll(/\b20\d{2}\b/g)]
        .map((m) => Number(m[0]))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);

      if (bodyYearMatches.length) {
        referenceYear = Math.max(...bodyYearMatches);
      }
    }

    if (!referenceYear) {
      throw new Error('Não foi possível identificar o ano de referência.');
    }

    const monthRegex =
      /^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+\(mês atual\))?$/i;

    const allTextLocators = page.locator('text=/./');
    const count = await allTextLocators.count();

    const monthEntries = [];

    for (let i = 0; i < count; i++) {
      const locator = allTextLocators.nth(i);
      const rawText = (await locator.innerText().catch(() => '')).trim();

      if (!monthRegex.test(rawText)) continue;

      const monthLabel = normalizeMonthLabel(rawText);

      let blockText = '';
      let found = false;

      for (let level = 1; level <= 10; level++) {
        const container = locator.locator(`xpath=ancestor::*[self::div or self::section][${level}]`);
        const text = await container.innerText().catch(() => '');

        const hasCost = /Custo líquido/i.test(text);
        const hasPayments = /Pagamentos/i.test(text);
        const moneyValues = extractMoneyValues(text);

        if (hasCost && hasPayments && moneyValues.length >= 2) {
          blockText = text;
          found = true;
          break;
        }
      }

      if (!found) continue;

      const moneyValues = extractMoneyValues(blockText);
      if (moneyValues.length < 2) continue;

      const entry = {
        monthLabel,
        monthDate: buildMonthDate(referenceYear, monthLabel),
        currentMonth: /\(mês atual\)/i.test(monthLabel),
        netCostText: moneyValues[0],
        netCostValue: brlToNumber(moneyValues[0]),
        paymentsText: moneyValues[1],
        paymentsValue: brlToNumber(moneyValues[1]),
        rawText: blockText,
      };

      const exists = monthEntries.some(
        (item) => item.monthLabel.toLowerCase() === entry.monthLabel.toLowerCase()
      );

      if (!exists) {
        monthEntries.push(entry);
      }
    }

    if (!monthEntries.length) {
      const screenshot = path.join(screenshotsDir, `no-months-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      throw new Error('Não consegui extrair nenhum mês do resumo de faturamento.');
    }

    await context.storageState({ path: storageStatePath });

    await context.close();
    await browser.close();

    return {
      referenceYear,
      months: monthEntries,
      capturedAt: new Date().toISOString(),
    };
  } catch (error) {
    const screenshot = path.join(screenshotsDir, `capture-error-${Date.now()}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    throw error;
  }
}

module.exports = { captureBillingSummary };
