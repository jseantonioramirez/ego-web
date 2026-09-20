import { NextRequest, NextResponse } from "next/server";
import { isEmailSubscribed } from "@/lib/db";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * "¿Ya eres miembro?" — consulta si un email tiene una suscripción activa,
 * para desbloquear la tercera lectura sin pasar otra vez por Stripe
 * Checkout (por ejemplo, si vuelve desde otro dispositivo).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(
    ip,
    "subscriptionStatus",
    RATE_LIMITS.subscriptionStatus.limit,
    RATE_LIMITS.subscriptionStatus.windowMinutes
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." },
      { status: 429, headers: rl.retryAfterSeconds ? { "Retry-After": String(rl.retryAfterSeconds) } : undefined }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido." }, { status: 400 });
  }

  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== "string" || !email.trim()) {
    return NextResponse.json({ error: "Falta el email." }, { status: 400 });
  }

  try {
    const active = await isEmailSubscribed(email.trim());
    return NextResponse.json({ active });
  } catch (err) {
    console.error("[EGO /api/subscription-status]", err);
    // Un fallo de base de datos aquí no debe dejar a un miembro de pago
    // real sin acceso — pero tampoco lo damos por hecho: devolvemos error
    // explícito para que el cliente lo muestre en vez de fingir que sí es
    // miembro.
    return NextResponse.json({ error: "No se pudo comprobar la suscripción." }, { status: 500 });
  }
}
