/**
 * Límite de uso anónimo por IP — primera línea de defensa de costes.
 *
 * Hoy (agosto 2026) EGO no tiene cuentas, así que la única forma de
 * evitar que un script automatizado dispare llamadas ilimitadas a
 * Anthropic (pago por token) o ElevenLabs (créditos mensuales) es
 * limitar por IP. No es una defensa perfecta (una IP se puede rotar),
 * pero corta el caso más probable y más caro: un bucle o un bot
 * golpeando el mismo endpoint miles de veces.
 *
 * Implementado sobre la misma base de datos Postgres que ya usa
 * `lib/db.ts`, para no depender de un servicio nuevo (Redis/Upstash)
 * mientras el tráfico sea bajo. Si el proyecto escala mucho, esto es
 * lo primero a migrar a un almacén en memoria tipo Redis — ver nota al
 * final del archivo.
 */
import { sql } from "@vercel/postgres";
import type { NextRequest } from "next/server";

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      client_key TEXT NOT NULL,
      route TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INT NOT NULL DEFAULT 0,
      PRIMARY KEY (client_key, route, window_start)
    );
  `;
  schemaReady = true;
}

/**
 * Next.js 15+ eliminó `NextRequest.ip` (ver node_modules/next/dist/docs/
 * .../next-request.md, "Version History") — hay que leerla de las
 * cabeceras que Vercel ya inyecta en cada request.
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Sin IP identificable (poco común en Vercel) agrupamos todo bajo una
  // misma clave en vez de fallar abierto sin límite alguno.
  return "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Ventana fija (no deslizante) de `windowMinutes` minutos: sencillo,
 * una sola fila por IP+ruta+ventana, sin necesidad de limpiar filas
 * viejas con un cron aparte todavía (se puede añadir un DELETE
 * periódico más adelante si la tabla crece mucho).
 */
export async function checkRateLimit(
  ip: string,
  route: string,
  limit: number,
  windowMinutes: number
): Promise<RateLimitResult> {
  // Si la base de datos falla, dejamos pasar la petición: un límite de
  // coste roto no debe tumbar el producto para usuarios legítimos.
  try {
    await ensureSchema();

    const windowMs = windowMinutes * 60 * 1000;
    const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;
    const windowStart = new Date(windowStartMs).toISOString();

    const { rows } = await sql`
      INSERT INTO rate_limits (client_key, route, window_start, count)
      VALUES (${ip}, ${route}, ${windowStart}, 1)
      ON CONFLICT (client_key, route, window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count;
    `;

    const count = Number(rows[0]?.count ?? 1);

    if (count > limit) {
      const retryAfterSeconds = Math.ceil((windowStartMs + windowMs - Date.now()) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true };
  } catch (err) {
    console.error("[EGO rate-limit] fallo comprobando límite, dejando pasar la petición", err);
    return { allowed: true };
  }
}

/**
 * Límites por defecto por endpoint (peticiones por IP por hora). Están
 * pensados para dejar de sobra a un usuario real usando la app con
 * normalidad (incluyendo reintentos tras error) mientras cortan un
 * bucle o script: nadie legítimo hace 10 auditorías en una hora desde
 * la misma IP.
 *
 * Si en el futuro esto empieza a bloquear a gente real (oficinas con
 * IP compartida, por ejemplo) o si el tráfico crece lo bastante como
 * para que las escrituras a Postgres en cada petición pesen, migra
 * esta tabla a Vercel KV / Upstash Redis (mismo contrato de función,
 * solo cambia la implementación de checkRateLimit).
 */
export const RATE_LIMITS = {
  audit: { limit: 10, windowMinutes: 60 },
  segundaLectura: { limit: 15, windowMinutes: 60 },
  terceraLectura: { limit: 15, windowMinutes: 60 },
  speak: { limit: 30, windowMinutes: 60 },
} as const;
