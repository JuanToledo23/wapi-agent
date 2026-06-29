import { describe, it, expect } from "vitest";
import { generateAgentReply } from "../../src/agent";

// These tests call OpenAI for real. They cost real money and take ~5s each.
// Run before every production deploy: npm run test:smoke
// Requires OPENAI_API_KEY in the environment.

describe.concurrent("Recruitment agent behavior — smoke tests", () => {
  it("greets and engages on the first message", async () => {
    const reply = await runAgentGetReply({
      message: "hola",
      history: [],
    });
    // Should greet warmly and not dump everything at once.
    expect(reply.length).toBeGreaterThan(0);
    expect(reply.length).toBeLessThan(600);
  }, 15000);

  it("offers the two vacancies when interest is unclear", async () => {
    const reply = await runAgentGetReply({
      message: "sí, me interesa",
      history: [
        {
          role: "assistant",
          content: "¡Hola! Te contacto por las vacantes a las que aplicaste.",
        },
      ],
    });
    const mentionsAVacancy =
      reply.toLowerCase().includes("cobranza") ||
      reply.toLowerCase().includes("cuentas por cobrar") ||
      reply.toLowerCase().includes("vacante");
    expect(mentionsAVacancy).toBe(true);
  }, 15000);

  it("gives the correct salary for Ejecutivo de Cobranza", async () => {
    const reply = await runAgentGetReply({
      message: "¿cuánto pagan?",
      history: [
        { role: "user", content: "me interesa la de cobranza" },
        {
          role: "assistant",
          content: "Va, te cuento de Ejecutivo de Cobranza.",
        },
      ],
    });
    expect(reply).toContain("$9,800");
  }, 15000);

  it("does NOT invent salaries outside the two real ones", async () => {
    const reply = await runAgentGetReply({
      message: "¿cuánto pagan?",
      history: [
        { role: "user", content: "me interesa cobranza" },
        { role: "assistant", content: "Te cuento los detalles." },
      ],
    });
    const hasWrongSalary =
      /\$[0-9,]+/.test(reply) &&
      !reply.includes("$9,800") &&
      !reply.includes("$9,600");
    expect(hasWrongSalary).toBe(false);
  }, 15000);

  it("stays in scope — defers off-topic questions to the recruiter", async () => {
    const reply = await runAgentGetReply({
      message: "¿quién ganó el mundial 2022?",
      history: [
        { role: "user", content: "me interesa la vacante de cobranza" },
        { role: "assistant", content: "Va, te cuento los detalles." },
      ],
    });
    expect(reply.toLowerCase()).not.toContain("qatar");
    expect(reply.toLowerCase()).not.toContain("argentina");
  }, 15000);
});

// Helper: runs the agent (pure, no Chatwoot side effects) and returns the
// text reply.
async function runAgentGetReply(args: {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const { text } = await generateAgentReply(args);
  return text;
}
