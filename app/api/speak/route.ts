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

// Volvemos a eleven_multilingual_v2: eleven_flash_v2_5 ganaba velocidad
// pero sonaba "a robot" (feedback directo probándolo) — v2 es el modelo
// "más realista, con expresión emocional rica" de ElevenLabs, a costa de
// algo más de latencia. Para esta pantalla (voz que se genera una vez por
// interacción, no una conversación en vivo turno a turno) la naturalidad
// pesa más que unos cientos de ms de menos.
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

// CORS abierto solo en este endpoint — a propósito, para poder probar la
// voz real desde prototipos de diseño fuera del dominio de la app (p. ej.
// un artefacto o un archivo local) sin desplegar cada concepto como parte
// de la web. No expone nada sensible (solo genera audio a partir de
// texto arbitrario) y ya está limitado por el rate-limit por IP de abajo,
// así que abrir el origen no cambia la superficie real de abuso.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type VoiceOption = "m" | "f" | "abuela";

// --- Azure Speech (opcional, para las voces normales m/f) --------------
//
// ElevenLabs solo deja elegir voces "por descripción" en su librería
// comunitaria — no hay filtro real de acento ni mucha variedad seria en
// español. Azure sí: sus voces se eligen por región de idioma exacta
// (es-ES = castellano, no es-MX/es-AR/etc.), con decenas de voces
// neuronales profesionales por región. Por eso las voces normales de EGO
// (m/f) intentan Azure primero si está configurado, y la voz de la abuela
// se queda en ElevenLabs siempre (es el único de los dos que clona una
// voz real a partir de una grabación).
//
// Nada de esto rompe nada si no configuras las variables: sin
// AZURE_SPEECH_KEY/AZURE_SPEECH_REGION/AZURE_VOICE_ID_*, el endpoint
// sigue funcionando exactamente igual que antes, todo con ElevenLabs.
function azureConfig(voice: "m" | "f") {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voiceName =
    (voice === "f" ? process.env.AZURE_VOICE_ID_FEMALE : null) ||
    process.env.AZURE_VOICE_ID_MALE;
  if (!key || !region || !voiceName) return null;
  return { key, region, voiceName };
}

// Escapado mínimo para no romper el XML de SSML si el texto trae &, <, >,
// comillas, etc. (el texto viene de un modelo de lenguaje, no de HTML, así
// que esto es solo para que el XML sea válido, no una limpieza de HTML).
function escapeSsml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function speakWithAzure(text: string, cfg: { key: string; region: string; voiceName: string }) {
  const ssml =
    `<speak version="1.0" xml:lang="es-ES">` +
    `<voice xml:lang="es-ES" name="${cfg.voiceName}">${escapeSsml(text)}</voice>` +
    `</speak>`;

  return fetch(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": cfg.key,
      "Content-Type": "application/ssml+xml",
      // 24kHz/48kbps mp3: buena calidad y ligero, cómodo para reproducir
      // en el navegador sin transcodificar nada en el cliente.
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "ego-web-speak",
    },
    body: ssml,
  });
}

// --- ElevenLabs (voz de la abuela, y red de seguridad para m/f) --------

function elevenLabsConfig(voice: VoiceOption) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  // La voz de la abuela y la femenina son opcionales: si su variable no
  // está configurada, caemos a la masculina en vez de romper el endpoint.
  // ELEVENLABS_VOICE_ID_ABUELA es el ID del clon de voz real de su
  // abuela una vez creado en ElevenLabs (Voice Library / Instant Voice
  // Cloning) — hasta que esa variable exista, "abuela" cae a la voz
  // femenina normal.
  const voiceId =
    (voice === "abuela" ? process.env.ELEVENLABS_VOICE_ID_ABUELA : null) ||
    (voice !== "m" ? process.env.ELEVENLABS_VOICE_ID_FEMALE : null) ||
    process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error(
      "ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID no están configuradas. Añádelas a tu .env.local (desarrollo) o a las variables de entorno del proyecto en Vercel (producción)."
    );
  }
  return { apiKey, voiceId };
}

async function speakWithElevenLabs(text: string, voice: VoiceOption) {
  const config = elevenLabsConfig(voice);
  // Usamos el endpoint de streaming: el audio empieza a llegar antes de
  // que ElevenLabs termine de generarlo entero, así que la espera
  // percibida es menor que con el endpoint no-streaming. Sin
  // optimize_streaming_latency=4 (máximo recorte de latencia a costa de
  // calidad/consistencia) porque priorizamos que la voz no suene a robot
  // sobre ganar unos milisegundos.
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}/stream`, {
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
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400, headers: CORS_HEADERS });
  }

  const b = body as Record<string, unknown> | null;
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  const voice: VoiceOption =
    b?.voice === "abuela" ? "abuela" : b?.voice === "f" ? "f" : "m";

  if (!text) {
    return NextResponse.json({ error: "No hay texto para leer." }, { status: 400, headers: CORS_HEADERS });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: "El texto es demasiado largo para generar audio." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "speak", RATE_LIMITS.speak.limit, RATE_LIMITS.speak.windowMinutes);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Has pedido demasiado audio en poco tiempo. Espera unos minutos y vuelve a intentarlo." },
      {
        status: 429,
        headers: Object.assign(
          {},
          CORS_HEADERS,
          rl.retryAfterSeconds ? { "Retry-After": String(rl.retryAfterSeconds) } : undefined
        ),
      }
    );
  }

  try {
    // La abuela se queda siempre en ElevenLabs (Azure no clona voces
    // reales). Para m/f, si Azure está configurado, lo probamos primero;
    // si falla o no está configurado, caemos a ElevenLabs.
    if (voice !== "abuela") {
      const az = azureConfig(voice);
      if (az) {
        try {
          const upstream = await speakWithAzure(text, az);
          if (upstream.ok) {
            const audio = await upstream.arrayBuffer();
            return new NextResponse(audio, {
              status: 200,
              headers: Object.assign(
                { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
                CORS_HEADERS
              ),
            });
          }
          const detail = await upstream.text().catch(() => "");
          console.error("[EGO /api/speak] error de Azure, cae a ElevenLabs", upstream.status, detail);
        } catch (err) {
          console.error("[EGO /api/speak] Azure falló, cae a ElevenLabs", err);
        }
      }
    }

    const upstream = await speakWithElevenLabs(text, voice);

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("[EGO /api/speak] error de ElevenLabs", upstream.status, detail);
      return NextResponse.json(
        { error: "No se pudo generar el audio. Inténtalo de nuevo en unos minutos." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: Object.assign(
        {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
        CORS_HEADERS
      ),
    });
  } catch (err) {
    console.error("[EGO /api/speak]", err);
    return NextResponse.json(
      { error: "La voz de EGO no está configurada todavía." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
