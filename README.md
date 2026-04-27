# googleads-bot

Serviço HTTP que faz scraping da página de resumo de faturamento do Google Ads e expõe os dados via API. Usado em conjunto com n8n para atualizar automaticamente uma planilha Excel no SharePoint.

## Como funciona

O bot navega para `https://ads.google.com/aw/billing/summary` usando Playwright com uma sessão autenticada persistida em disco. A cada chamada, extrai:

- **Meses**: custo líquido e pagamentos de cada mês listado
- **Saldo de crédito**: valor atual exibido na conta

Os dados são retornados como JSON e consumidos pelo n8n, que limpa e regrava uma planilha Excel a cada execução.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/capture-billing-summary` | Executa o scraping e retorna os dados |
| `POST` | `/reauth` | Recebe um novo `storageState.json` para renovar a sessão |

### Exemplo de resposta — `/capture-billing-summary`

```json
{
  "ok": true,
  "referenceYear": 2026,
  "creditBalanceText": "R$ 46.062,96",
  "creditBalanceValue": 46062.96,
  "months": [
    {
      "monthLabel": "abril (mês atual)",
      "monthDate": "2026-04-01",
      "currentMonth": true,
      "netCostText": "R$ 53.968,41",
      "netCostValue": 53968.41,
      "paymentsText": "R$ 108.880,44",
      "paymentsValue": 108880.44
    }
  ],
  "capturedAt": "2026-04-27T21:52:35.709Z"
}
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `DATA_DIR` | `/app/data` | Diretório para `storageState.json` e screenshots de erro |
| `GOOGLE_ADS_CUSTOMER_ID` | *(vazio)* | ID da conta Google Ads (ex: `628-123-7076`), usado para selecionar a conta automaticamente |
| `WEBHOOK_SESSION_EXPIRED_URL` | *(vazio)* | URL para notificação quando a sessão expirar |
| `PUBLIC_URL` | `http://localhost:3000` | URL pública do serviço, incluída nas instruções de reautenticação |
| `REAUTH_SECRET` | *(vazio)* | Token de proteção do endpoint `/reauth` |

## Instalação e execução

```bash
npm install
npm start
```

### Docker

```bash
docker build -t googleads-bot .
docker run -p 3000:3000 -v $(pwd)/data:/app/data googleads-bot
```

## Autenticação

O bot não faz login automaticamente. É necessário um `storageState.json` válido em `DATA_DIR` antes da primeira execução. O arquivo é atualizado a cada captura bem-sucedida para manter a sessão ativa.

### Reautenticar quando a sessão expirar

Quando a sessão expira, o bot envia uma notificação para `WEBHOOK_SESSION_EXPIRED_URL` com instruções. Para renovar a sessão, execute localmente:

```bash
PUBLIC_URL=https://seu-servidor.com REAUTH_SECRET=seu-secret node reauth-local.js
```

O script abre um browser, aguarda o login no Google Ads, e envia a sessão atualizada para o servidor automaticamente.

> **Atenção:** O Pi-hole e outros bloqueadores de DNS bloqueiam `ads.google.com`. Desative-os antes de rodar o `reauth-local.js`.

## Integração com n8n

O fluxo n8n configurado roda diariamente às 8h e:

1. Chama `POST /capture-billing-summary`
2. Formata os dados com um nó de código
3. Limpa a planilha Excel (`A2:L999`)
4. Grava os meses atualizados

Fluxo completo (JSON para importar no n8n):

<details>
<summary>Ver JSON</summary>

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://marketing-googleads-bot.qqbqnt.easypanel.host/capture-billing-summary",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.3,
      "position": [208, 0],
      "id": "d213feba-5442-44dc-a60b-c990e5cde99d",
      "name": "HTTP Request"
    },
    {
      "parameters": {
        "jsCode": "const data = $input.first().json;\n\nif (!data.ok) {\n throw new Error(data.message || 'Falha ao capturar billing summary');\n}\n\nreturn data.months.map(month => ({\n  json: {\n    data: month.monthDate,\n    mes: month.monthLabel,\n    ano_referencia: data.referenceYear,\n    mes_atual: month.currentMonth,\n    custo_liquido: month.netCostValue,\n    pagamentos: month.paymentsValue,\n    custo_liquido_texto: month.netCostText,\n    pagamentos_texto: month.paymentsText,\n    saldo_credito: data.creditBalanceValue,\n    capturado_em: data.capturedAt,\n  }\n}));"
      },
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [416, 0],
      "id": "fc1730c6-b07f-44a0-bb5e-a475706ca91b",
      "name": "Code in JavaScript"
    },
    {
      "parameters": {
        "resource": "worksheet",
        "operation": "append",
        "workbook": {
          "__rl": true,
          "value": "01WVQYR3PLTAORTKUNSRH2BP6AOC3HJENN",
          "mode": "list",
          "cachedResultName": "Custos Google Ads",
          "cachedResultUrl": "https://ticarbonblindados-my.sharepoint.com/personal/carlos_machado_carbon_cars/_layouts/15/Doc.aspx?sourcedoc=%7B191D98EB-8DAA-4F94-A0BF-C070B67491AD%7D&file=Custos%20Google%20Ads.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"
        },
        "worksheet": {
          "__rl": true,
          "value": "{00000000-0001-0000-0000-000000000000}",
          "mode": "list",
          "cachedResultName": "Google Ads",
          "cachedResultUrl": "https://ticarbonblindados-my.sharepoint.com/personal/carlos_machado_carbon_cars/_layouts/15/Doc.aspx?sourcedoc=%7B191D98EB-8DAA-4F94-A0BF-C070B67491AD%7D&file=Custos%20Google%20Ads.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1&activeCell=Google%20Ads!A1"
        },
        "fieldsUi": {
          "values": [
            {
              "column": "Custo líquido",
              "fieldValue": "={{ $('Code in JavaScript').item.json.custo_liquido }}"
            },
            {
              "column": "Pagamentos",
              "fieldValue": "={{ $('Code in JavaScript').item.json.pagamentos }}"
            },
            {
              "column": "Data",
              "fieldValue": "={{ $('Code in JavaScript').item.json.data }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.microsoftExcel",
      "typeVersion": 2.2,
      "position": [832, 0],
      "id": "7f86afc8-b5f3-465b-a7fd-ea35ef1820d0",
      "name": "Append data to sheet",
      "credentials": {
        "microsoftExcelOAuth2Api": {
          "id": "sLdz5Sb2xYnYBhqn",
          "name": "Microsoft Excel account"
        }
      }
    },
    {
      "parameters": {
        "resource": "worksheet",
        "operation": "clear",
        "workbook": {
          "__rl": true,
          "value": "01WVQYR3PLTAORTKUNSRH2BP6AOC3HJENN",
          "mode": "list",
          "cachedResultName": "Custos Google Ads",
          "cachedResultUrl": "https://ticarbonblindados-my.sharepoint.com/personal/carlos_machado_carbon_cars/_layouts/15/Doc.aspx?sourcedoc=%7B191D98EB-8DAA-4F94-A0BF-C070B67491AD%7D&file=Custos%20Google%20Ads.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"
        },
        "worksheet": {
          "__rl": true,
          "value": "{00000000-0001-0000-0000-000000000000}",
          "mode": "list",
          "cachedResultName": "Google Ads",
          "cachedResultUrl": "https://ticarbonblindados-my.sharepoint.com/personal/carlos_machado_carbon_cars/_layouts/15/Doc.aspx?sourcedoc=%7B191D98EB-8DAA-4F94-A0BF-C070B67491AD%7D&file=Custos%20Google%20Ads.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1&activeCell=Google%20Ads!A1"
        },
        "useRange": true,
        "range": "A2:L999"
      },
      "type": "n8n-nodes-base.microsoftExcel",
      "typeVersion": 2.2,
      "position": [624, 0],
      "id": "1af45d08-b06f-47b7-9af6-b7bb55efd918",
      "name": "Clear sheet",
      "credentials": {
        "microsoftExcelOAuth2Api": {
          "id": "sLdz5Sb2xYnYBhqn",
          "name": "Microsoft Excel account"
        }
      }
    },
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "hours",
              "hoursInterval": 2
            }
          ]
        }
      },
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.3,
      "position": [-16, 0],
      "id": "677acfa3-9ff8-4515-9a75-3fceb5a5f6b9",
      "name": "Schedule Trigger"
    },
    {
      "parameters": {
        "resource": "worksheet",
        "operation": "append",
        "workbook": {
          "__rl": true,
          "value": "01WVQYR3PLTAORTKUNSRH2BP6AOC3HJENN",
          "mode": "list",
          "cachedResultName": "Custos Google Ads",
          "cachedResultUrl": "https://ticarbonblindados-my.sharepoint.com/personal/carlos_machado_carbon_cars/_layouts/15/Doc.aspx?sourcedoc=%7B191D98EB-8DAA-4F94-A0BF-C070B67491AD%7D&file=Custos%20Google%20Ads.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1"
        },
        "worksheet": {
          "__rl": true,
          "value": "{B1AF6DB1-E430-453C-8A32-1A92D21F99D8}",
          "mode": "list",
          "cachedResultName": "Visão geral",
          "cachedResultUrl": "https://ticarbonblindados-my.sharepoint.com/personal/carlos_machado_carbon_cars/_layouts/15/Doc.aspx?sourcedoc=%7B191D98EB-8DAA-4F94-A0BF-C070B67491AD%7D&file=Custos%20Google%20Ads.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1&activeCell=Vis%C3%A3o%20geral!A1"
        },
        "fieldsUi": {
          "values": [
            {
              "column": "Saldo",
              "fieldValue": "={{ $('Code in JavaScript').item.json.saldo_credito }}"
            },
            {
              "column": "Atualização",
              "fieldValue": "={{ $('Code in JavaScript').item.json.capturado_em.toDateTime().toLocal().format('yyyy-MM-dd HH:mm:ss') }}"
            }
          ]
        },
        "options": {}
      },
      "type": "n8n-nodes-base.microsoftExcel",
      "typeVersion": 2.2,
      "position": [1248, 0],
      "id": "40ed6fcb-f6c6-4715-9d30-cb8efef9bbe9",
      "name": "Append data to sheet1",
      "credentials": {
        "microsoftExcelOAuth2Api": {
          "id": "sLdz5Sb2xYnYBhqn",
          "name": "Microsoft Excel account"
        }
      }
    },
    {
      "parameters": {},
      "type": "n8n-nodes-base.limit",
      "typeVersion": 1,
      "position": [1040, 0],
      "id": "38215032-5dd6-4f23-87b1-9a3503502312",
      "name": "Limit"
    }
  ],
  "connections": {
    "HTTP Request": {
      "main": [[{"node": "Code in JavaScript", "type": "main", "index": 0}]]
    },
    "Code in JavaScript": {
      "main": [[{"node": "Clear sheet", "type": "main", "index": 0}]]
    },
    "Append data to sheet": {
      "main": [[{"node": "Limit", "type": "main", "index": 0}]]
    },
    "Clear sheet": {
      "main": [[{"node": "Append data to sheet", "type": "main", "index": 0}]]
    },
    "Schedule Trigger": {
      "main": [[{"node": "HTTP Request", "type": "main", "index": 0}]]
    },
    "Limit": {
      "main": [[{"node": "Append data to sheet1", "type": "main", "index": 0}]]
    }
  },
  "pinData": {},
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "baebb0c6bb620a1bb861f23664920cd2b38b6dd9045767a0da46c801b721d150"
  }
}
```

</details>
