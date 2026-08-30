import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { upsertSubscriber, updateSubscriptionStatus } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Webhook de Stripe — mantiene la tabla `subscribers` sincronizada con lo
 * que pasa realmente en Stripe (pago hecho, renovación fallida, baja).
 *
 * Nunca leas el body con `req.json()` aquí: Stripe firma el cuerpo EXACTO
 * en bytes, así que hace falta el texto crudo (`req.text()`) para poder
 * verificar la firma con STRIPE_WEBHOOK_SECRET.
 *
 * Inactivo hasta que actives Stripe (ver README, sección Cobro). Con las
 * variables sin configurar, responde 503 en vez de romper el deploy.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "El cobro todavía no está activado en EGO." },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Falta la firma de Stripe." }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[EGO /api/webhook/stripe] firma inválida", err);
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_details?.email ?? session.customer_email;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (email && customerId) {
          await upsertSubscriber({
            email,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId ?? null,
            plan: "annual",
            status: "active",
          });
        } else {
          console.error(
            "[EGO /api/webhook/stripe] checkout.session.completed sin email o customer",
            session.id
          );
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        // Estados de Stripe: active, trialing, past_due, canceled, unpaid, incomplete, incomplete_expired.
        await updateSubscriptionStatus(subscription.id, subscription.status);
        break;
      }

      default:
        // El resto de eventos (facturas, disputas, etc.) no nos hace falta
        // procesarlos hoy — se ignoran a propósito, no es un error.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[EGO /api/webhook/stripe]", err);
    return NextResponse.json({ error: "Error procesando el evento." }, { status: 500 });
  }
}
