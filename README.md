# Agente de reclutamiento — demo Wapi

Microservicio independiente que conecta un **Agent Bot de Chatwoot** con un
**agente de IA de reclutamiento** para una agencia de colocación de personal en
el sector financiero en CDMX.

El agente contacta candidatos que ya aplicaron a las vacantes, les presenta la
posición, resuelve sus dudas con información exacta, y recopila sus datos para
agendar entrevista. Al terminar, cierra avisando que **un reclutador humano lo
contactará en breve**.

El agente recibe el **historial de la conversación** en cada turno, así que
mantiene contexto multi-turno (clave para el flujo: apertura → presentación →
dudas → recopilación de datos → cierre).

## Stack
- Node.js + TypeScript
- Hono.js (HTTP)
- AI SDK (`ai` + `@ai-sdk/openai`) con `gpt-4o-mini`
- Procesamiento async con `setImmediate` (sin BullMQ/Redis/Supabase)
- Vitest (unit + behavioral + smoke)

## Estructura
```
src/
  index.ts     → servidor Hono, POST /webhook (filtro anti-bucle + ACK + async)
                 + historial en memoria por conversación + cola secuencial
  chatwoot.ts  → cliente API Chatwoot (sendMessage, assignToHuman,
                 getConversationMessages)
  agent.ts     → LLM + system prompt de reclutamiento
                 + helpers puros (buildSystemPrompt, isFirstMessage,
                 mapChatwootMessages)
tests/
  unit/        → prompt, history, filter, queue (sin red, <1s)
  behavioral/  → runAgent con el LLM mockeado
  smoke/       → escenarios contra OpenAI real (se corren manualmente)
```

## Cómo funciona
1. Chatwoot envía un webhook del Agent Bot a `POST /webhook`.
2. Se filtran eventos que no son mensajes entrantes y públicos (anti-bucle).
3. Se responde `200` de inmediato y se procesa en segundo plano, en orden por
   conversación.
4. Se recupera el historial en memoria de la conversación y se invoca al agente
   con ese historial + el mensaje actual.
5. El agente responde siguiendo el flujo de reclutamiento (dividiendo en varios
   mensajes si usa `|||`).

Mientras haya un agente humano asignado a la conversación, el bot guarda
silencio (handoff: si un reclutador toma la conversación, el bot no responde).

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
| `CHATWOOT_HUMAN_AGENT_ID` | ID del agente humano (reclutador) para asignación |
| `OPENAI_API_KEY` | API key de OpenAI |
| `PORT` | Puerto del servidor (opcional, default 3000) |

## Configurar el webhook en Chatwoot
1. Crea un **Agent Bot** en Chatwoot (Settings → Agent Bots) y copia su
   access token a `CHATWOOT_API_TOKEN`.
2. Configura la URL del webhook del bot apuntando a tu despliegue:
   `https://TU-DOMINIO/webhook`.
3. Asigna el Agent Bot a la bandeja (inbox) de WhatsApp.

El bot solo procesa mensajes **entrantes y públicos**; ignora sus propios
mensajes salientes, notas privadas y eventos de actividad para no entrar en
bucle.

## Tests
```bash
npm test            # unit + behavioral (sin costo, <1s, correr siempre)
npm run test:watch  # modo watch
npm run test:smoke  # escenarios con OpenAI real (~$0.01, antes de cada deploy)
npm run test:coverage
```

- **unit** (`tests/unit/`): invariantes del system prompt (vacantes, sueldos,
  flujo), mapeo de historial, filtro anti-bucle y cola secuencial.
- **behavioral** (`tests/behavioral/`): `runAgent` con el LLM y el cliente de
  Chatwoot mockeados — verifica que devuelve el texto del modelo sin efectos
  secundarios.
- **smoke** (`tests/smoke/`): llaman a OpenAI de verdad (cuestan dinero y tardan
  ~5s c/u). Requieren `OPENAI_API_KEY`. Están **excluidas** de `npm test` y se
  corren manualmente con `npm run test:smoke` antes de un deploy a producción.

## Notas del demo
- Historial en memoria: el contexto multi-turno se reconstruye de un `Map` por
  `conversationId` (se pierde si el proceso se reinicia).
- Los sueldos del system prompt (Cobranza $9,800 / Cuentas por Cobrar $9,600)
  son los únicos válidos — el agente tiene instrucción explícita de no inventar
  otros ni hablar de vacantes distintas a esas dos.
