/**
 * Cliente de Stripe — preparado pero inactivo hasta que exista una cuenta
 * real de Stripe y sus variables de entorno.
 *
 * Deliberadamente NO se crea el cliente al importar este archivo (eso
 * rompería el build/deploy en cuanto STRIPE_SECRET_KEY no exista, que es
 * la situación de hoy). Se crea de forma perezosa la primera vez que algo
 * lo necesita de verdad — así la web sigue funcionando con normalidad
 * (auditorías, base de datos anónima) sin cuenta de Stripe, y las rutas
 * que sí dependen de Stripe fallan con un mensaje claro en vez de tumbar
 * el resto de la app.
 */
import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/** true en cuanto las variables de Stripe existen — úsalo para decidir si mostrar el paywall. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID_ANNUAL);
}

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY no está configurada. Crea la cuenta de Stripe y añade la variable de entorno antes de activar el cobro (ver README, sección Cobro)."
    );
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // El paquete `stripe` fija el tipo de apiVersion a la última versión
      // que conoce ESA versión exacta del paquete — así que un simple
      // `npm install` que traiga un patch nuevo (como pasó aquí) puede
      // romper el build aunque el string siga siendo una versión de API
      // de Stripe perfectamente válida. El cast evita que cada bump de
      // dependencia tumbe el build por esto.
      apiVersion: "2026-07-29.dahlia" as Stripe.LatestApiVersion,
    });
  }
  return stripeClient;
}
