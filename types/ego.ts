/**
 * Contrato de datos entre el frontend (web hoy, app nativa mañana) y el
 * backend de EGO. Cualquier cliente — esta web, una futura app React
 * Native, un tercero integrando la API — habla este mismo idioma.
 */
export interface EgoDiagnosis {
  sesgo_identificado: string;
  diagnostico_titulo: string;
  cuerpo_diagnostico: string;
  accion_tactica: string[];
  prescripcion_fisica: boolean;
  /** Presente solo cuando se activó la salvaguarda de seguridad (sección 6 del system prompt). */
  nota_seguridad: string | null;
  /** Pregunta de cierre (Regla 4) que el usuario debe responderse a sí mismo. Vacía solo en modo de salvaguarda. */
  pregunta_espejo: string;
}

export interface EgoAuditRequest {
  input: string;
}

export interface EgoAuditErrorResponse {
  error: string;
}

/**
 * Segunda vuelta, opcional: solo ocurre si el usuario responde a la
 * pregunta_espejo del diagnóstico original. Casi siempre deja una única
 * pregunta de cierre más (`pregunta_final`) para una tercera y última
 * vuelta — ver sección 9 del system prompt. La tercera vuelta sí es el
 * cierre definitivo de la auditoría, no esta.
 */
export interface EgoSegundaLectura {
  segunda_lectura: string;
  /** Presente solo si la respuesta del usuario activó la salvaguarda de seguridad. */
  nota_seguridad: string | null;
  /** Pregunta de cierre para la tercera y última vuelta. Vacía solo en modo de salvaguarda. */
  pregunta_final: string;
}

export interface EgoSegundaLecturaRequest {
  input: string;
  sesgo_identificado: string;
  diagnostico_titulo: string;
  cuerpo_diagnostico: string;
  pregunta_espejo: string;
  respuesta: string;
}

/**
 * Tercera y última vuelta: solo ocurre si el usuario responde a
 * `pregunta_final`. Es el cierre definitivo de la auditoría — no deja
 * ninguna pregunta abierta después. Ver sección 10 del system prompt.
 */
export interface EgoTerceraLectura {
  tercera_lectura: string;
  /** Presente solo si la respuesta del usuario activó la salvaguarda de seguridad. */
  nota_seguridad: string | null;
}

export interface EgoTerceraLecturaRequest {
  input: string;
  sesgo_identificado: string;
  diagnostico_titulo: string;
  cuerpo_diagnostico: string;
  pregunta_espejo: string;
  respuesta: string;
  segunda_lectura: string;
  pregunta_final: string;
  respuesta2: string;
}
