/**
 * Lógica del LLM para el agente de reclutamiento de Wapi (demo Cynthia).
 * AI SDK (generateText de `ai`) con OpenAI gpt-4o-mini.
 *
 * El agente recibe el historial de conversación para tener contexto multi-turno
 * (clave para el flujo: apertura → presentación → dudas → recopilación de datos).
 */

import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

/** Modelo de OpenAI. Constante para cambiarlo fácil. */
const MODEL = "gpt-4o-mini";

/** Mensaje del LLM mapeado al formato que espera la AI SDK. */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/** Forma (parcial) de un mensaje crudo de la API de Chatwoot. */
export interface ChatwootMessage {
  /** Chatwoot usa string en webhooks ("incoming") e int en la API (0,1,2). */
  message_type?: string | number;
  content?: string | null;
  private?: boolean;
}

/**
 * Construye el system prompt del agente de reclutamiento. Sin efectos
 * secundarios. El texto es el guion verbatim del documento de handoff.
 */
export function buildSystemPrompt(): string {
  return `Eres el asistente de reclutamiento de una agencia especializada en
colocación de personal en el sector financiero en CDMX.

Tu trabajo es contactar candidatos que aplicaron previamente a nuestras
vacantes, presentarles la posición, resolver sus dudas y recopilar sus
datos para agendar su entrevista.

VACANTES DISPONIBLES:

━━━ VACANTE 1 ━━━
Puesto: Ejecutivo de Cobranza
Empresa: Fintech de préstamos por aplicación (app: BOOYA, regulada ante CONDUSEF)
Giro: Mora temprana, 1 a 90 días. Nada agresiva.
Sueldo: $9,800 brutos mensuales + bonos y comisiones. Pago quincenal al banco de tu preferencia.
Horario: Lunes a Viernes 9am–6pm · Sábados 9am–2:30pm · Domingo fijo de descanso · 1 hora de comida
Ubicación: Colonia Cuauhtémoc, CDMX — alrededores metro Insurgentes o Sevilla
Prestaciones: IMSS, Prima vacacional y dominical 25%, Aguinaldo 15 días, Vacaciones 12 días
Actividades: Gestión de cobranza por teléfono, SMS, correo y WhatsApp · Registro en sistema · Cumplir metas de recuperación

━━━ VACANTE 2 ━━━
Puesto: Ejecutivo de Cuentas por Cobrar
Empresa: Fintech de préstamos por aplicación (misma zona, mismo giro)
Sueldo: $9,600 mensuales + bonos. Pago quincenal al banco de tu preferencia.
Horario: Lunes a Viernes 9am–6pm · Sábados 9am–1pm · Domingo fijo de descanso · 1 hora de comida
Ubicación: Colonia Cuauhtémoc, CDMX — alrededores metro Insurgentes o Sevilla
Prestaciones: IMSS, Prima vacacional y dominical 25%, Aguinaldo 15 días, Vacaciones 12 días
Actividades: Gestión de cuentas por cobrar · Negociación y acuerdos de pago · Seguimiento y recuperación · Cumplimiento de metas · Atención al cliente · Documentación y reportes

FLUJO (SIGUE ESTE ORDEN ESTRICTAMENTE):

1. APERTURA
   Saluda amablemente. Si el candidato confirma interés, y no está claro
   qué vacante le interesa, pregúntale cuál de las dos le llama la atención.

2. PRESENTACIÓN
   Comparte los detalles de la vacante de forma conversacional.
   Empieza por lo más importante: puesto, sueldo, horario, ubicación.
   NO mandes todo de golpe. Espera a que confirme que quiere saber más.

3. DUDAS
   Pregunta si tiene dudas y resuélvelas usando solo la información disponible.
   Si pregunta algo que no está aquí, dile que un reclutador le dará ese detalle.

4. RECOPILACIÓN DE DATOS (cuando confirme que quiere aplicar)
   Pide los datos UNO POR UNO, esperando respuesta entre cada uno:
   → Nombre completo
   → Edad
   → Último grado de estudios
   → Colonia o municipio donde vive
   → Si tiene CV disponible para compartir

5. CIERRE
   Cuando tengas todos los datos, confírmalos brevemente y di:
   "Perfecto, ya tengo todo. Un reclutador te va a contactar en breve
   para confirmar fecha y hora de tu entrevista y mandarte la ubicación exacta."

TONO Y ESTILO:
- Amable, directo, profesional. Tutea siempre.
- Máximo 3-4 líneas por mensaje. NUNCA más.
- No mandes listas largas ni toda la info de golpe en un solo mensaje.
- Si algo está fuera de tu scope: "Ese detalle te lo confirma el reclutador."

LÍMITES ABSOLUTOS:
- Solo habla de estas dos vacantes.
- No inventes ni extrapoles información no listada aquí.
- No prometas sueldos, horarios o condiciones distintas a las especificadas.`;
}

/**
 * ¿Es este el primer mensaje de la conversación?
 * `history` es el arreglo ANTES de añadir el mensaje actual.
 * True si está vacío o solo contiene el mensaje actual.
 */
export function isFirstMessage(history: ConversationMessage[]): boolean {
  return (history?.length ?? 0) <= 1;
}

/** "incoming" / 0 → user; "outgoing" / 1 → assistant; cualquier otra cosa → null. */
function toRole(messageType: string | number | undefined): ConversationMessage["role"] | null {
  if (messageType === "incoming" || messageType === 0) return "user";
  if (messageType === "outgoing" || messageType === 1) return "assistant";
  return null;
}

/**
 * Mapea mensajes crudos de Chatwoot al formato {role, content} para el LLM.
 * Reglas: incoming → user, outgoing → assistant. Se descartan mensajes
 * privados, de actividad (assignments, etc.) y sin contenido. Devuelve
 * como máximo los últimos 20 mensajes, en orden cronológico.
 */
export function mapChatwootMessages(
  messages: ChatwootMessage[],
): ConversationMessage[] {
  const mapped: ConversationMessage[] = [];
  for (const m of messages ?? []) {
    if (m?.private === true) continue;
    const role = toRole(m?.message_type);
    if (!role) continue;
    const content = (m?.content ?? "").toString();
    if (!content.trim()) continue;
    mapped.push({ role, content });
  }
  return mapped.slice(-20);
}

export interface AgentResult {
  /** Texto a enviar al candidato. */
  text: string;
}

export interface RunAgentArgs {
  conversationId: string | number;
  message: string;
  history: ConversationMessage[];
}

/**
 * Genera la respuesta del LLM SIN efectos secundarios (no toca Chatwoot).
 * Útil para smoke tests. Devuelve el texto generado.
 */
export async function generateAgentReply(args: {
  message: string;
  history: ConversationMessage[];
}): Promise<{ text: string }> {
  const messages: ConversationMessage[] = [
    ...args.history,
    { role: "user", content: args.message },
  ];

  const result = await generateText({
    model: openai(MODEL),
    system: buildSystemPrompt(),
    messages,
  });

  return { text: (result.text ?? "").trim() };
}

/**
 * Ejecuta el agente para un mensaje entrante, con el historial como contexto.
 * Devuelve el texto a enviar al candidato. El envío vía Chatwoot lo hace
 * quien llama (processMessage en index.ts).
 */
export async function runAgent(args: RunAgentArgs): Promise<AgentResult> {
  const { message, history } = args;
  const { text } = await generateAgentReply({ message, history });
  return { text };
}
