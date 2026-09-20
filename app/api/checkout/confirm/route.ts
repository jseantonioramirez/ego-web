import { NextRequest, NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Se llama justo después de volver de Stripe Checkout con éxito
 * (`/?suscripcion=exito&session_id=...`) para recuperar el email de la
 * persona sin pedírselo otra vez — Stripe ya lo tiene, EGO solo lo lee de
 * la sesión de checkout.
 *
 * Deliberadamente NO consulta la tabla `subscribers`: el webhook que la
 * rellena puede tardar unos segundos más que esta redirección, así que
 * confiar en la sesión de Stripe (no en nuestra base de datos) evita una
 * carrera en la que la persona vuelve pagada pero todavía no se le
 * reconoce como miembro.
 */
export async function GET(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "El cobro todavía no está activado en EGO." }, { status: 503 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Falta session_id." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paid = session.payment_status === "paid" || session.status === "complete";
    const email = session.customer_details?.email ?? session.customer_email ?? null;

    if (!paid || !email) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({ active: true, email });
  } catch (err) {
    console.error("[EGO /api/checkout/confirm]", err);
    return NextResponse.json({ error: "No se pudo confirmar el pago." }, { status: 500 });
  }
}
