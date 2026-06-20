/**
 * Lógica del LLM para el asistente virtual de la notaría.
 * Patrón inspirado en apps/worker/src/lib/llm.ts de Wapi:
 * generateText de la AI SDK con OpenAI gpt-4o-mini + tools.
 */

import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import {
  EXPEDIENTES,
  INFO_NOTARIA,
  getExpedienteByPhone,
  type Expediente,
} from "./data.js";

const MODEL = "gpt-4o-mini";

function serviciosTexto(): string {
  return INFO_NOTARIA.servicios
    .map((s) => `- ${s.nombre}: ${s.precio}`)
    .join("\n");
}

function buildSystemPrompt(expediente: Expediente | null): string {
  let prompt = `Eres el asistente virtual de ${INFO_NOTARIA.nombre}, una notaría
ubicada en el Estado de México con más de 20 años de experiencia.

Tu función es atender a los clientes de forma amable y profesional,
responder preguntas sobre servicios y precios, consultar el estado
de trámites, y transferir con los abogados cuando sea necesario.

HORARIO DE ATENCIÓN: ${INFO_NOTARIA.horario}
TELÉFONO DIRECTO: ${INFO_NOTARIA.telefono}

SERVICIOS Y PRECIOS ORIENTATIVOS:
${serviciosTexto()}

REGLAS IMPORTANTES:
1. Siempre saluda con el nombre del cliente si lo conoces.
2. Cuando un cliente pregunta por el estado de su trámite, ya
   tienes su número de teléfono y puedes consultarlo directamente.
   No le pidas su número — ya lo tienes.
3. Si el cliente quiere hablar con un abogado, responde que con
   gusto lo transfiere y llama a la función transfer_to_human.
4. Los precios son orientativos. Para una cotización exacta,
   ofrecen agendar una cita.
5. Si te preguntan si eres un robot o una IA, di que eres el
   asistente virtual de la notaría y que también puedes
   transferirlos con un abogado si lo prefieren.
6. Responde siempre en español formal pero accesible.
   Nada de tecnicismos legales innecesarios.
7. Mensajes cortos. Máximo 3 oraciones por respuesta.
   Si necesitas dar más info, divídela en varios mensajes.

Si necesitas separar tu respuesta en varios mensajes de WhatsApp,
usa el separador ||| entre cada mensaje.`;

  if (expediente) {
    prompt += `

DATOS DE ESTE CLIENTE:
Nombre: ${expediente.name}
Expediente: #${expediente.expediente}
Trámite: ${expediente.tramite}
Estado actual: ${expediente.estado}
Fecha estimada: ${expediente.estimado}`;
  }

  return prompt;
}

export interface AgentResult {
  /** Texto de respuesta del agente (puede contener ||| para dividir). */
  text: string;
  /** True si el agente decidió transferir con un humano. */
  shouldTransfer: boolean;
}

/**
 * Ejecuta el agente para un mensaje entrante.
 * Sin memoria de conversación: el contexto del cliente vive en el system prompt.
 */
export async function runAgent(
  userPhone: string,
  messageText: string,
): Promise<AgentResult> {
  const expediente = getExpedienteByPhone(userPhone);
  const system = buildSystemPrompt(expediente);

  let shouldTransfer = false;

  const tools = {
    get_expediente: tool({
      description:
        "Consulta el estado del expediente/trámite de un cliente por su número de teléfono.",
      inputSchema: z.object({
        phone: z
          .string()
          .describe("Número de teléfono del cliente, formato +52..."),
      }),
      execute: async ({ phone }) => {
        const exp =
          getExpedienteByPhone(phone) ??
          // fallback: el teléfono de la conversación actual
          getExpedienteByPhone(userPhone);
        if (!exp) {
          return {
            encontrado: false,
            mensaje:
              "No se encontró ningún expediente asociado a ese número.",
          };
        }
        return {
          encontrado: true,
          name: exp.name,
          expediente: exp.expediente,
          tramite: exp.tramite,
          estado: exp.estado,
          estimado: exp.estimado,
        };
      },
    }),
    transfer_to_human: tool({
      description:
        "Transfiere la conversación con un abogado humano cuando el cliente lo solicita o el caso lo amerita.",
      inputSchema: z.object({}),
      execute: async () => {
        shouldTransfer = true;
        return {
          ok: true,
          mensaje: "Transferencia iniciada con un abogado.",
        };
      },
    }),
  };

  const { text } = await generateText({
    model: openai(MODEL),
    system,
    prompt: messageText,
    tools,
    stopWhen: stepCountIs(4),
  });

  return { text: text.trim(), shouldTransfer };
}

// Re-export por conveniencia para otros módulos del demo.
export { EXPEDIENTES };
