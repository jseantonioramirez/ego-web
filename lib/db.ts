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

/**
 * Historial de casos de miembros de pago — decidido explícitamente por el
 * propietario del producto: quien se registra y paga no debe "arrancar de
 * cero" cada vez, así que EGO puede referenciar sus patrones anteriores.
 *
 * Tabla separada de `cases` (anónima) a propósito, igual que `subscribers`:
 * esta SÍ identifica a la persona por email. Solo se escribe cuando el
 * email ya se verificó como suscripción activa en el propio endpoint (ver
 * app/api/audit, /segunda-lectura, /tercera-lectura) — nunca a partir de
 * un email sin verificar.
 *
 * Un caso que activó la salvaguarda de seguridad (nota_seguridad presente,
 * Regla 6) nunca se guarda aquí, por la misma razón que en `cases`: es el
 * contenido más sensible que puede generar EGO, y además aquí sí está
 * identificado — no tiene sentido conservarlo ni traerlo de vuelta en una
 * sesión futura. Si la salvaguarda se activa en segunda o tercera lectura
 * sobre un caso que ya se había guardado, se borra la fila entera.
 */
let memberCasesSchemaReady = false;

async function ensureMemberCasesSchema() {
  if (memberCasesSchemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS member_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      email TEXT NOT NULL,
      lang TEXT NOT NULL,
      input_text TEXT NOT NULL,
      sesgo_identificado TEXT NOT NULL,
      cuerpo_diagnostico TEXT NOT NULL,
      pregunta_espejo TEXT NOT NULL,
      respuesta TEXT,
      segunda_lectura TEXT,
      pregunta_final TEXT,
      respuesta2 TEXT,
      tercera_lectura TEXT
    );
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS member_cases_email_created_idx
      ON member_cases (email, created_at DESC);
  `;
  memberCasesSchemaReady = true;
}

export interface MemberCaseDiagnosisStage {
  email: string;
  lang: string;
  input: string;
  sesgoIdentificado: string;
  cuerpoDiagnostico: string;
  preguntaEspejo: string;
}

/** Guarda el diagnóstico inicial de un miembro. Devuelve el id del caso, para encadenar las siguientes vueltas. */
export async function insertMemberCase(params: MemberCaseDiagnosisStage): Promise<string> {
  await ensureMemberCasesSchema();
  const { rows } = await sql`
    INSERT INTO member_cases (
      email, lang, input_text, sesgo_identificado, cuerpo_diagnostico, pregunta_espejo
    ) VALUES (
      ${params.email}, ${params.lang}, ${params.input},
      ${params.sesgoIdentificado}, ${params.cuerpoDiagnostico}, ${params.preguntaEspejo}
    )
    RETURNING id;
  `;
  return String(rows[0].id);
}

export interface MemberCaseSegundaLecturaStage extends MemberCaseDiagnosisStage {
  /** Id devuelto por insertMemberCase, si esta llamada lo tuvo disponible. Si falta (el usuario se hizo miembro entre el diagnóstico y ahora), se crea el caso completo en este mismo paso. */
  caseId?: string | null;
  respuesta: string;
  segundaLectura: string;
  preguntaFinal: string;
}

/** Añade la segunda lectura a un caso existente, o crea el caso desde cero si no había id (miembro nuevo a mitad de sesión). Devuelve el id del caso. */
export async function saveMemberCaseSegundaLectura(
  params: MemberCaseSegundaLecturaStage
): Promise<string> {
  await ensureMemberCasesSchema();
  if (params.caseId) {
    const { rows } = await sql`
      UPDATE member_cases
      SET respuesta = ${params.respuesta},
          segunda_lectura = ${params.segundaLectura},
          pregunta_final = ${params.preguntaFinal},
          updated_at = now()
      WHERE id = ${params.caseId} AND email = ${params.email}
      RETURNING id;
    `;
    if (rows.length > 0) return String(rows[0].id);
    // El id no correspondía a este email (o ya no existe) — se crea de cero por seguridad.
  }
  const { rows } = await sql`
    INSERT INTO member_cases (
      email, lang, input_text, sesgo_identificado, cuerpo_diagnostico, pregunta_espejo,
      respuesta, segunda_lectura, pregunta_final
    ) VALUES (
      ${params.email}, ${params.lang}, ${params.input},
      ${params.sesgoIdentificado}, ${params.cuerpoDiagnostico}, ${params.preguntaEspejo},
      ${params.respuesta}, ${params.segundaLectura}, ${params.preguntaFinal}
    )
    RETURNING id;
  `;
  return String(rows[0].id);
}

export interface MemberCaseTerceraLecturaStage extends MemberCaseSegundaLecturaStage {
  respuesta2: string;
  terceraLectura: string;
}

/** Cierra el caso con la tercera lectura (update o insert de cero, igual que en la segunda). */
export async function saveMemberCaseTerceraLectura(
  params: MemberCaseTerceraLecturaStage
): Promise<void> {
  await ensureMemberCasesSchema();
  if (params.caseId) {
    const { rowCount } = await sql`
      UPDATE member_cases
      SET respuesta2 = ${params.respuesta2},
          tercera_lectura = ${params.terceraLectura},
          respuesta = ${params.respuesta},
          segunda_lectura = ${params.segundaLectura},
          pregunta_final = ${params.preguntaFinal},
          updated_at = now()
      WHERE id = ${params.caseId} AND email = ${params.email};
    `;
    if (rowCount && rowCount > 0) return;
  }
  await sql`
    INSERT INTO member_cases (
      email, lang, input_text, sesgo_identificado, cuerpo_diagnostico, pregunta_espejo,
      respuesta, segunda_lectura, pregunta_final, respuesta2, tercera_lectura
    ) VALUES (
      ${params.email}, ${params.lang}, ${params.input},
      ${params.sesgoIdentificado}, ${params.cuerpoDiagnostico}, ${params.preguntaEspejo},
      ${params.respuesta}, ${params.segundaLectura}, ${params.preguntaFinal},
      ${params.respuesta2}, ${params.terceraLectura}
    );
  `;
}

/** Borra un caso completo — se usa cuando la salvaguarda de seguridad (Regla 6) se activa en segunda o tercera lectura sobre un caso que ya se había guardado. */
export async function deleteMemberCase(caseId: string, email: string): Promise<void> {
  await ensureMemberCasesSchema();
  await sql`DELETE FROM member_cases WHERE id = ${caseId} AND email = ${email};`;
}

export interface MemberCaseHistoryItem {
  createdAt: string;
  sesgoIdentificado: string;
  inputExcerpt: string;
}

/** Últimos casos de un miembro, para que EGO pueda referenciar patrones recurrentes en un diagnóstico nuevo. Nunca se llama con un email sin verificar. */
export async function getMemberCaseHistory(
  email: string,
  limit = 8
): Promise<MemberCaseHistoryItem[]> {
  await ensureMemberCasesSchema();
  const { rows } = await sql`
    SELECT created_at, sesgo_identificado, input_text
    FROM member_cases
    WHERE email = ${email}
    ORDER BY created_at DESC
    LIMIT ${limit};
  `;
  return rows.map((r) => ({
    createdAt: String(r.created_at),
    sesgoIdentificado: String(r.sesgo_identificado),
    inputExcerpt: String(r.input_text).slice(0, 140),
  }));
}
