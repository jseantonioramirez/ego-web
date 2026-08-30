import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Crea una sesión de Stripe Checkout para el plan anual y devuelve la URL
 * a la que redirigir al navegador del cliente. El propio Checkout de
 * Stripe pide el email y la tarjeta — EGO nunca ve ni toca ese dato.
 *
 * Inactivo hasta que exista STRIPE_SECRET_KEY y STRIPE_PRICE_ID_ANNUAL
 * (ver README, sección Cobro). Sin esas variables devuelve 503 en vez de
 * romper el resto de la app.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "El cobro todavía no está activado en EGO." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const email = (body as { email?: unknown } | null)?.email;
  const prefillEmail = typeof email === "string" && email.trim() ? email.trim() : undefined;

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID_ANNUAL as string, quantity: 1 }],
      customer_email: prefillEmail,
      success_url: `${origin}/?suscripcion=exito`,
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
