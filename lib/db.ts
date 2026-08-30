/**
 * Almacenamiento anónimo de casos — para investigación y para ir
 * afinando el system prompt con ejemplos reales (ver README, sección
 * "Base de datos de casos anónimos").
 *
 * Reglas, decididas explícitamente por el propietario del producto:
 * - Nunca se guarda ningún dato de cuenta ni identificador de usuario:
 *   hoy EGO no tiene cuentas, así que no hay nada que desvincular.
 * - Los casos donde se activó la salvaguarda de seguridad (nota_seguridad
 *   presente — ver Regla 6 del system prompt) NUNCA se guardan aquí. Es
 *   el contenido más sensible que puede generar EGO y no tiene sentido
 *   analizarlo para mejorar el producto.
 * - El texto libre que escribe el usuario SÍ se guarda tal cual, porque
 *   es lo que hace útil la base de datos para estudiar patrones — pero
 *   "anónimo" aquí significa "no vinculado a una identidad", no "imposible
 *   de identificar por su contenido". Ver conversación con el usuario.
 */
import { sql } from "@vercel/postgres";
import type { EgoDiagnosis } from "@/types/ego";

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      lang TEXT NOT NULL,
      input_text TEXT NOT NULL,
      sesgo_identificado TEXT NOT NULL,
      diagnostico_titulo TEXT NOT NULL,
      cuerpo_diagnostico TEXT NOT NULL,
      accion_tactica JSONB NOT NULL,
      prescripcion_fisica BOOLEAN NOT NULL
    );
  `;
  schemaReady = true;
}

export async function saveAnonymizedCase(
  input: string,
  lang: string,
  diagnosis: EgoDiagnosis
): Promise<void> {
  if (diagnosis.nota_seguridad) {
    // Caso de crisis — excluido de la base de datos de investigación.
    return;
  }

  await ensureSchema();

  await sql`
    INSERT INTO cases (
      lang, input_text, sesgo_identificado, diagnostico_titulo,
      cuerpo_diagnostico, accion_tactica, prescripcion_fisica
    ) VALUES (
      ${lang},
      ${input},
      ${diagnosis.sesgo_identificado},
      ${diagnosis.diagnostico_titulo},
      ${diagnosis.cuerpo_diagnostico},
      ${JSON.stringify(diagnosis.accion_tactica)}::jsonb,
      ${diagnosis.prescripcion_fisica}
    );
  `;
}

/**
 * Suscriptores de pago (Stripe) — tabla separada de `cases` a propósito:
 * esta SÍ identifica a la persona (email), porque hace falta para poder
 * cobrarle y para que recupere acceso si cambia de dispositivo. Nunca
 * mezcles filas de esta tabla con la base de datos anónima de casos.
 *
 * Preparada desde ya (ver lib/stripe.ts) aunque la cuenta de Stripe
 * todavía no exista; no se usa hasta que se active el cobro.
 */
let subscribersSchemaReady = false;

async function ensureSubscribersSchema() {
  if (subscribersSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      email TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT NOT NULL,
      stripe_subscription_id TEXT,
      plan TEXT NOT NULL DEFAULT 'annual',
      status TEXT NOT NULL
    );
  `;
  subscribersSchemaReady = true;
}

export interface SubscriberRecord {
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  plan?: string;
  status: string;
}

/** Crea o actualiza un suscriptor a partir de un evento de Stripe (checkout completado, cambio de estado, etc.). */
export async function upsertSubscriber(sub: SubscriberRecord): Promise<void> {
  await ensureSubscribersSchema();
  await sql`
    INSERT INTO subscribers (email, stripe_customer_id, stripe_subscription_id, plan, status)
    VALUES (
      ${sub.email},
      ${sub.stripeCustomerId},
      ${sub.stripeSubscriptionId ?? null},
      ${sub.plan ?? "annual"},
      ${sub.status}
    )
    ON CONFLICT (email) DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      updated_at = now();
  `;
}

/** Actualiza solo el estado (usado por los webhooks de cambio/cancelación de suscripción). */
export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: string
): Promise<void> {
  await ensureSubscribersSchema();
  await sql`
    UPDATE subscribers
    SET status = ${status}, updated_at = now()
    WHERE stripe_subscription_id = ${stripeSubscriptionId};
  `;
}

/** Para cuando exista la puerta de "auditorías gratis agotadas": ¿este email ya paga? */
export async function isEmailSubscribed(email: string): Promise<boolean> {
  await ensureSubscribersSchema();
  const { rows } = await sql`
    SELECT status FROM subscribers WHERE email = ${email} AND status = 'active' LIMIT 1;
  `;
  return rows.length > 0;
}
