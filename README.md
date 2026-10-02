# Understanding Jev

A local API demo: shared input, GPT streamed JSON (text generation or strict schema), and Jev typed probabilities.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Three sections organise the page: **What is Jev?**, **Scenario**, and **Live demo**. The introduction is a simple animated illustration of LLM next-token probabilities versus Jev typed-answer probabilities, with Noul / Choice / Score controls. Its numbers are illustrative, not API results or model internals. The selector sits beside the Scenario heading. Grey state/questions summaries are each followed by their collapsed JSON editor; the question-type guide stays collapsed below them. Valid edits update the readable summaries. Live demo contains side-by-side request payloads, responses, timings and cost/usage. GPT offers **Pretty output / Output JSON / Full JSON**; Output JSON shows only the native `output` array. Jev offers **Pretty output / JSON**. Scenario changes load labelled example responses without API calls.

Use **Run GPT** or **Run Jev** in the respective card header, or the centred **Run both**, to replace examples with streamed live results. All run buttons call live providers; there is no fixture-mode selector or header configuration control. Usage is always visible when returned.

The LLM illustration holds each candidate-token distribution for 600 ms, highlights and appends its selected token for 300 ms, then updates for the next step. **Pause / Play** and **Replay** control the presentation; reduced-motion preferences pause autoplay. Candidate scores are authored word-sized token illustrations, not live model log probabilities. Jev has two boxes: state/question/possible answers directly to typed output with probabilities. Choice and Score include confidence; Noul has no separate confidence field.

GPT input has **Pretty / JSON** views in the same fixed-height scroll pane. Pretty shows readable instructions and the decoded, highlighted input; JSON shows the full request body.

The cost and usage row matches the timing row. Cost is estimated USD per 1000 runs at the current response's token usage, displayed to three decimal places; input/output counts are for that single run. The actual input/output and applicable cached-input rates used in the calculation appear beneath the cost, in USD per million tokens, including any environment overrides.

**Single** shows and sends the selected question only. **All** restores the full question set, retaining edits made to individual questions.

## Environment

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

- GPT is called through Azure OpenAI `/openai/v1/responses` with `store:false`, `stream:true`, and `reasoning.effort:none`. The selector in the GPT input card's header offers **text** and **structured outputs**. Both request Jev's `answers` shape; text relies on instructions, while structured outputs also enforce a schema through `text.format`. Both validate the final answers. Provider API envelopes stay native. Generated confidence estimates are not evidence of calibration.
- Jev calls `https://api.typesafe.ai/v1/systemone`. Noul returns P(yes); Choice selects one option with its distribution/confidence; Score returns a weighted ordered level index with its distribution/confidence.
- Live calls only happen when clicked. Fixtures are explicitly illustrative, never timed or benchmarked, and never substituted for failed live calls.

Server complete timing ends at Responses API `response.completed` or Jev's whole body. It covers the provider call; Azure auth precedes that stopwatch. First text is separate. Browser timing is not displayed.

Calls are bounded to two concurrent requests, 30 attempts/minute and 60 seconds per call, with no retries.

Jev's published input price is USD $0.042/million tokens, output free (checked 2026-10-01). GPT-6 Luna estimates default to USD **$0.10 input, $0.01 cached input, $0.50 output per million tokens**. These are UK South Global Standard short-context prices from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices?currencyCode=USD&$filter=armRegionName%20eq%20%27uksouth%27%20and%20contains(meterName,%20%27luna%27)), checked 2026-10-01; the existing deployment is Global Standard. Environment price overrides remain available; other models require explicit rates. Usage comes from actual responses, with cached reads deducted from ordinary input. Estimates exclude unreported cache-write surcharges, taxes and discounts.

This is a trusted local demo, not an authenticated public service. Live requests may incur charges. Keep secrets server-side. There is no test suite.

References: [Jev API](https://docs.typesafe.ai/api), [primitives](https://docs.typesafe.ai/primitives), [limits](https://docs.typesafe.ai/models), [jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [Azure Responses](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses), [Luna reasoning](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning#api-and-feature-support).
