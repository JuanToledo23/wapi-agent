import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the AI SDK so no real API call is made. We only stub generateText.
vi.mock("ai", async (importActual) => {
  const actual = await importActual<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

// Mock Chatwoot client — runAgent has no side effects now, but agent.ts must
// still resolve the import graph cleanly under test.
vi.mock("../../src/chatwoot", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
  assignToHuman: vi.fn().mockResolvedValue(undefined),
  getConversationMessages: vi.fn().mockResolvedValue([]),
}));

import { generateText } from "ai";
import { sendMessage, assignToHuman } from "../../src/chatwoot";
import { runAgent } from "../../src/agent";

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
  });

  it("does NOT send messages or assign humans on its own (no transfer flow)", async () => {
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

    // El envío vía Chatwoot lo hace processMessage (index.ts), no runAgent.
    expect(sendMessage).not.toHaveBeenCalled();
    expect(assignToHuman).not.toHaveBeenCalled();
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
