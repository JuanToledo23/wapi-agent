/**
 * Servidor Hono — Wapi Agent Bot (agente de ventas de wapi.mx) sobre Chatwoot.
 *
 * Flujo:
 *   POST /webhook → filtro anti-bucle → ACK 200 → procesa async (setImmediate)
 *   Antes de llamar al agente se lee el historial de la conversación para
 *   darle contexto multi-turno al LLM.
 *
 * No usa cola (BullMQ/Redis): para el volumen del demo, setImmediate basta.
 */

import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  mapChatwootMessages,
  runAgent,
  type ConversationMessage,
} from "./agent.js";
import { getConversationMessages, sendMessage } from "./chatwoot.js";

const app = new Hono();

/** Delay entre mensajes cuando dividimos con |||. */
const MESSAGE_DELAY_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Forma (parcial) del payload del Agent Bot de Chatwoot que nos importa. */
interface ChatwootWebhookPayload {
  message_type?: string;
  private?: boolean;
  content?: string;
  conversation?: {
    id?: number | string;
    meta?: { assignee?: unknown };
  };
}

/**
 * Filtro anti-bucle. True si el evento debe ignorarse en silencio.
 * Solo procesamos mensajes entrantes y públicos; cualquier otra cosa
 * (mensajes salientes del propio bot, notas privadas, eventos de actividad,
 * payloads malformados) se descarta para no entrar en bucle.
 */
export function shouldIgnoreWebhookEvent(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return true;
  const p = payload as { message_type?: unknown; private?: unknown };
  if (p.message_type !== "incoming") return true;
  if (p.private === true) return true;
  return false;
}

app.get("/", (c) => c.text("Wapi Agent Bot — wapi.mx ✅"));
app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/webhook", async (c) => {
  let payload: ChatwootWebhookPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.body(null, 200);
  }

  // Paso 1 — Filtro anti-bucle (lo PRIMERO de todo).
  if (shouldIgnoreWebhookEvent(payload)) {
    return c.body(null, 200);
  }

  // Paso 2 — ACK inmediato (200) antes de tocar el LLM.
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
  // Si ya hay un agente humano asignado, el bot calla.
  if (payload.conversation?.meta?.assignee) {
    console.log("[processMessage] humano asignado, el bot no responde");
    return;
  }

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
    `[processMessage] conv=${conversationId} msg="${messageText}"`,
  );

  // Historial de la conversación (best-effort) para contexto multi-turno.
  let history: ConversationMessage[] = [];
  try {
    const raw = await getConversationMessages(conversationId);
    history = mapChatwootMessages(raw);
    // El mensaje entrante actual ya está persistido en Chatwoot, así que viene
    // como último elemento. Lo quitamos: runAgent vuelve a añadirlo como el
    // último mensaje (role: user).
    if (history.length && history[history.length - 1].role === "user") {
      history = history.slice(0, -1);
    }
  } catch (err) {
    console.error("[processMessage] no se pudo leer el historial:", err);
  }

  let result;
  try {
    result = await runAgent({
      conversationId,
      message: messageText,
      history,
    });
  } catch (err) {
    console.error("[processMessage] runAgent falló:", err);
    await sendMessage(
      conversationId,
      "Disculpa, tuvimos un problema técnico. Por favor intenta de nuevo en un momento.",
    ).catch(() => {});
    return;
  }

  // Si transfirió con Juan, runAgent ya envió el mensaje con el link y asignó
  // la conversación. No mandamos nada más.
  if (result.shouldTransfer) {
    return;
  }

  // Dividir la respuesta en varios mensajes si contiene |||
  const parts = result.text
    .split("|||")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (let i = 0; i < parts.length; i++) {
    await sendMessage(conversationId, parts[i]);
    if (i < parts.length - 1) {
      await sleep(MESSAGE_DELAY_MS);
    }
  }
}

// Solo arrancamos el servidor cuando se ejecuta de verdad, no al importar el
// módulo desde los tests (Vitest define process.env.VITEST).
if (!process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(
      `🚀 Wapi Agent Bot escuchando en http://localhost:${info.port}`,
    );
    console.log(`   Webhook: POST http://localhost:${info.port}/webhook`);
  });
}
