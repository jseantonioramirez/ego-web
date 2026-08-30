import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getEgoSystemPrompt } from "@/lib/system-prompt";
import { EGO_SEGUNDA_LECTURA_TOOL } from "@/lib/ego-schema";
import type { EgoSegundaLectura } from "@/types/ego";

export const runtime = "nodejs";

const MAX_INPUT_LENGTH = 1000;
const MAX_RESPUESTA_LENGTH = 500;

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

  const b = body as Record<string, unknown> | null;
  const input = typeof b?.input === "string" ? b.input.trim() : "";
  const sesgo = typeof b?.sesgo_identificado === "string" ? b.sesgo_identificado.trim() : "";
  const titulo = typeof b?.diagnostico_titulo === "string" ? b.diagnostico_titulo.trim() : "";
  const cuerpo = typeof b?.cuerpo_diagnostico === "string" ? b.cuerpo_diagnostico.trim() : "";
  const preguntaEspejo = typeof b?.pregunta_espejo === "string" ? b.pregunta_espejo.trim() : "";
  const respuesta = typeof b?.respuesta === "string" ? b.respuesta.trim() : "";

  // Este endpoint solo tiene sentido como cierre de un diagnóstico ya
  // emitido: sin ese contexto no hay nada que confrontar.
  if (!input || !sesgo || !cuerpo || !preguntaEspejo) {
    return NextResponse.json({ error: "Falta el contexto del diagnóstico original." }, { status: 400 });
  }
  if (!respuesta) {
    return NextResponse.json({ error: "Escribe tu respuesta antes de continuar." }, { status: 400 });
  }
  if (input.length > MAX_INPUT_LENGTH || respuesta.length > MAX_RESPUESTA_LENGTH) {
    return NextResponse.json({ error: "El texto es demasiado largo." }, { status: 400 });
  }

  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error(
      "ANTHROPIC_MODEL no está configurada. Copia el ID de modelo actual desde console.anthropic.com y ponlo en tu .env."
    );
    return NextResponse.json(
      { error: "No se pudo generar la segunda lectura. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }

  // Una sola llamada sin estado (igual que /api/audit): no reproducimos
  // el turno anterior como mensajes de conversación, le damos a Claude
  // todo el contexto necesario en un único mensaje de usuario.
  const contextMessage = [
    `Declaración original del usuario: "${input}"`,
    `Sesgo identificado en el diagnóstico: ${sesgo}`,
    titulo ? `Título del diagnóstico: ${titulo}` : null,
    `Cuerpo del diagnóstico ya emitido: "${cuerpo}"`,
    `Pregunta espejo que se le planteó: "${preguntaEspejo}"`,
    `Respuesta literal del usuario a esa pregunta: "${respuesta}"`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const anthropic = client();

    const message = await anthropic.messages.create({
      model,
      max_tokens: 512,
      system: getEgoSystemPrompt(),
      tools: [EGO_SEGUNDA_LECTURA_TOOL],
      tool_choice: { type: "tool", name: "emitir_segunda_lectura" },
      messages: [{ role: "user", content: contextMessage }],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUse) {
      throw new Error("El modelo no devolvió una segunda lectura estructurada.");
    }

    const raw = toolUse.input as Record<string, unknown>;

    const segundaLectura: EgoSegundaLectura = {
      segunda_lectura: String(raw.segunda_lectura ?? ""),
      nota_seguridad:
        typeof raw.nota_seguridad === "string" && raw.nota_seguridad.trim()
          ? raw.nota_seguridad.trim()
          : null,
      pregunta_final: typeof raw.pregunta_final === "string" ? raw.pregunta_final.trim() : "",
    };

    return NextResponse.json(segundaLectura);
  } catch (err) {
    console.error("[EGO /api/segunda-lectura]", err);
    return NextResponse.json(
      { error: "No se pudo generar la segunda lectura. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
