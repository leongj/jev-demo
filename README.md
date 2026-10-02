# Understanding Jev

Simple demo app that

### Explains difference between LLM and Jev
<img width="997" height="762" alt="image" src="https://github.com/user-attachments/assets/be2a2f31-db3e-4795-8e49-e1a1f262060b" />

### Supports a number of different scenarios and shows the underlying JSON
<img width="1010" height="829" alt="image" src="https://github.com/user-attachments/assets/9a43483c-1b77-4109-a219-60ec75e9b8e0" />

### Explains output types
<img width="983" height="514" alt="image" src="https://github.com/user-attachments/assets/4165149e-2cdf-4ae8-a748-5e6d95292ca7" />

### Runs a head-to-head live demo
<img width="991" height="529" alt="image" src="https://github.com/user-attachments/assets/93f28761-a75e-4fdc-90da-11fa0263a23a" />

### Compare the output in speed and cost
<img width="983" height="747" alt="image" src="https://github.com/user-attachments/assets/a2524c70-cef5-48c5-89bd-a355b34fabd0" />

## To run
```powershell
npm ci
npm run dev
```

## Environment
- Azure AI Foundry for GPT-6 or other LLM
- Typesafe API for Jev

Set credentials locally in `.env.local` (gitignored), then restart the server:

```dotenv
TYPESAFE_API_KEY=YOUR-KEY
AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=YOUR-DEPLOYMENT
AZURE_OPENAI_MODEL=gpt-6-luna
AZURE_OPENAI_AUTH=entra
```

Entra uses `DefaultAzureCredential`, including your `az login`. Optional key auth: `AZURE_OPENAI_AUTH=key` and `AZURE_OPENAI_API_KEY`.

This worktree has non-secret Azure defaults in the ignored `.env`; `.env.local` takes precedence. Your Jev key stays untouched. No enable flag or confirmation checkbox is required.

## Contracts

- GPT is called through Azure OpenAI `/openai/v1/responses` with `store:false`, `stream:true`, and `reasoning.effort:none`. The selector in the GPT input card's header offers **text** and **structured outputs**. Both request Jev's `answers` shape except in sales opportunity matching, which requests the smaller Frontier-style matching contract. Text relies on instructions, while structured outputs also enforce a schema through `text.format`. Both validate the final answers. Provider API envelopes stay native. Generated confidence estimates are not evidence of calibration.
- Jev calls `https://api.typesafe.ai/v1/systemone`. Noul returns P(yes); Choice selects one option with its distribution/confidence; Score returns a weighted ordered level index with its distribution/confidence.
- Live calls only happen when clicked. Fixtures are explicitly illustrative, never timed or benchmarked, and never substituted for failed live calls.

Server complete timing ends at Responses API `response.completed` or Jev's whole body. It covers the provider call; Azure auth precedes that stopwatch. GPT also displays **First token**, measured at the first streamed text delta. Jev has no first-token metric displayed. Browser timing is recorded internally but not displayed.

Calls are bounded to two concurrent requests, 30 attempts/minute and 60 seconds per call, with no retries.

Jev's published input price is USD $0.042/million tokens, output free (checked 2026-10-01). GPT-6 Luna estimates default to USD **$0.10 input, $0.01 cached input, $0.50 output per million tokens**. These are UK South Global Standard short-context prices from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=armRegionName%20eq%20%27uksouth%27%20and%20contains(meterName,%20%27luna%27)), checked 2026-10-01; the existing deployment is Global Standard. Environment price overrides remain available; other models require explicit rates. Usage comes from actual responses, with cached reads deducted from ordinary input. Estimates exclude unreported cache-write surcharges, taxes and discounts.

This is a trusted local demo, not an authenticated public service. Live requests may incur charges. Keep secrets server-side. There is no test suite.

References: [Jev API](https://docs.typesafe.ai/api), [primitives](https://docs.typesafe.ai/primitives), [limits](https://docs.typesafe.ai/models), [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [Azure Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses), [Luna reasoning](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning#api-and-feature-support).
