# Chatwoot Agent Bot — Notaría Pública 192 (demo)

Microservicio independiente que conecta un **Agent Bot de Chatwoot** con un agente
LLM (OpenAI `gpt-4o-mini` vía AI SDK). Atiende clientes por WhatsApp: responde
sobre servicios y precios, consulta el estado de trámites por número de teléfono y
transfiere con un abogado humano cuando se le pide.

## Stack
- Node.js + TypeScript
- Hono.js (HTTP)
- AI SDK (`ai` + `@ai-sdk/openai`) con `gpt-4o-mini`
- Procesamiento async con `setImmediate` (sin BullMQ/Redis/Supabase)

## Estructura
```
src/
  index.ts     → servidor Hono, POST /webhook (filtro anti-bucle + ACK + async)
  chatwoot.ts  → cliente API Chatwoot (sendMessage, assignToHuman)
  agent.ts     → LLM + system prompt + tools (get_expediente, transfer_to_human)
  data.ts      → expedientes ficticios + info/precios de la notaría
```

## Correr en local
```bash
npm install
cp .env.example .env   # y rellena los valores
npm run dev            # tsx watch, http://localhost:3000
```

`POST /webhook` recibe el payload del Agent Bot de Chatwoot.
`GET /health` para health checks.

## Variables de entorno (.env)
| Variable | Descripción |
|---|---|
| `CHATWOOT_BASE_URL` | URL de tu Chatwoot (ej. `https://app.chatwoot.com`) |
| `CHATWOOT_ACCOUNT_ID` | ID numérico de la cuenta (lo ves en la URL del dashboard) |
| `CHATWOOT_API_TOKEN` | Access token de un agente/bot con permisos |
| `CHATWOOT_HUMAN_AGENT_ID` | ID del agente humano al que se transfiere |
| `OPENAI_API_KEY` | API key de OpenAI |
| `PORT` | Puerto del servidor (opcional, default 3000) |

## Notas del demo
- Sin memoria de conversación: cada mensaje se procesa con el contexto del cliente
  ya inyectado en el system prompt (suficiente para el demo).
- Los datos de `data.ts` (expedientes y precios) son **ficticios**.
