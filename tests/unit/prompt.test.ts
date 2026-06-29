import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../src/agent";

describe("buildSystemPrompt — invariants", () => {
  const prompt = buildSystemPrompt();

  // Identity
  it("is a recruitment assistant", () => {
    expect(prompt).toContain("asistente de reclutamiento");
  });
  it("targets the CDMX financial sector", () => {
    expect(prompt).toContain("sector financiero");
    expect(prompt).toContain("CDMX");
  });

  // Vacancies — must be exactly these two
  it("contains Vacante 1 (Ejecutivo de Cobranza)", () => {
    expect(prompt).toContain("Ejecutivo de Cobranza");
  });
  it("contains Vacante 2 (Ejecutivo de Cuentas por Cobrar)", () => {
    expect(prompt).toContain("Ejecutivo de Cuentas por Cobrar");
  });

  // Salaries — must be exactly these, never others
  it("contains Vacante 1 salary", () => {
    expect(prompt).toContain("$9,800");
  });
  it("contains Vacante 2 salary", () => {
    expect(prompt).toContain("$9,600");
  });

  // No leftover sales/notary content
  it("does NOT contain old sales/notary content", () => {
    expect(prompt).not.toContain("Eres Wapi");
    expect(prompt).not.toContain("$1,490");
    expect(prompt).not.toContain("$2,490");
    expect(prompt).not.toContain("wa.me/527774939562");
    expect(prompt).not.toContain("expediente");
  });

  // Flow markers
  it("describes the strict flow", () => {
    expect(prompt).toContain("APERTURA");
    expect(prompt).toContain("PRESENTACIÓN");
    expect(prompt).toContain("RECOPILACIÓN DE DATOS");
    expect(prompt).toContain("CIERRE");
  });

  // Data collection fields
  it("asks for the candidate's data one by one", () => {
    expect(prompt).toContain("Nombre completo");
    expect(prompt).toContain("Edad");
    expect(prompt).toContain("Último grado de estudios");
  });

  // Closing line
  it("contains the closing handoff to a recruiter", () => {
    expect(prompt).toContain("Un reclutador te va a contactar en breve");
  });

  // Tone
  it("instructs short messages and tuteo", () => {
    expect(prompt).toContain("Tutea siempre");
    expect(prompt).toContain("Máximo 3-4 líneas");
  });
});
