# NBB GPT-Live Ripple Test Relay v0.1.0

TEST-ONLY isolated relay for `carpetcleaningannarbor.com`.

## What this is

This is a separate GPT-Live/Ripple voice transport for proving the migration without changing the known-good production stack.

Test path:

Twilio TEST number -> test-domain WordPress adapter -> this relay -> GPT-Live (`gpt-live-1`, `ripple`) -> Responses backend -> adapter -> existing NBB `.63` `/nearby-booker-ai/v1/voice/tool`.

The package deliberately does **not** require changes to:

- NBB `1.38.299.3.63`
- shared GeoVee Proxy `1.3.49.2.47`
- production Voice Relay `0.2.39`

## Parity contract carried into this test

The adapter copies the exact Proxy `.47` Phone AI backend instruction contract and the relay exposes the exact 20 Proxy `.47` tool schemas. The test relay also keeps generic deterministic state gates that were important in Relay `.39`, including:

- multi-service completion checkpoint
- caller goal continuity (booking vs estimate vs reschedule/cancel)
- explicit booking-phone choice
- one-time alternate-phone confirmation
- one-time email confirmation and lock
- final booking confirmation separate from contact confirmation
- validated address continuity
- caller-requested SMS/email guard
- recent caller-visible conversation metadata sent back to NBB `.63` for service/secondary-option grounding

No carpet-cleaning-specific service rules are hardcoded here. NBB remains authoritative for services, private AI descriptions/selection rules, secondary variants/questions, address validation, availability, pricing, estimates, and booking actions.

## Required Render environment variables

- `OPENAI_API_KEY` — OpenAI project API key with GPT-Live access.
- `NBB_ADAPTER_SECRET` — copy from WordPress **Settings -> GPT-Live Ripple Test**.
- `NBB_TEST_SITE_HOST=carpetcleaningannarbor.com`
- `LIVE_VOICE=ripple`
- `BACKEND_MODEL=gpt-6-luna`
- `LOG_TRANSCRIPTS=1` for the first test; set `0` later if you do not want transcript fragments in Render logs.

After deployment, the WebSocket URL is:

`wss://YOUR-RENDER-HOST/twilio/live`

Paste that into the WordPress test plugin settings.

## First proof call

Use a broad normal booking call that exercises NBB instead of a canned script. Confirm at minimum:

1. service selection comes from NBB
2. configured secondary/service questions are asked
3. multiple services/quantities stay in state
4. the service address is validated by NBB
5. only live NBB availability is offered
6. contact confirmation happens once
7. booking review and final confirmation remain separate
8. NBB returns success before the voice claims the booking succeeded

## Intentional proof-test limit

Human-transfer and tenant priority/emergency execution are not enabled in v0.1.0. They are intentionally excluded so this first test cannot reroute a real phone call while proving the hard booking/estimate path.

Do not route a production number here yet.
