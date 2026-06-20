/**
 * Cliente mínimo para la API de Chatwoot.
 * Solo lo necesario para el Agent Bot: enviar mensajes y asignar a un humano.
 */

const BASE_URL = process.env.CHATWOOT_BASE_URL ?? "https://app.chatwoot.com";

function apiToken(): string {
  const token = process.env.CHATWOOT_API_TOKEN;
  if (!token) {
    throw new Error("CHATWOOT_API_TOKEN no está configurado");
  }
  return token;
}

/**
 * Envía un mensaje saliente (visible para el cliente) a una conversación.
 */
export async function sendMessage(
  accountId: string | number,
  conversationId: string | number,
  content: string,
): Promise<void> {
  const url = `${BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_access_token: apiToken(),
    },
    body: JSON.stringify({
      content,
      message_type: "outgoing",
      private: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[chatwoot] sendMessage falló (${res.status}): ${body}`,
    );
    throw new Error(`Chatwoot sendMessage ${res.status}`);
  }
}

/**
 * Asigna la conversación al agente humano configurado y avisa al cliente.
 */
export async function assignToHuman(
  accountId: string | number,
  conversationId: string | number,
): Promise<void> {
  const agentId = process.env.CHATWOOT_HUMAN_AGENT_ID;
  if (!agentId) {
    throw new Error("CHATWOOT_HUMAN_AGENT_ID no está configurado");
  }

  const url = `${BASE_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      api_access_token: apiToken(),
    },
    body: JSON.stringify({
      assignee_id: parseInt(agentId, 10),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[chatwoot] assignToHuman falló (${res.status}): ${body}`,
    );
    throw new Error(`Chatwoot assignToHuman ${res.status}`);
  }

  await sendMessage(
    accountId,
    conversationId,
    "Le voy a transferir con uno de nuestros abogados. Un momento por favor.",
  );
}
