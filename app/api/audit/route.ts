import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getEgoSystemPrompt } from "@/lib/system-prompt";
import { EGO_DIAGNOSIS_TOOL } from "@/lib/ego-schema";
import { saveAnonymizedCase } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import type { EgoDiagnosis } from "@/types/ego";

export const runtime = "nodejs";

const MAX_INPUT_LENGTH = 1000;

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no está configurada. Añádela a tu .env.local (desarrollo) o a las variables de entorno del proyecto en Vercel (producción)."
    );
  }
  return new Anthropic({ apiKey });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const input = (body as { input?: unknown } | null)?.input;

  if (typeof input !== "string" || !input.trim()) {
    return NextResponse.json({ error: "Escribe qué te ocurre antes de auditar." }, { status: 400 });
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return NextResponse.json(
      { error: `El texto es demasiado largo (máximo ${MAX_INPUT_LENGTH} caracteres).` },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "audit", RATE_LIMITS.audit.limit, RATE_LIMITS.audit.windowMinutes);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Has hecho demasiadas auditorías en poco tiempo. Espera unos minutos y vuelve a intentarlo." },
      { status: 429, headers: rl.retryAfterSeconds ? { "Retry-After": String(rl.retryAfterSeconds) } : undefined }
    );
  }

  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error(
      "ANTHROPIC_MODEL no está configurada. Copia el ID de modelo actual desde console.anthropic.com y ponlo en tu .env."
    );
    return NextResponse.json(
      { error: "No se pudo generar el diagnóstico. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }

  try {
    const anthropic = client();

    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: getEgoSystemPrompt(),
      tools: [EGO_DIAGNOSIS_TOOL],
      tool_choice: { type: "tool", name: "emitir_diagnostico" },
      messages: [{ role: "user", content: input.trim() }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse) {
      throw new Error("El modelo no devolvió un diagnóstico estructurado.");
    }

    const raw = toolUse.input as Record<string, unknown>;

    const diagnosis: EgoDiagnosis = {
      sesgo_identificado: String(raw.sesgo_identificado ?? ""),
      diagnostico_titulo: String(raw.diagnostico_titulo ?? ""),
      cuerpo_diagnostico: String(raw.cuerpo_diagnostico ?? ""),
      accion_tactica: Array.isArray(raw.accion_tactica)
        ? raw.accion_tactica.map((a) => String(a))
        : [],
      prescripcion_fisica: Boolean(raw.prescripcion_fisica),
      nota_seguridad:
        typeof raw.nota_seguridad === "string" && raw.nota_seguridad.trim()
          ? raw.nota_seguridad.trim()
          : null,
      pregunta_espejo:
        typeof raw.pregunta_espejo === "string" ? raw.pregunta_espejo.trim() : "",
    };

    // Guardado anónimo para investigación — nunca debe poder tumbar la
    // respuesta al usuario, así que un fallo aquí solo se registra en el
    // log del servidor. Los casos de crisis se excluyen dentro de
    // saveAnonymizedCase (ver lib/db.ts).
    try {
      await saveAnonymizedCase(input.trim(), "es", diagnosis);
    } catch (dbErr) {
      console.error("[EGO /api/audit] no se pudo guardar el caso anónimo", dbErr);
    }

    return NextResponse.json(diagnosis);
  } catch (err) {
    console.error("[EGO /api/audit]", err);
    return NextResponse.json(
      { error: "No se pudo generar el diagnóstico. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
