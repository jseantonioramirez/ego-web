import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Crea una sesión de Stripe Checkout (plan mensual o anual, según `plan`
 * en el body) y devuelve la URL a la que redirigir al navegador del
 * cliente. El propio Checkout de Stripe pide el email y la tarjeta — EGO
 * nunca ve ni toca ese dato directamente.
 *
 * Inactivo hasta que exista STRIPE_SECRET_KEY y al menos uno de
 * STRIPE_PRICE_ID_ANNUAL / STRIPE_PRICE_ID_MONTHLY (ver README, sección
 * Cobro). Sin esas variables devuelve 503 en vez de romper el resto de la
 * app.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "El cobro todavía no está activado en EGO." },
      { status: 503 }
    );
  }

  const ip = getClientIp(req);
  const rl = await checkRateLimit(ip, "checkout", RATE_LIMITS.checkout.limit, RATE_LIMITS.checkout.windowMinutes);
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
    body = {};
  }
  const b = body as { email?: unknown; plan?: unknown } | null;
  const email = b?.email;
  const prefillEmail = typeof email === "string" && email.trim() ? email.trim() : undefined;
  const plan = b?.plan === "monthly" ? "monthly" : "annual";
  const priceId =
    plan === "monthly" ? process.env.STRIPE_PRICE_ID_MONTHLY : process.env.STRIPE_PRICE_ID_ANNUAL;

  if (!priceId) {
    return NextResponse.json(
      { error: `El plan ${plan === "monthly" ? "mensual" : "anual"} todavía no está configurado.` },
      { status: 503 }
    );
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: prefillEmail,
      success_url: `${origin}/?suscripcion=exito&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?suscripcion=cancelada`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Stripe no devolvió una URL de checkout.");
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[EGO /api/checkout]", err);
    return NextResponse.json(
      { error: "No se pudo iniciar el pago. Inténtalo de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
