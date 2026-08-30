import type Anthropic from "@anthropic-ai/sdk";

/**
 * Herramienta forzada que le pasamos a Claude para garantizar que la
 * respuesta llega siempre en el esquema exacto que consume el frontend
 * (types/ego.ts) — nada de parsear texto libre y confiar en que el
 * modelo no se salga del JSON.
 */
export const EGO_DIAGNOSIS_TOOL: Anthropic.Tool = {
  name: "emitir_diagnostico",
  description:
    "Emite el diagnóstico estructurado de EGO para la declaración del usuario, siguiendo exactamente las reglas del system prompt.",
  input_schema: {
    type: "object",
    properties: {
      sesgo_identificado: {
        type: "string",
        description:
          "Nombre técnico corto del sesgo o mecanismo detectado. SIEMPRE en el mismo idioma que el mensaje del usuario (ver sección 0 del system prompt) — nunca fijo en español. Ej. en español: 'Aversión a la pérdida', 'Ilusión de control'; el mismo concepto en inglés: 'Loss aversion', 'Illusion of control'. Los ejemplos aquí son solo ilustrativos del tipo de término, no del idioma en que debes escribirlo.",
      },
      diagnostico_titulo: {
        type: "string",
        description: "2 a 5 palabras, estilo titular de dictamen.",
      },
      cuerpo_diagnostico: {
        type: "string",
        description:
          "60 a 120 palabras, tono clínico, aplicando el marco teórico pertinente a la frase exacta del usuario.",
      },
      accion_tactica: {
        type: "array",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4,
        description: "Entre 2 y 4 órdenes en imperativo, cortas, sin justificaciones largas.",
      },
      prescripcion_fisica: {
        type: "boolean",
        description:
          "true si una de las entradas de accion_tactica es la orden de desconexión física de la Regla 3.",
      },
      nota_seguridad: {
        type: "string",
        description:
          "Cadena vacía en el caso normal. Solo se rellena si se activó la salvaguarda de seguridad de la sección 6 del system prompt.",
      },
      pregunta_espejo: {
        type: "string",
        description:
          "La pregunta de cierre de la Regla 4: una sola frase, en segunda persona, que el usuario debe responderse a sí mismo. No es retórica ni empática — confronta el mecanismo exacto detectado. Vacía solo en modo de salvaguarda (sección 6).",
      },
    },
    required: [
      "sesgo_identificado",
      "diagnostico_titulo",
      "cuerpo_diagnostico",
      "accion_tactica",
      "prescripcion_fisica",
      "nota_seguridad",
      "pregunta_espejo",
    ],
  },
};

/**
 * Segunda llamada, opcional: se dispara solo si el usuario responde a la
 * pregunta_espejo del diagnóstico original. Sigue sin ser una
 * conversación abierta, pero ya no es el cierre definitivo: deja una
 * única pregunta más (`pregunta_final`) para la tercera y última vuelta.
 * Ver sección 9 del system prompt.
 */
export const EGO_SEGUNDA_LECTURA_TOOL: Anthropic.Tool = {
  name: "emitir_segunda_lectura",
  description:
    "Emite el dictamen breve de EGO tras la respuesta del usuario a la pregunta_espejo, siguiendo exactamente la sección 9 del system prompt. No es una invitación a una conversación abierta, pero sí deja una última pregunta para la tercera y última vuelta.",
  input_schema: {
    type: "object",
    properties: {
      segunda_lectura: {
        type: "string",
        description:
          "El dictamen: 30 a 70 palabras, más corto y afilado que el diagnóstico original, que confronta específicamente la respuesta que dio el usuario a la pregunta_espejo. Termina en afirmación, nunca en pregunta (la pregunta va aparte, en pregunta_final). En modo de salvaguarda (ver sección 6), contiene la misma preocupación directa y clara que reemplaza al dictamen frío — no una cadena vacía.",
      },
      nota_seguridad: {
        type: "string",
        description:
          "Cadena vacía en el caso normal. Solo se rellena si se activó la salvaguarda de seguridad de la sección 6 a partir de la respuesta del usuario.",
      },
      pregunta_final: {
        type: "string",
        description:
          "La última pregunta de la auditoría, para la tercera y última vuelta. Una sola frase, en segunda persona, distinta en fondo y forma de pregunta_espejo (no repitas su estructura), construida sobre la respuesta que el usuario acaba de dar. Termina siempre en signo de interrogación. Vacía solo en modo de salvaguarda (sección 6), donde puede sustituirse por una pregunta de apoyo genuino o dejarse vacía.",
      },
    },
    required: ["segunda_lectura", "nota_seguridad", "pregunta_final"],
  },
};

/**
 * Tercera llamada, opcional: se dispara solo si el usuario responde a
 * pregunta_final. Este sí es el cierre definitivo — no deja ninguna
 * pregunta abierta después. Ver sección 10 del system prompt.
 */
export const EGO_TERCERA_LECTURA_TOOL: Anthropic.Tool = {
  name: "emitir_tercera_lectura",
  description:
    "Emite el dictamen final y definitivo de EGO tras la respuesta del usuario a pregunta_final, siguiendo exactamente la sección 10 del system prompt. Este es el cierre real: no invita a seguir conversando bajo ningún concepto.",
  input_schema: {
    type: "object",
    properties: {
      tercera_lectura: {
        type: "string",
        description:
          "El dictamen final y definitivo: 20 a 50 palabras, la frase más corta y afilada de las tres, que confronta específicamente la respuesta del usuario a pregunta_final. Termina en afirmación. Nunca contiene una pregunta ni invita a continuar. En modo de salvaguarda (ver sección 6), contiene la misma preocupación directa y clara — nunca una cadena vacía.",
      },
      nota_seguridad: {
        type: "string",
        description:
          "Cadena vacía en el caso normal. Solo se rellena si se activó la salvaguarda de seguridad de la sección 6 a partir de la respuesta del usuario.",
      },
    },
    required: ["tercera_lectura", "nota_seguridad"],
  },
};
