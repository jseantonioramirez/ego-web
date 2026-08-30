import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Cualquier texto que le pasemos aquí ya viene acotado por el system
 * prompt (60-120 palabras de cuerpo_diagnostico + un título corto), así
 * que este límite es solo un cinturón de seguridad, no la restricción
 * real.
 */
const MAX_TEXT_LENGTH = 2000;

// eleven_flash_v2_5 prioriza latencia sobre matiz interpretativo frente a
// eleven_multilingual_v2 (que usábamos antes) — es el cambio con más
// impacto en "la voz tarda en entrar", junto con optimize_streaming_latency
// más abajo. Sigue soportando español con buena calidad.
const ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";

type VoiceGender = "m" | "f";

function elevenLabsConfig(gender: VoiceGender) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  // La voz femenina es opcional: si su variable no está configurada,
  // caemos a la masculina en vez de romper el endpoint.
  const voiceId =
    (gender === "f" ? process.env.ELEVENLABS_VOICE_ID_FEMALE : null) ||
    process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error(
      "ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID no están configuradas. Añádelas a tu .env.local (desarrollo) o a las variables de entorno del proyecto en Vercel (producción)."
    );
  }
  return { apiKey, voiceId };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown> | null;
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  const gender: VoiceGender = b?.voice === "f" ? "f" : "m";

  if (!text) {
    return NextResponse.json({ error: "No hay texto para leer." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "El texto es demasiado largo para generar audio." }, { status: 400 });
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "speak", RATE_LIMITS.speak.limit, RATE_LIMITS.speak.windowMinutes);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Has pedido demasiado audio en poco tiempo. Espera unos minutos y vuelve a intentarlo." },
      { status: 429, headers: rl.retryAfterSeconds ? { "Retry-After": String(rl.retryAfterSeconds) } : undefined }
    );
  }

  let config: { apiKey: string; voiceId: string };
  try {
    config = elevenLabsConfig(gender);
  } catch (err) {
    console.error("[EGO /api/speak]", err);
    return NextResponse.json(
      { error: "La voz de EGO no está configurada todavía." },
      { status: 500 }
    );
  }

  try {
    // Usamos el endpoint de streaming: el audio empieza a llegar antes
    // de que ElevenLabs termine de generarlo entero, así que la espera
    // percibida es menor que con el endpoint no-streaming.
    // optimize_streaming_latency=4 pide a ElevenLabs el máximo recorte de
    // latencia disponible (a costa de una fracción de calidad/consistencia
    // de la primera fracción de audio) — combinado con el modelo Flash de
    // arriba, es la otra mitad del arreglo a "la voz tarda en entrar".
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}/stream?optimize_streaming_latency=4`,
      {
        method: "POST",
        headers: {
          "xi-api-key": config.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: {
            stability: 0.55,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("[EGO /api/speak] error de ElevenLabs", upstream.status, detail);
      return NextResponse.json(
        { error: "No se pudo generar el audio. Inténtalo de nuevo en unos minutos." },
        { status: 502 }
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[EGO /api/speak]", err);
    return NextResponse.json(
      { error: "No se pudo generar el audio. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
