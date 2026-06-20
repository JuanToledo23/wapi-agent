/**
 * Servidor Hono — Chatwoot Agent Bot para la Notaría Pública 192.
 *
 * Flujo:
 *   POST /webhook  → filtro anti-bucle → ACK 200 → procesa async (setImmediate)
 *
 * No usa cola (BullMQ/Redis): para el volumen del demo, setImmediate basta.
 */

import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { runAgent } from "./agent.js";
import { assignToHuman, sendMessage } from "./chatwoot.js";

const app = new Hono();

const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? "";

/** Delay entre mensajes cuando dividimos con ||| (patrón de meta-api.ts). */
const MESSAGE_DELAY_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Forma (parcial) del payload del Agent Bot de Chatwoot que nos importa. */
interface ChatwootWebhookPayload {
  message_type?: string;
  private?: boolean;
  content?: string;
  sender?: { phone_number?: string };
  conversation?: {
    id?: number | string;
    meta?: { assignee?: unknown };
  };
}

app.get("/", (c) => c.text("Chatwoot Agent Bot — Notaría 192 ✅"));
app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/webhook", async (c) => {
  let payload: ChatwootWebhookPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.body(null, 200);
  }

  // Paso 1 — Filtro anti-bucle (lo PRIMERO de todo).
  // Solo procesamos mensajes entrantes y públicos; cualquier otra cosa
  // (mensajes salientes del propio bot, notas privadas, eventos) la
  // ignoramos para no entrar en bucle.
  if (payload.message_type !== "incoming") {
    return c.body(null, 200);
  }
  if (payload.private === true) {
    return c.body(null, 200);
  }

  // Paso 2 — ACK inmediato: respondemos 200 antes de tocar el LLM.
  // Paso 3 — Procesamos en segundo plano.
  setImmediate(() => {
    processMessage(payload).catch((err) => {
      console.error("[webhook] error procesando mensaje:", err);
    });
  });

  return c.body(null, 200);
});

async function processMessage(
  payload: ChatwootWebhookPayload,
): Promise<void> {
  // Si ya hay un agente humano asignado, el bot calla. En cuanto la
  // conversación se asigna a un humano, dejamos de responder en todos
  // los mensajes siguientes.
  if (payload.conversation?.meta?.assignee) {
    console.log("[processMessage] humano asignado, el bot no responde");
    return;
  }

  const userPhone = payload.sender?.phone_number ?? "";
  const messageText = payload.content ?? "";
  const conversationId = payload.conversation?.id;

  if (!conversationId) {
    console.warn("[processMessage] sin conversation.id, se ignora");
    return;
  }
  if (!messageText.trim()) {
    console.warn("[processMessage] mensaje vacío, se ignora");
    return;
  }

  console.log(
    `[processMessage] conv=${conversationId} phone=${userPhone} msg="${messageText}"`,
  );

  let result;
  try {
    result = await runAgent(userPhone, messageText);
  } catch (err) {
    console.error("[processMessage] runAgent falló:", err);
    await sendMessage(
      ACCOUNT_ID,
      conversationId,
      "Disculpe, tuvimos un problema técnico. Por favor intente de nuevo en un momento.",
    ).catch(() => {});
    return;
  }

  // Si el agente decidió transferir → asignar a humano (esto ya envía
  // su propio mensaje de transferencia al cliente).
  if (result.shouldTransfer) {
    await assignToHuman(ACCOUNT_ID, conversationId);
    return;
  }

  // Dividir la respuesta en varios mensajes si contiene |||
  const parts = result.text
    .split("|||")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (let i = 0; i < parts.length; i++) {
    await sendMessage(ACCOUNT_ID, conversationId, parts[i]);
    if (i < parts.length - 1) {
      await sleep(MESSAGE_DELAY_MS);
    }
  }
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `🚀 Chatwoot Agent Bot (Notaría 192) escuchando en http://localhost:${info.port}`,
  );
  console.log(`   Webhook: POST http://localhost:${info.port}/webhook`);
});
