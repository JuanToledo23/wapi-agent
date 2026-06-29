import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the AI SDK so no real API call is made. We keep `tool` and `stepCountIs`
// real (agent.ts builds the intake tool at runtime) and only stub generateText.
vi.mock("ai", async (importActual) => {
  const actual = await importActual<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

// Mock Chatwoot client — assignToHuman is the side effect we assert on.
vi.mock("../../src/chatwoot", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  assignToHuman: vi.fn().mockResolvedValue(undefined),
  getConversationMessages: vi.fn().mockResolvedValue([]),
}));

import { generateText } from "ai";
import { sendMessage, assignToHuman } from "../../src/chatwoot";
import { runAgent } from "../../src/agent";

const CLOSING =
  "Perfecto, ya tengo todo. Un reclutador te va a contactar en breve " +
  "para confirmar fecha y hora de tu entrevista y mandarte la ubicación exacta.";

describe("runAgent — recruitment flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the model's text reply", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [],
      text: "¡Hola! ¿Cuál de las dos vacantes te llama la atención?",
    } as any);

    const result = await runAgent({
      conversationId: "conv-123",
      message: "hola",
      history: [],
    });

    expect(result.text).toContain("vacantes");
    expect(result.intakeCompleted).toBe(false);
  });

  it("does NOT assign a human when the intake tool does not fire", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [],
      text: "Perfecto, ¿me das tu nombre completo?",
    } as any);

    await runAgent({
      conversationId: "conv-123",
      message: "quiero aplicar",
      history: [
        { role: "user", content: "me interesa cobranza" },
        { role: "assistant", content: "te cuento los detalles..." },
      ],
    });

    expect(assignToHuman).not.toHaveBeenCalled();
    // El envío vía Chatwoot lo hace processMessage (index.ts), no runAgent.
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("assigns the conversation to a human when complete_candidate_intake fires", async () => {
    // Simula al modelo: invoca el execute del tool (como haría generateText real)
    // y luego devuelve el mensaje de cierre.
    vi.mocked(generateText).mockImplementationOnce(async (opts: any) => {
      await opts.tools.complete_candidate_intake.execute();
      return {
        toolCalls: [{ toolName: "complete_candidate_intake", args: {} }],
        text: CLOSING,
      } as any;
    });

    const result = await runAgent({
      conversationId: "conv-999",
      message: "sí, tengo CV",
      history: [
        { role: "user", content: "Juan Pérez" },
        { role: "assistant", content: "¿Tu edad?" },
        { role: "user", content: "28" },
      ],
    });

    expect(assignToHuman).toHaveBeenCalledWith("conv-999");
    expect(result.intakeCompleted).toBe(true);
    expect(result.text).toContain("Un reclutador te va a contactar en breve");
  });

  it("still returns the closing text if assignToHuman throws", async () => {
    vi.mocked(assignToHuman).mockRejectedValueOnce(new Error("chatwoot down"));

    vi.mocked(generateText).mockImplementationOnce(async (opts: any) => {
      await opts.tools.complete_candidate_intake.execute();
      return {
        toolCalls: [{ toolName: "complete_candidate_intake", args: {} }],
        text: CLOSING,
      } as any;
    });

    const result = await runAgent({
      conversationId: "conv-777",
      message: "sí tengo CV",
      history: [],
    });

    expect(assignToHuman).toHaveBeenCalledWith("conv-777");
    expect(result.intakeCompleted).toBe(true);
    expect(result.text).toContain("Un reclutador te va a contactar en breve");
  });

  it("trims whitespace from the model reply", async () => {
    vi.mocked(generateText).mockResolvedValueOnce({
      toolCalls: [],
      text: "  texto con espacios  ",
    } as any);

    const result = await runAgent({
      conversationId: "conv-123",
      message: "ok",
      history: [],
    });

    expect(result.text).toBe("texto con espacios");
  });
});
