"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ParticleStage, { type ParticleStageHandle } from "@/components/ParticleStage";
import type { EgoDiagnosis, EgoAuditResponse, EgoSegundaLectura, EgoTerceraLectura } from "@/types/ego";

type VerdictStatus = "loading" | "success" | "error";
type SegundaLecturaStatus = "idle" | "loading" | "success" | "error";
type TerceraLecturaStatus = "idle" | "loading" | "success" | "error";
type SpeakStatus = "idle" | "loading" | "playing" | "error";
type SpeakSource = "diagnosis" | "segunda" | "tercera";
type VoiceGender = "m" | "f";

interface CaseMeta {
  caseId: string;
  time: string;
  quote: string;
}

type UiLang = "es" | "en";

/**
 * El diagnóstico en sí ya llega en el idioma del usuario (lo garantiza
 * el system prompt vía la API). Pero el texto propio de la interfaz
 * — "Analizando tu caso", botones, etiquetas — se muestra ANTES de esa
 * respuesta o al margen de ella, así que necesita su propia detección
 * ligera a partir de lo que el usuario escribió. No es un detector de
 * idioma real: es una heurística es/en suficiente para que el "shell"
 * de la app no desentone con un input en inglés. Cualquier otro
 * idioma cae al español (comportamiento previo), no se inventa una
 * traducción a medias.
 */
function detectUiLang(text: string): UiLang {
  const t = ` ${text.toLowerCase()} `;
  const esHits = (
    t.match(
      /[áéíóúñ¿¡]| que | de | la | el | en | y | los | se | del | las | un | por | con | no | una | su | al | lo | como | más | pero | porque | esto | está | estoy | mi | me | yo | tú /g
    ) || []
  ).length;
  const enHits = (
    t.match(
      / the | and | you | your | is | are | was | were | have | has | not | but | with | this | that | because | if | my | we | they | he | she | it's | i'm | i've | don't | to | of | for | do /g
    ) || []
  ).length;
  return enHits > esHits ? "en" : "es";
}

const UI_STRINGS: Record<UiLang, Record<string, string>> = {
  es: {
    caseLabel: "CASO",
    loadingPrefix: "Analizando tu caso",
    retry: "Reintentar",
    newQuery: "← Nueva consulta",
    accionTactica: "Acción táctica",
    incluyeAccionFisica: "incluye acción física",
    antesDeCerrarEsto: "Antes de cerrar esto",
    speakStart: "Sentir el pulso",
    speakStop: "Detener lectura",
    speakLoading: "Generando voz…",
    homePlaceholder: "¿Qué te ocurre?",
    homeListening: "Te escucho…",
    homeInputLabel: "¿Qué te ocurre?",
    homeFooterPrivacy: "Un espacio para pensar con claridad antes de actuar.",
    homeFooterAnon: "No pedimos tu nombre. Lo que escribes nos ayuda a mejorar EGO.",
    micStart: "Hablar en vez de escribir",
    micStop: "Detener el dictado",
    micPermission: "Necesitas dar permiso al micrófono para dictar.",
    micGenericError: "No se pudo usar el micrófono. Escribe tu consulta.",
    respuestaLabel: "Tu respuesta",
    respuestaPlaceholder: "Tu respuesta…",
    respuestaSubmit: "Enviar",
    respuestaLoading: "Leyendo tu respuesta",
    respuestaError: "No se pudo generar la segunda lectura.",
    segundaLecturaLabel: "Segunda lectura",
    respuesta2Loading: "Leyendo tu respuesta",
    respuesta2Error: "No se pudo generar la tercera lectura.",
    terceraLecturaLabel: "Tercera lectura",
    voiceMale: "Voz masculina",
    voiceFemale: "Voz femenina",
    paywallTitle: "El cierre definitivo es para miembros",
    paywallBody:
      "El diagnóstico y la segunda lectura son gratis. La tercera lectura — el cierre definitivo de la auditoría — es para miembros de EGO.",
    paywallMonthly: "Mensual",
    paywallMonthlyPrice: "3 $ / mes",
    paywallAnnual: "Anual",
    paywallAnnualPrice: "12 $ / año",
    paywallAnnualNote: "equivale a 1 $/mes",
    paywallSubscribe: "Suscribirme",
    paywallOpeningTab: "Abriendo el pago…",
    paywallNewTabNote: "Se abre en una pestaña nueva para no perder este caso — vuelve aquí cuando termines.",
    paywallAlreadyMember: "¿Ya eres miembro?",
    paywallEmailPlaceholder: "tu@email.com",
    paywallVerify: "Verificar",
    paywallVerifying: "Comprobando…",
    paywallVerifyError: "No encontramos una suscripción activa con ese email.",
    paywallCheckoutError: "No se pudo iniciar el pago. Inténtalo de nuevo.",
    postCheckoutSuccess: "Pago confirmado — ya eres miembro de EGO.",
    postCheckoutCancelled: "Pago cancelado — puedes intentarlo de nuevo cuando quieras.",
  },
  en: {
    caseLabel: "CASE",
    loadingPrefix: "Analyzing your case",
    retry: "Retry",
    newQuery: "← New inquiry",
    accionTactica: "Tactical action",
    incluyeAccionFisica: "includes physical action",
    antesDeCerrarEsto: "Before you close this",
    speakStart: "Feel the pulse",
    speakStop: "Stop reading",
    speakLoading: "Generating voice…",
    homePlaceholder: "What's going on?",
    homeListening: "Listening…",
    homeInputLabel: "What's going on?",
    homeFooterPrivacy: "A space to think clearly before you act.",
    homeFooterAnon: "We don't ask your name. What you write helps us improve EGO.",
    micStart: "Speak instead of typing",
    micStop: "Stop dictation",
    micPermission: "You need to allow microphone access to dictate.",
    micGenericError: "Couldn't use the microphone. Type your query instead.",
    respuestaLabel: "Your answer",
    respuestaPlaceholder: "Your answer…",
    respuestaSubmit: "Send",
    respuestaLoading: "Reading your answer",
    respuestaError: "Couldn't generate the second reading.",
    segundaLecturaLabel: "Second reading",
    respuesta2Loading: "Reading your answer",
    respuesta2Error: "Couldn't generate the third reading.",
    terceraLecturaLabel: "Third reading",
    voiceMale: "Male voice",
    voiceFemale: "Female voice",
    paywallTitle: "The final word is for members",
    paywallBody:
      "The diagnosis and the second reading are free. The third reading — the audit's definitive close — is for EGO members.",
    paywallMonthly: "Monthly",
    paywallMonthlyPrice: "$3 / month",
    paywallAnnual: "Annual",
    paywallAnnualPrice: "$12 / year",
    paywallAnnualNote: "works out to $1/month",
    paywallSubscribe: "Subscribe",
    paywallOpeningTab: "Opening checkout…",
    paywallNewTabNote: "Opens in a new tab so this case isn't lost — come back here when you're done.",
    paywallAlreadyMember: "Already a member?",
    paywallEmailPlaceholder: "you@email.com",
    paywallVerify: "Verify",
    paywallVerifying: "Checking…",
    paywallVerifyError: "We couldn't find an active subscription with that email.",
    paywallCheckoutError: "Couldn't start checkout. Please try again.",
    postCheckoutSuccess: "Payment confirmed — you're now an EGO member.",
    postCheckoutCancelled: "Payment cancelled — you can try again anytime.",
  },
};

/**
 * Interruptor manual de idioma para el "shell" de la pantalla de inicio
 * (placeholder, aria-labels, texto de privacidad). En ese punto del
 * flujo todavía no hay texto del usuario del que inferir el idioma
 * (detectUiLang necesita una frase real), así que usamos: 1) la
 * elección manual guardada, si existe; 2) si no, el idioma del
 * navegador como valor por defecto razonable; 3) español si nada de
 * lo anterior aplica. El diagnóstico en sí NO se ve afectado por este
 * interruptor: sigue determinado por el idioma real de lo que el
 * usuario escribe, vía el system prompt.
 */
const UI_LANG_STORAGE_KEY = "ego-ui-lang";

function getStoredUiLang(): UiLang | null {
  try {
    const v = window.localStorage.getItem(UI_LANG_STORAGE_KEY);
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

function getBrowserUiLang(): UiLang {
  try {
    return navigator.language?.toLowerCase().startsWith("en") ? "en" : "es";
  } catch {
    return "es";
  }
}

/**
 * Elección de voz (masculina/femenina) para /api/speak. Se recuerda
 * entre visitas igual que el idioma de la interfaz — es una preferencia
 * de la persona que usa el navegador, no del caso concreto.
 */
const VOICE_GENDER_STORAGE_KEY = "ego-voice-gender";

function getStoredVoiceGender(): VoiceGender {
  try {
    const v = window.localStorage.getItem(VOICE_GENDER_STORAGE_KEY);
    return v === "f" ? "f" : "m";
  } catch {
    return "m";
  }
}

/**
 * Email de la persona ya suscrita (paywall de la tercera lectura, ver
 * más abajo). Se guarda tras un checkout confirmado o tras verificar
 * "ya soy miembro" — así no hace falta volver a pasar por Stripe en cada
 * visita ni en cada dispositivo donde ya haya iniciado sesión antes.
 */
const MEMBER_EMAIL_STORAGE_KEY = "ego-member-email";

function getStoredMemberEmail(): string | null {
  try {
    const v = window.localStorage.getItem(MEMBER_EMAIL_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function setStoredMemberEmail(email: string) {
  try {
    window.localStorage.setItem(MEMBER_EMAIL_STORAGE_KEY, email);
  } catch {
    // Si falla (modo privado, cuota), la sesión sigue funcionando —
    // solo tendrá que volver a verificar la próxima vez.
  }
}

function ActionItem({ text }: { text: string }) {
  return (
    <li>
      <span className="bullet" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>{text}</span>
    </li>
  );
}

/**
 * Botón de "escuchar" reutilizable: el diagnóstico, la segunda lectura
 * y la tercera lectura son textos distintos que se leen por separado
 * (cada uno con su propio botón), no un único audio con todo — de ahí
 * que `active`/`loading` lleguen ya resueltos por el llamador, no se
 * calculen aquí a partir de un estado global compartido. Visualmente es
 * el botón "Sentir el pulso" de Sala EGO — una píldora con un punto, no
 * un icono circular aislado.
 */
function SpeakButton({
  active,
  loading,
  onClick,
  labelStart,
  labelStop,
  labelLoading,
}: {
  active: boolean;
  loading: boolean;
  onClick: () => void;
  labelStart: string;
  labelStop: string;
  labelLoading: string;
}) {
  return (
    <button
      type="button"
      className="listen"
      onClick={onClick}
      disabled={loading}
      data-playing={active ? "true" : "false"}
      aria-pressed={active}
    >
      <span className="dot" aria-hidden="true" />
      <span>{active ? labelStop : loading ? labelLoading : labelStart}</span>
    </button>
  );
}

export default function EgoApp() {
  const [status, setStatus] = useState<VerdictStatus>("loading");
  const [inputValue, setInputValue] = useState("");
  const [caseMeta, setCaseMeta] = useState<CaseMeta | null>(null);
  const [diagnosis, setDiagnosis] = useState<EgoDiagnosis | null>(null);
  // Id del caso en member_cases, solo cuando /api/audit lo devolvió (el
  // usuario ya era miembro identificado al hacer la consulta) — se
  // reenvía en segunda y tercera lectura para que el historial quede
  // encadenado al mismo caso en vez de crear uno nuevo por vuelta.
  const [caseId, setCaseId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [speakStatus, setSpeakStatus] = useState<SpeakStatus>("idle");
  const [speakError, setSpeakError] = useState<string | null>(null);
  const [speakSource, setSpeakSource] = useState<SpeakSource | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [uiLangOverride, setUiLangOverrideState] = useState<UiLang | null>(null);
  const [homeLangDefault, setHomeLangDefault] = useState<UiLang>("es");
  const [respuestaEspejo, setRespuestaEspejo] = useState("");
  const [segundaLectura, setSegundaLectura] = useState<string | null>(null);
  const [segundaNotaSeguridad, setSegundaNotaSeguridad] = useState<string | null>(null);
  const [segundaLecturaStatus, setSegundaLecturaStatus] = useState<SegundaLecturaStatus>("idle");
  const [segundaLecturaError, setSegundaLecturaError] = useState<string | null>(null);
  const [preguntaFinal, setPreguntaFinal] = useState<string | null>(null);
  const [elapsedSeconds2, setElapsedSeconds2] = useState(0);
  const [respuestaEspejo2, setRespuestaEspejo2] = useState("");
  const [terceraLectura, setTerceraLectura] = useState<string | null>(null);
  const [terceraNotaSeguridad, setTerceraNotaSeguridad] = useState<string | null>(null);
  const [terceraLecturaStatus, setTerceraLecturaStatus] = useState<TerceraLecturaStatus>("idle");
  const [terceraLecturaError, setTerceraLecturaError] = useState<string | null>(null);
  const [elapsedSeconds3, setElapsedSeconds3] = useState(0);
  const [voiceGender, setVoiceGenderState] = useState<VoiceGender>("m");
  // Paywall de la tercera lectura — ver Regla de negocio decidida con el
  // propietario: diagnóstico + segunda lectura son gratis, la tercera
  // lectura (el cierre definitivo) requiere membresía.
  const [memberEmail, setMemberEmail] = useState<string | null>(null);
  const [memberStatus, setMemberStatus] = useState<"unknown" | "checking" | "active" | "none">(
    "unknown"
  );
  const [showPaywall, setShowPaywall] = useState(false);
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<"monthly" | "annual" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [memberEmailInput, setMemberEmailInput] = useState("");
  const [verifyMemberStatus, setVerifyMemberStatus] = useState<"idle" | "checking" | "error">(
    "idle"
  );
  const [postCheckoutNotice, setPostCheckoutNotice] = useState<"success" | "cancelled" | null>(
    null
  );
  // Transición pantalla de inicio ↔ dictamen: ambas secciones están
  // siempre montadas (como en el concepto de Sala EGO) y se cruzan con
  // opacidad/transform — no un cambio de vista seco. El desfase de 260ms
  // / 200ms entre "empieza a salir" y "empieza a entrar" es el mismo del
  // concepto ya confirmado.
  const [homeLeaving, setHomeLeaving] = useState(false);
  const [verdictEntering, setVerdictEntering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingInterval2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingInterval3Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const particleStageRef = useRef<ParticleStageHandle>(null);
  const verdictEnterTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeReturnTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopLoadingTimer = useCallback(() => {
    if (loadingIntervalRef.current) {
      clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    }
  }, []);

  const stopLoadingTimer2 = useCallback(() => {
    if (loadingInterval2Ref.current) {
      clearInterval(loadingInterval2Ref.current);
      loadingInterval2Ref.current = null;
    }
  }, []);

  const stopLoadingTimer3 = useCallback(() => {
    if (loadingInterval3Ref.current) {
      clearInterval(loadingInterval3Ref.current);
      loadingInterval3Ref.current = null;
    }
  }, []);

  // La voz de ElevenLabs sale con poco volumen incluso al máximo del
  // dispositivo (el archivo mp3 en sí trae poca ganancia). El elemento
  // <audio> ya reproduce a su volumen máximo (1.0), así que ahí no hay
  // más margen — el refuerzo real solo se consigue enrutando el audio
  // por la Web Audio API con una ganancia superior a 1.0. Un único
  // AudioContext se reutiliza entre reproducciones (los navegadores
  // limitan cuántos se pueden crear). De paso, el mismo grafo de audio
  // alimenta un AnalyserNode que mueve el cúmulo de partículas al ritmo
  // real de la voz (ver ParticleStage) — un único tap, no dos.
  const AUDIO_GAIN_BOOST = 1.8;

  const boostAudioGain = useCallback((audio: HTMLAudioElement) => {
    try {
      if (typeof window === "undefined" || !window.AudioContext) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = AUDIO_GAIN_BOOST;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(gain).connect(analyser).connect(ctx.destination);
      particleStageRef.current?.attachAnalyser(analyser);
    } catch {
      // Si el navegador bloquea Web Audio, o ya conectó este elemento
      // antes, el audio sigue sonando por la vía normal del <audio>,
      // simplemente sin el refuerzo de volumen ni el cúmulo reaccionando
      // a la voz real (se queda con su movimiento ambiental).
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    particleStageRef.current?.detachAnalyser();
    particleStageRef.current?.pulse(0.1);
    setSpeakStatus("idle");
    setSpeakSource(null);
  }, []);

  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setMicSupported(Boolean(SpeechRecognitionCtor));
    setUiLangOverrideState(getStoredUiLang());
    setHomeLangDefault(getBrowserUiLang());
    setVoiceGenderState(getStoredVoiceGender());
    return () => {
      recognitionRef.current?.abort();
      if (micErrorTimeout.current) clearTimeout(micErrorTimeout.current);
      if (verdictEnterTimeout.current) clearTimeout(verdictEnterTimeout.current);
      if (homeReturnTimeout.current) clearTimeout(homeReturnTimeout.current);
      stopAudio();
      stopLoadingTimer();
      stopLoadingTimer2();
      stopLoadingTimer3();
    };
  }, [stopLoadingTimer, stopLoadingTimer2, stopLoadingTimer3, stopAudio]);

  const verifyMemberEmail = useCallback(async (email: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/subscription-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { active?: boolean };
      return Boolean(res.ok && data.active);
    } catch {
      return false;
    }
  }, []);

  // Arranque de la membresía: 1) si ya había un email guardado de una
  // visita anterior, lo revalida contra el servidor (puede haber
  // cancelado desde entonces); 2) si venimos de un checkout de Stripe
  // recién completado (`?suscripcion=exito&session_id=...`), lo confirma
  // directamente contra la sesión de Stripe — más rápido y sin depender
  // de que el webhook ya haya escrito en la base de datos.
  useEffect(() => {
    const stored = getStoredMemberEmail();
    if (stored) {
      setMemberEmail(stored);
      setMemberStatus("checking");
      void verifyMemberEmail(stored).then((active) => {
        setMemberStatus(active ? "active" : "none");
      });
    }

    const params = new URLSearchParams(window.location.search);
    const suscripcion = params.get("suscripcion");
    if (suscripcion === "exito") {
      const sessionId = params.get("session_id");
      window.history.replaceState({}, "", window.location.pathname);
      if (sessionId) {
        setMemberStatus("checking");
        fetch(`/api/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`)
          .then((res) => res.json())
          .then((data: { active?: boolean; email?: string }) => {
            if (data.active && data.email) {
              setStoredMemberEmail(data.email);
              setMemberEmail(data.email);
              setMemberStatus("active");
              setPostCheckoutNotice("success");
            } else {
              setMemberStatus((s) => (s === "checking" ? "none" : s));
            }
          })
          .catch(() => setMemberStatus((s) => (s === "checking" ? "none" : s)));
      }
    } else if (suscripcion === "cancelada") {
      window.history.replaceState({}, "", window.location.pathname);
      setPostCheckoutNotice("cancelled");
    }
  }, [verifyMemberEmail]);

  // Sincroniza entre pestañas: el checkout se abre en una pestaña nueva
  // (ver handleSubscribe) para no perder el caso a medias en esta — en
  // cuanto esa otra pestaña confirma el pago y escribe el email en
  // localStorage, este efecto lo recoge aquí sin que la persona tenga que
  // volver a hacer nada.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MEMBER_EMAIL_STORAGE_KEY || !e.newValue) return;
      setMemberEmail(e.newValue);
      setMemberStatus("checking");
      void verifyMemberEmail(e.newValue).then((active) => {
        setMemberStatus(active ? "active" : "none");
      });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [verifyMemberEmail]);

  const handleSubscribe = useCallback(
    async (plan: "monthly" | "annual") => {
      setCheckoutError(null);
      setCheckoutLoadingPlan(plan);
      // Se abre la pestaña ANTES del await (no después) porque algunos
      // navegadores solo permiten window.open sin bloqueo de popups
      // cuando ocurre de forma síncrona dentro del gesto de clic — luego
      // se le asigna la URL real en cuanto Stripe la devuelve.
      const tab = window.open("", "_blank");
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, email: memberEmail || undefined }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error || "No se pudo iniciar el pago.");
        }
        if (tab) {
          tab.location.href = data.url;
        } else {
          // El navegador bloqueó la pestaña nueva (o no la soporta) —
          // redirige la actual como último recurso, aunque eso pierda el
          // caso en curso.
          window.location.href = data.url;
        }
      } catch (err) {
        tab?.close();
        setCheckoutError(err instanceof Error ? err.message : "No se pudo iniciar el pago.");
      } finally {
        setCheckoutLoadingPlan(null);
      }
    },
    [memberEmail]
  );

  const handleVerifyMember = useCallback(async () => {
    const email = memberEmailInput.trim();
    if (!email) return;
    setVerifyMemberStatus("checking");
    const active = await verifyMemberEmail(email);
    if (active) {
      setStoredMemberEmail(email);
      setMemberEmail(email);
      setMemberStatus("active");
      setVerifyMemberStatus("idle");
    } else {
      setVerifyMemberStatus("error");
    }
  }, [memberEmailInput, verifyMemberEmail]);

  const setVoiceGender = useCallback((gender: VoiceGender) => {
    setVoiceGenderState(gender);
    try {
      window.localStorage.setItem(VOICE_GENDER_STORAGE_KEY, gender);
    } catch {
      // Igual que con el idioma: si localStorage falla, la elección
      // sigue funcionando para la sesión actual, solo no se recuerda.
    }
  }, []);

  const setUiLang = useCallback((lang: UiLang) => {
    setUiLangOverrideState(lang);
    try {
      window.localStorage.setItem(UI_LANG_STORAGE_KEY, lang);
    } catch {
      // localStorage puede fallar (modo privado, cuota, etc.); el
      // interruptor sigue funcionando para la sesión actual, solo no
      // se recuerda entre visitas.
    }
  }, []);

  const homeLang = uiLangOverride ?? homeLangDefault;

  const runAudit = useCallback(async (value: string) => {
    setStatus("loading");
    setErrorMessage(null);
    setElapsedSeconds(0);
    // Un diagnóstico nuevo (o un reintento) invalida cualquier segunda o
    // tercera lectura que colgara del diagnóstico anterior.
    setRespuestaEspejo("");
    setSegundaLectura(null);
    setSegundaNotaSeguridad(null);
    setSegundaLecturaStatus("idle");
    setSegundaLecturaError(null);
    setPreguntaFinal(null);
    setRespuestaEspejo2("");
    setTerceraLectura(null);
    setTerceraNotaSeguridad(null);
    setTerceraLecturaStatus("idle");
    setTerceraLecturaError(null);
    setSpeakError(null);
    setCaseId(null);
    stopAudio();
    stopLoadingTimer3();
    stopLoadingTimer2();
    stopLoadingTimer();
    loadingIntervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: value,
          ...(memberStatus === "active" && memberEmail ? { email: memberEmail } : {}),
        }),
      });
      const data = (await res.json()) as EgoAuditResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo generar el diagnóstico.");
      }
      setDiagnosis(data as EgoDiagnosis);
      setCaseId(data.case_id ?? null);
      setStatus("success");
      particleStageRef.current?.pulse(0.45);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo generar el diagnóstico.");
      setStatus("error");
    } finally {
      stopLoadingTimer();
    }
  }, [stopLoadingTimer, stopLoadingTimer2, stopLoadingTimer3, stopAudio, memberStatus, memberEmail]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const value = inputValue.trim();
      if (!value) {
        inputRef.current?.focus();
        return;
      }
      const now = new Date();
      const lang = detectUiLang(value);
      setCaseMeta({
        caseId: String(Math.floor(1000 + Math.random() * 9000)),
        time: now.toLocaleTimeString(lang === "en" ? "en-US" : "es-ES", { hour: "2-digit", minute: "2-digit" }),
        quote: value,
      });
      // La pantalla de inicio empieza a salir y el dictamen a entrar con
      // el mismo desfase del concepto de Sala EGO (260ms) — el círculo
      // recibe un pulso y se recoloca al encuadre del dictamen a la vez.
      setHomeLeaving(true);
      particleStageRef.current?.pulse(0.5);
      particleStageRef.current?.setFocusTarget(1);
      if (verdictEnterTimeout.current) clearTimeout(verdictEnterTimeout.current);
      verdictEnterTimeout.current = setTimeout(() => setVerdictEntering(true), 260);
      void runAudit(value);
    },
    [inputValue, runAudit]
  );

  const handleReset = useCallback(() => {
    stopAudio();
    stopLoadingTimer();
    stopLoadingTimer2();
    stopLoadingTimer3();
    setVerdictEntering(false);
    particleStageRef.current?.setFocusTarget(0);
    if (homeReturnTimeout.current) clearTimeout(homeReturnTimeout.current);
    homeReturnTimeout.current = setTimeout(() => setHomeLeaving(false), 200);
    setInputValue("");
    setDiagnosis(null);
    setCaseId(null);
    setCaseMeta(null);
    setErrorMessage(null);
    setRespuestaEspejo("");
    setSegundaLectura(null);
    setSegundaNotaSeguridad(null);
    setSegundaLecturaStatus("idle");
    setSegundaLecturaError(null);
    setPreguntaFinal(null);
    setRespuestaEspejo2("");
    setTerceraLectura(null);
    setTerceraNotaSeguridad(null);
    setTerceraLecturaStatus("idle");
    setTerceraLecturaError(null);
    setSpeakError(null);
    setShowPaywall(false);
    setCheckoutError(null);
    setMemberEmailInput("");
    setVerifyMemberStatus("idle");
  }, [stopLoadingTimer, stopLoadingTimer2, stopLoadingTimer3, stopAudio]);

  const handleRetry = useCallback(() => {
    if (caseMeta) void runAudit(caseMeta.quote);
  }, [caseMeta, runAudit]);

  const handleSegundaLecturaSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const respuesta = respuestaEspejo.trim();
      if (!respuesta || !caseMeta || !diagnosis) return;

      setSegundaLecturaStatus("loading");
      setSegundaLecturaError(null);
      setElapsedSeconds2(0);
      stopLoadingTimer2();
      loadingInterval2Ref.current = setInterval(() => {
        setElapsedSeconds2((s) => s + 1);
      }, 1000);

      try {
        const res = await fetch("/api/segunda-lectura", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: caseMeta.quote,
            sesgo_identificado: diagnosis.sesgo_identificado,
            diagnostico_titulo: diagnosis.diagnostico_titulo,
            cuerpo_diagnostico: diagnosis.cuerpo_diagnostico,
            pregunta_espejo: diagnosis.pregunta_espejo,
            respuesta,
            ...(memberStatus === "active" && memberEmail ? { email: memberEmail } : {}),
            ...(caseId ? { case_id: caseId } : {}),
          }),
        });
        const data = (await res.json()) as EgoSegundaLectura & { error?: string };
        if (!res.ok) {
          throw new Error(data?.error || "No se pudo generar la segunda lectura.");
        }
        setSegundaLectura(data.segunda_lectura);
        if (data.nota_seguridad) {
          setSegundaNotaSeguridad(data.nota_seguridad);
        } else if (data.pregunta_final) {
          setPreguntaFinal(data.pregunta_final);
        }
        setSegundaLecturaStatus("success");
        particleStageRef.current?.pulse(0.4);
      } catch (err) {
        setSegundaLecturaError(
          err instanceof Error ? err.message : "No se pudo generar la segunda lectura."
        );
        setSegundaLecturaStatus("error");
      } finally {
        stopLoadingTimer2();
      }
    },
    [respuestaEspejo, caseMeta, diagnosis, stopLoadingTimer2, memberStatus, memberEmail, caseId]
  );

  // La tercera lectura es la única parte de pago (ver Paywall más abajo):
  // esta función hace la llamada de verdad y no comprueba membresía — la
  // comprobación vive en handleTerceraLecturaSubmit y en el efecto que
  // reintenta automáticamente en cuanto se confirma la suscripción.
  const performTerceraLectura = useCallback(async () => {
    const respuesta2 = respuestaEspejo2.trim();
    if (!respuesta2 || !caseMeta || !diagnosis || !segundaLectura || !preguntaFinal) return;

    setTerceraLecturaStatus("loading");
    setTerceraLecturaError(null);
    setElapsedSeconds3(0);
    stopLoadingTimer3();
    loadingInterval3Ref.current = setInterval(() => {
      setElapsedSeconds3((s) => s + 1);
    }, 1000);

    try {
      const res = await fetch("/api/tercera-lectura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: caseMeta.quote,
          sesgo_identificado: diagnosis.sesgo_identificado,
          diagnostico_titulo: diagnosis.diagnostico_titulo,
          cuerpo_diagnostico: diagnosis.cuerpo_diagnostico,
          pregunta_espejo: diagnosis.pregunta_espejo,
          respuesta: respuestaEspejo,
          segunda_lectura: segundaLectura,
          pregunta_final: preguntaFinal,
          respuesta2,
          // memberStatus ya es "active" en cuanto esta función corre de
          // verdad (ver handleTerceraLecturaSubmit y el efecto de arriba),
          // así que memberEmail siempre debería estar disponible aquí.
          ...(memberEmail ? { email: memberEmail } : {}),
          ...(caseId ? { case_id: caseId } : {}),
        }),
      });
      const data = (await res.json()) as EgoTerceraLectura & { error?: string };
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo generar la tercera lectura.");
      }
      if (data.nota_seguridad) {
        setTerceraNotaSeguridad(data.nota_seguridad);
      } else {
        setTerceraLectura(data.tercera_lectura);
      }
      setTerceraLecturaStatus("success");
      particleStageRef.current?.pulse(0.4);
    } catch (err) {
      setTerceraLecturaError(
        err instanceof Error ? err.message : "No se pudo generar la tercera lectura."
      );
      setTerceraLecturaStatus("error");
    } finally {
      stopLoadingTimer3();
    }
  }, [respuestaEspejo2, respuestaEspejo, caseMeta, diagnosis, segundaLectura, preguntaFinal, stopLoadingTimer3, memberEmail, caseId]);

  // En cuanto la membresía se confirma mientras el paywall está abierto
  // (por la pestaña de checkout, o por "ya soy miembro" más abajo), la
  // tercera lectura pendiente se envía sola — la persona no tiene que
  // acordarse de volver a pulsar el botón.
  useEffect(() => {
    if (memberStatus === "active" && showPaywall) {
      setShowPaywall(false);
      void performTerceraLectura();
    }
  }, [memberStatus, showPaywall, performTerceraLectura]);

  const handleTerceraLecturaSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!respuestaEspejo2.trim()) return;
      if (memberStatus === "active") {
        void performTerceraLectura();
      } else {
        setShowPaywall(true);
      }
    },
    [respuestaEspejo2, memberStatus, performTerceraLectura]
  );

  const toggleSpeak = useCallback(
    async (text: string, source: SpeakSource) => {
      // Un segundo clic sobre el mismo botón, mientras suena o carga,
      // detiene/cancela. Un clic sobre OTRO botón mientras algo ya está
      // sonando corta ese audio y arranca el nuevo, en vez de no hacer
      // nada — antes solo existía un botón, así que no hacía falta esta
      // distinción.
      if (speakStatus === "playing" || speakStatus === "loading") {
        stopAudio();
        if (speakSource === source) return;
      }

      setSpeakSource(source);
      setSpeakStatus("loading");
      setSpeakError(null);
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceGender }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "No se pudo generar el audio.");
        }

        const finishPlayback = (audio: HTMLAudioElement) => {
          audioRef.current = audio;
          audio.onended = () => {
            if (audioUrlRef.current) {
              URL.revokeObjectURL(audioUrlRef.current);
              audioUrlRef.current = null;
            }
            audioRef.current = null;
            particleStageRef.current?.detachAnalyser();
            particleStageRef.current?.settleAfterSpeech();
            setSpeakStatus("idle");
          };
          audio.onerror = () => {
            particleStageRef.current?.detachAnalyser();
            setSpeakStatus("error");
            setSpeakError("No se pudo reproducir el audio.");
          };
        };

        // Reproducción progresiva vía MediaSource cuando el navegador lo
        // soporta para audio/mpeg: el audio empieza a sonar según van
        // llegando los primeros fragmentos del stream, en vez de esperar
        // a que se descargue el audio entero (que es lo que hacía
        // `await res.blob()` antes) — esto es la mitad de "la voz tarda
        // en entrar" que se arregla en el cliente; la otra mitad es el
        // modelo/parámetros más rápidos en /api/speak.
        if (typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg") && res.body) {
          const mediaSource = new MediaSource();
          const url = URL.createObjectURL(mediaSource);
          audioUrlRef.current = url;
          const audio = new Audio(url);
          finishPlayback(audio);
          boostAudioGain(audio);

          const reader = res.body.getReader();
          let sourceOpened = false;
          mediaSource.addEventListener("sourceopen", () => {
            if (sourceOpened) return;
            sourceOpened = true;
            let sourceBuffer: SourceBuffer;
            try {
              sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg");
            } catch {
              // Si el navegador rechaza el SourceBuffer en el último
              // momento, no hay nada que reproducir por esta vía.
              return;
            }
            const pump = () => {
              reader
                .read()
                .then(({ done, value }) => {
                  if (done) {
                    if (mediaSource.readyState === "open") mediaSource.endOfStream();
                    return;
                  }
                  sourceBuffer.appendBuffer(value);
                })
                .catch(() => {
                  // Un fallo de red a mitad de stream deja el audio ya
                  // reproducido tal cual; no lo tratamos como error duro.
                });
            };
            sourceBuffer.addEventListener("updateend", pump);
            pump();
          });

          await audio.play();
          setSpeakStatus("playing");
          return;
        }

        // Fallback (Safari y navegadores sin MediaSource para mp3):
        // el comportamiento anterior, esperar el blob completo.
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        finishPlayback(audio);
        boostAudioGain(audio);
        await audio.play();
        setSpeakStatus("playing");
      } catch (err) {
        setSpeakStatus("error");
        setSpeakError(err instanceof Error ? err.message : "No se pudo generar el audio.");
      }
    },
    [speakStatus, speakSource, stopAudio, voiceGender, boostAudioGain]
  );

  const showMicError = useCallback((message: string) => {
    setMicError(message);
    if (micErrorTimeout.current) clearTimeout(micErrorTimeout.current);
    micErrorTimeout.current = setTimeout(() => setMicError(null), 4000);
  }, []);

  const handleMicToggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setMicSupported(false);
      return;
    }

    setMicError(null);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = homeLang === "en" ? "en-US" : "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // En modo continuo, cada pausa cierra un resultado "final" y abre
      // uno nuevo — hay que recorrer TODOS los resultados desde el
      // principio (no solo desde event.resultIndex) o el texto de las
      // frases anteriores se pierde cada vez que la persona retoma tras
      // una pausa.
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputValue(transcript.slice(0, 1000));
    };

    recognition.onerror = (event) => {
      const tHome = UI_STRINGS[homeLang];
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        showMicError(tHome.micPermission);
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        showMicError(tHome.micGenericError);
      }
    };

    recognition.onend = () => {
      setListening(false);
      inputRef.current?.focus();
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [listening, showMicError, homeLang]);

  const tHome = UI_STRINGS[homeLang];
  const t = caseMeta ? UI_STRINGS[detectUiLang(caseMeta.quote)] : tHome;

  const showResetLink =
    Boolean(diagnosis) &&
    (!diagnosis?.pregunta_espejo ||
      diagnosis?.nota_seguridad ||
      segundaNotaSeguridad ||
      segundaLecturaStatus === "error" ||
      (segundaLectura && !preguntaFinal) ||
      terceraLectura ||
      terceraNotaSeguridad ||
      terceraLecturaStatus === "error");

  return (
    <div className="ego-room">
      <ParticleStage ref={particleStageRef} />
      <div className="hearth-glow" aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />

      <button type="button" className="brandmark" onClick={handleReset} aria-label="EGO — volver al inicio">
        EGO
      </button>

      <div className="lang-toggle" role="group" aria-label="Idioma / language">
        <button type="button" onClick={() => setUiLang("es")} aria-pressed={homeLang === "es"} aria-label="Español">
          ES
        </button>
        <button type="button" onClick={() => setUiLang("en")} aria-pressed={homeLang === "en"} aria-label="English">
          EN
        </button>
      </div>

      <main className="ego-main">
        <section className={"home-screen" + (homeLeaving ? " leaving" : "")}>
          <div className="home-voice-space" aria-hidden="true" />

          {postCheckoutNotice && (
            <p className={"notice-pill " + (postCheckoutNotice === "success" ? "success" : "neutral")}>
              {postCheckoutNotice === "success" ? tHome.postCheckoutSuccess : tHome.postCheckoutCancelled}
            </p>
          )}

          <p className="tagline">{tHome.homeFooterPrivacy}</p>

          <form onSubmit={handleSubmit} className="ask">
            <label htmlFor="ego-hook-input" className="sr-only">
              {tHome.homeInputLabel}
            </label>
            <div className="field">
              <input
                id="ego-hook-input"
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={listening ? tHome.homeListening : tHome.homePlaceholder}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={1000}
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
              />
              {micSupported && (
                <button
                  type="button"
                  className="mic-btn"
                  onClick={handleMicToggle}
                  aria-label={listening ? tHome.micStop : tHome.micStart}
                  aria-pressed={listening}
                >
                  {listening && <span className="mic-ping" aria-hidden="true" />}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ position: "relative" }}>
                    <path
                      d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
            {micError && (
              <p role="status" className="mic-error">
                {micError}
              </p>
            )}
            {/*
              El botón visible se quitó a petición del propietario del
              producto (el buscador ya envía con Enter, como en Google).
              Se deja este mismo botón invisible en vez de borrarlo del
              DOM: mantiene exactamente el mismo alto reservado en el
              layout, así el texto de abajo no sube de sitio, y sigue
              siendo el submit por defecto del formulario. invisible +
              tabIndex=-1 lo sacan del foco y de los lectores de pantalla.
            */}
            <button type="submit" tabIndex={-1} aria-hidden="true" className="primary invisible pointer-events-none select-none">
              Auditar decisión
            </button>
          </form>

          <p className="privacy-note">{tHome.homeFooterAnon}</p>
        </section>

        <section className={"verdict-screen" + (verdictEntering ? " entering" : "")}>
          <div className="voice-space" aria-hidden="true" />

          {caseMeta && (
            <>
              <p className="quote-bubble">{caseMeta.quote}</p>
              <span className="case-tag">
                {t.caseLabel} {caseMeta.caseId} · {caseMeta.time}
              </span>

              {status === "loading" && (
                <div aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--frost)",
                    }}
                  />
                  <span className="shimmer" style={{ fontWeight: 500 }}>
                    {t.loadingPrefix}
                    {elapsedSeconds > 0 ? ` — ${elapsedSeconds}s` : "…"}
                  </span>
                </div>
              )}

              {status === "error" && (
                <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left", maxWidth: "60ch" }}>
                  <p className="error-text">{errorMessage}</p>
                  <button type="button" onClick={handleRetry} className="retry-link">
                    {t.retry}
                  </button>
                </div>
              )}

              {status === "success" && diagnosis && (
                <>
                  <span className="section-label">{diagnosis.sesgo_identificado}</span>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
                    <p className="cuerpo">{diagnosis.cuerpo_diagnostico}</p>

                    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <SpeakButton
                        active={speakStatus === "playing" && speakSource === "diagnosis"}
                        loading={speakStatus === "loading" && speakSource === "diagnosis"}
                        onClick={() => toggleSpeak(diagnosis.cuerpo_diagnostico, "diagnosis")}
                        labelStart={t.speakStart}
                        labelStop={t.speakStop}
                        labelLoading={t.speakLoading}
                      />
                      <div className="pill-toggle" role="group" aria-label={`${t.voiceMale} / ${t.voiceFemale}`}>
                        <button type="button" onClick={() => setVoiceGender("m")} aria-pressed={voiceGender === "m"} aria-label={t.voiceMale} title={t.voiceMale}>
                          M
                        </button>
                        <button type="button" onClick={() => setVoiceGender("f")} aria-pressed={voiceGender === "f"} aria-label={t.voiceFemale} title={t.voiceFemale}>
                          F
                        </button>
                      </div>
                    </div>
                    {speakStatus === "error" && speakSource === "diagnosis" && speakError && (
                      <p className="error-text">{speakError}</p>
                    )}
                  </div>

                  {diagnosis.nota_seguridad && (
                    <div role="alert" className="safety-box">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}>
                        <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                        <path d="M12 9v5M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                      <p>{diagnosis.nota_seguridad}</p>
                    </div>
                  )}

                  <div style={{ width: "100%", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <p className="section-label" style={{ color: "var(--ash)" }}>
                        {t.accionTactica}
                      </p>
                      {diagnosis.prescripcion_fisica && (
                        <span style={{ fontSize: 11, color: "var(--frost)", opacity: 0.85 }}>· {t.incluyeAccionFisica}</span>
                      )}
                    </div>
                    <ol className="action-list">
                      {diagnosis.accion_tactica.map((a, i) => (
                        <ActionItem key={i} text={a} />
                      ))}
                    </ol>
                  </div>

                  {diagnosis.pregunta_espejo && (
                    <div style={{ width: "100%", borderTop: "1px solid var(--line)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                      <p className="section-label" style={{ color: "var(--ash)" }}>
                        {t.antesDeCerrarEsto}
                      </p>
                      <p className="pregunta">{diagnosis.pregunta_espejo}</p>

                      {!segundaLectura && !segundaNotaSeguridad && !diagnosis.nota_seguridad && (
                        <form onSubmit={handleSegundaLecturaSubmit} className="answer-form">
                          <label htmlFor="ego-respuesta-input" className="sr-only">
                            {t.respuestaLabel}
                          </label>
                          <div className="field-row">
                            <input
                              id="ego-respuesta-input"
                              value={respuestaEspejo}
                              onChange={(e) => setRespuestaEspejo(e.target.value)}
                              placeholder={t.respuestaPlaceholder}
                              autoComplete="off"
                              maxLength={500}
                              disabled={segundaLecturaStatus === "loading"}
                            />
                            <button type="submit" disabled={!respuestaEspejo.trim() || segundaLecturaStatus === "loading"}>
                              {t.respuestaSubmit}
                            </button>
                          </div>
                          {segundaLecturaStatus === "loading" && (
                            <span className="shimmer" style={{ fontSize: 13, fontWeight: 500, display: "inline-block", marginTop: 8 }}>
                              {t.respuestaLoading}
                              {elapsedSeconds2 > 0 ? ` — ${elapsedSeconds2}s` : "…"}
                            </span>
                          )}
                          {segundaLecturaStatus === "error" && (
                            <p className="error-text" style={{ marginTop: 8 }}>
                              {segundaLecturaError}
                            </p>
                          )}
                        </form>
                      )}
                    </div>
                  )}

                  {segundaLectura && (
                    <div style={{ width: "100%", borderTop: "1px solid var(--line)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <p className="section-label" style={{ color: "var(--ash)" }}>
                          {t.segundaLecturaLabel}
                        </p>
                        <SpeakButton
                          active={speakStatus === "playing" && speakSource === "segunda"}
                          loading={speakStatus === "loading" && speakSource === "segunda"}
                          onClick={() => toggleSpeak(segundaLectura, "segunda")}
                          labelStart={t.speakStart}
                          labelStop={t.speakStop}
                          labelLoading={t.speakLoading}
                        />
                      </div>
                      <p className="cuerpo">{segundaLectura}</p>
                      {speakStatus === "error" && speakSource === "segunda" && speakError && (
                        <p className="error-text">{speakError}</p>
                      )}

                      {preguntaFinal && (
                        <>
                          <p className="pregunta">{preguntaFinal}</p>

                          {!terceraLectura && !terceraNotaSeguridad && (
                            <form onSubmit={handleTerceraLecturaSubmit} className="answer-form">
                              <label htmlFor="ego-respuesta-input-2" className="sr-only">
                                {t.respuestaLabel}
                              </label>
                              <div className="field-row">
                                <input
                                  id="ego-respuesta-input-2"
                                  value={respuestaEspejo2}
                                  onChange={(e) => setRespuestaEspejo2(e.target.value)}
                                  placeholder={t.respuestaPlaceholder}
                                  autoComplete="off"
                                  maxLength={500}
                                  disabled={terceraLecturaStatus === "loading"}
                                />
                                <button type="submit" disabled={!respuestaEspejo2.trim() || terceraLecturaStatus === "loading"}>
                                  {t.respuestaSubmit}
                                </button>
                              </div>
                              {terceraLecturaStatus === "loading" && (
                                <span className="shimmer" style={{ fontSize: 13, fontWeight: 500, display: "inline-block", marginTop: 8 }}>
                                  {t.respuesta2Loading}
                                  {elapsedSeconds3 > 0 ? ` — ${elapsedSeconds3}s` : "…"}
                                </span>
                              )}
                              {terceraLecturaStatus === "error" && (
                                <p className="error-text" style={{ marginTop: 8 }}>
                                  {terceraLecturaError}
                                </p>
                              )}
                            </form>
                          )}

                          {showPaywall && !terceraLectura && !terceraNotaSeguridad && (
                            <div className="paywall-card">
                              <div>
                                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--paper)" }}>{t.paywallTitle}</p>
                                <p style={{ fontSize: 13.5, color: "var(--ash)", lineHeight: 1.5, marginTop: 4 }}>{t.paywallBody}</p>
                              </div>

                              <div className="paywall-plans">
                                <button type="button" className="plan-btn" onClick={() => void handleSubscribe("monthly")} disabled={checkoutLoadingPlan !== null}>
                                  <span className="plan-name">{t.paywallMonthly}</span>
                                  <span className="plan-price">{t.paywallMonthlyPrice}</span>
                                </button>
                                <button type="button" className="plan-btn featured" onClick={() => void handleSubscribe("annual")} disabled={checkoutLoadingPlan !== null}>
                                  <span className="plan-name">{t.paywallAnnual}</span>
                                  <span className="plan-price">{t.paywallAnnualPrice}</span>
                                  <span className="plan-note">{t.paywallAnnualNote}</span>
                                </button>
                              </div>

                              {checkoutLoadingPlan && <span className="shimmer" style={{ fontSize: 13, fontWeight: 500 }}>{t.paywallOpeningTab}</span>}
                              {!checkoutLoadingPlan && <p style={{ fontSize: 12.5, color: "var(--ash)" }}>{t.paywallNewTabNote}</p>}
                              {checkoutError && <p className="error-text">{checkoutError}</p>}

                              <div className="member-row">
                                <p style={{ fontSize: 13, color: "var(--ash)", marginBottom: 8 }}>{t.paywallAlreadyMember}</p>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <input
                                    type="email"
                                    className="verify-input"
                                    value={memberEmailInput}
                                    onChange={(e) => setMemberEmailInput(e.target.value)}
                                    placeholder={t.paywallEmailPlaceholder}
                                    autoComplete="email"
                                    disabled={verifyMemberStatus === "checking"}
                                  />
                                  <button type="button" className="verify-btn" onClick={() => void handleVerifyMember()} disabled={!memberEmailInput.trim() || verifyMemberStatus === "checking"}>
                                    {verifyMemberStatus === "checking" ? t.paywallVerifying : t.paywallVerify}
                                  </button>
                                </div>
                                {verifyMemberStatus === "error" && <p className="error-text" style={{ marginTop: 8 }}>{t.paywallVerifyError}</p>}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {segundaNotaSeguridad && (
                    <div role="alert" className="safety-box">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}>
                        <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                        <path d="M12 9v5M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                      <p>{segundaNotaSeguridad}</p>
                    </div>
                  )}

                  {terceraLectura && (
                    <div style={{ width: "100%", borderTop: "1px solid var(--line)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <p className="section-label" style={{ color: "var(--ash)" }}>
                          {t.terceraLecturaLabel}
                        </p>
                        <SpeakButton
                          active={speakStatus === "playing" && speakSource === "tercera"}
                          loading={speakStatus === "loading" && speakSource === "tercera"}
                          onClick={() => toggleSpeak(terceraLectura, "tercera")}
                          labelStart={t.speakStart}
                          labelStop={t.speakStop}
                          labelLoading={t.speakLoading}
                        />
                      </div>
                      <p className="cuerpo">{terceraLectura}</p>
                      {speakStatus === "error" && speakSource === "tercera" && speakError && (
                        <p className="error-text">{speakError}</p>
                      )}
                    </div>
                  )}

                  {terceraNotaSeguridad && (
                    <div role="alert" className="safety-box">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: "none", marginTop: 2 }}>
                        <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                        <path d="M12 9v5M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                      <p>{terceraNotaSeguridad}</p>
                    </div>
                  )}

                  {showResetLink && (
                    <button type="button" onClick={handleReset} className="reset-link" style={{ marginTop: 12 }}>
                      {t.newQuery}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </main>

      <p className="legal-links">
        <Link href="/privacidad">Privacidad</Link> · <Link href="/terminos">Términos</Link>
      </p>

      <style jsx>{`
        .ego-room {
          --ink-black: #0b0906;
          --frost: #6fa0d8;
          --frost-dim: #3c5b7d;
          --hearth-rgb: 111, 160, 216;
          --paper: #f2ead9;
          --ash: #8a8072;
          --line: #201a12;
          --warn: #e2a08c;
          --warn-line: rgba(226, 160, 140, 0.35);
          --warn-bg: rgba(226, 160, 140, 0.08);
          --ok: #9bd6ab;
          position: relative;
          min-height: 100vh;
          width: 100%;
          background: var(--ink-black);
          color: var(--paper);
          overflow-x: hidden;
          font-family: "Work Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .hearth-glow {
          position: fixed;
          left: 50%;
          top: 50%;
          width: min(120vw, 900px);
          height: min(120vw, 900px);
          transform: translate(-50%, -50%);
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(circle, rgba(var(--hearth-rgb), 0.16) 0%, rgba(var(--hearth-rgb), 0.06) 35%, rgba(var(--hearth-rgb), 0) 68%);
        }

        .scrim {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background: radial-gradient(ellipse 60% 46% at 50% 40%, rgba(11, 9, 6, 0.6) 0%, rgba(11, 9, 6, 0.3) 55%, rgba(9, 12, 18, 0) 100%);
        }

        .brandmark {
          position: fixed;
          top: max(14px, env(safe-area-inset-top, 0px));
          left: 18px;
          z-index: 5;
          margin: 0;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          font-family: "Work Sans", sans-serif;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.34em;
          text-transform: uppercase;
          color: var(--ash);
          opacity: 0.8;
          transition: color 200ms ease, opacity 200ms ease;
        }
        .brandmark:hover {
          opacity: 1;
          color: var(--paper);
        }

        .lang-toggle {
          position: fixed;
          top: max(14px, env(safe-area-inset-top, 0px));
          right: 18px;
          z-index: 5;
          display: flex;
          align-items: center;
          gap: 2px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 100px;
          padding: 3px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .lang-toggle button {
          padding: 5px 10px;
          border-radius: 100px;
          color: var(--ash);
          background: none;
          border: none;
          cursor: pointer;
          transition: color 160ms ease, background 160ms ease;
        }
        .lang-toggle button[aria-pressed="true"] {
          background: var(--paper);
          color: var(--ink-black);
        }

        .ego-main {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          max-width: 640px;
          margin: 0 auto;
          padding: 64px 20px 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .home-screen {
          width: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 28px;
          transition: opacity 480ms ease, transform 480ms ease, filter 480ms ease;
        }
        .home-screen.leaving {
          position: absolute;
          top: 0;
          left: 0;
          opacity: 0;
          transform: translateY(-14px);
          filter: blur(2px);
          pointer-events: none;
        }

        .home-voice-space {
          width: 100%;
          height: min(30vh, 210px);
        }
        .voice-space {
          width: 100%;
          height: min(49vh, 345px);
        }

        .tagline {
          color: var(--ash);
          font-size: 13px;
          letter-spacing: 0.01em;
          margin: 0;
          max-width: 30ch;
        }

        .ask {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 12px;
        }

        .field {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--line);
          transition: border-color 240ms ease;
        }
        .field:focus-within {
          border-color: var(--frost-dim);
        }
        .field input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          color: var(--paper);
          font-family: "Work Sans", sans-serif;
          font-size: 15px;
          padding: 12px 4px;
          outline: none;
        }
        .field input::placeholder {
          color: var(--ash);
        }
        .field::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: -1px;
          height: 1px;
          background: var(--frost);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 320ms ease;
        }
        .field:focus-within::after {
          transform: scaleX(1);
        }

        .mic-btn {
          position: relative;
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          margin-right: -4px;
          border-radius: 100px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--ash);
        }
        .mic-btn:hover {
          color: var(--paper);
        }
        .mic-btn[aria-pressed="true"] {
          color: #e2827a;
        }
        .mic-ping {
          position: absolute;
          inset: 0;
          border-radius: 100%;
          background: rgba(226, 130, 122, 0.22);
          animation: ego-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes ego-ping {
          75%,
          100% {
            transform: scale(1.9);
            opacity: 0;
          }
        }
        .mic-error {
          color: var(--warn);
          font-size: 12px;
          text-align: center;
          margin-top: -8px;
        }

        button.primary {
          align-self: center;
          margin-top: 8px;
          background: var(--frost);
          color: var(--ink-black);
          border: none;
          border-radius: 100px;
          padding: 13px 30px;
          font-family: "Work Sans", sans-serif;
          font-weight: 600;
          font-size: 14.5px;
          letter-spacing: 0.02em;
          cursor: pointer;
        }

        .privacy-note {
          color: var(--ash);
          font-size: 10.5px;
          max-width: 34ch;
          line-height: 1.5;
          margin-top: 4px;
          opacity: 0.8;
          text-align: center;
        }

        .legal-links {
          position: fixed;
          bottom: 8px;
          left: 0;
          right: 0;
          text-align: center;
          z-index: 4;
          color: var(--ash);
          font-size: 9px;
          letter-spacing: -0.01em;
          opacity: 0.55;
        }
        .legal-links :global(a) {
          color: inherit;
          text-decoration: none;
        }
        .legal-links :global(a:hover) {
          color: var(--paper);
          text-decoration: underline;
        }

        .verdict-screen {
          width: 100%;
          position: absolute;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 20px;
          opacity: 0;
          transform: translateY(16px);
          pointer-events: none;
          transition: opacity 520ms ease 80ms, transform 520ms ease 80ms;
        }
        .verdict-screen.entering {
          position: relative;
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        .section-label {
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--frost);
          opacity: 0.9;
        }
        .case-tag {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10.5px;
          letter-spacing: 0.04em;
          color: var(--ash);
        }

        .quote-bubble {
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid var(--line);
          border-radius: 18px 18px 4px 18px;
          padding: 14px 18px;
          font-size: 15px;
          line-height: 1.55;
          color: var(--paper);
          text-align: left;
          max-width: 90%;
        }

        .cuerpo {
          font-size: 16px;
          line-height: 1.75;
          color: var(--paper);
          max-width: 60ch;
          text-align: left;
        }

        .pregunta {
          font-weight: 400;
          font-size: clamp(15px, 2.1vw, 17px);
          color: var(--paper);
          max-width: 56ch;
          text-align: left;
        }

        :global(button.listen) {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: transparent;
          border: 1px solid var(--line);
          color: var(--paper);
          border-radius: 100px;
          padding: 9px 18px 9px 14px;
          font-family: "Work Sans", sans-serif;
          font-size: 13px;
          cursor: pointer;
          transition: border-color 200ms ease, color 200ms ease;
        }
        :global(button.listen:hover:not(:disabled)) {
          border-color: var(--frost-dim);
        }
        :global(button.listen[data-playing="true"]) {
          color: var(--frost);
          border-color: var(--frost-dim);
        }
        :global(button.listen:disabled) {
          cursor: wait;
          opacity: 0.75;
        }
        :global(button.listen .dot) {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: currentColor;
          flex: none;
        }

        .reset-link {
          color: var(--ash);
          font-size: 12.5px;
          text-decoration: none;
          border-bottom: 1px solid transparent;
          cursor: pointer;
          background: none;
          border-top: none;
          border-left: none;
          border-right: none;
          padding: 0;
          font-family: inherit;
          transition: color 200ms ease, border-color 200ms ease;
        }
        .reset-link:hover {
          color: var(--paper);
          border-color: var(--line);
        }

        .safety-box {
          display: flex;
          gap: 12px;
          text-align: left;
          border: 1px solid var(--warn-line);
          background: var(--warn-bg);
          color: var(--warn);
          border-radius: 14px;
          padding: 14px 16px;
          font-size: 14px;
          line-height: 1.55;
          width: 100%;
        }

        :global(.action-list) {
          display: flex;
          flex-direction: column;
          gap: 10px;
          list-style: none;
          margin: 0;
          padding: 0;
          text-align: left;
        }
        :global(.action-list li) {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          font-size: 15px;
          line-height: 1.55;
          color: var(--paper);
        }
        :global(.action-list .bullet) {
          flex: none;
          width: 22px;
          height: 22px;
          margin-top: 2px;
          border-radius: 50%;
          border: 1px solid var(--frost-dim);
          color: var(--frost);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .answer-form {
          width: 100%;
          max-width: 60ch;
          text-align: left;
        }
        .answer-form .field-row {
          display: flex;
          align-items: flex-end;
          gap: 12px;
          border-bottom: 1px solid var(--line);
          transition: border-color 240ms ease;
        }
        .answer-form .field-row:focus-within {
          border-color: var(--frost-dim);
        }
        .answer-form input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--paper);
          font-size: 15px;
          padding: 10px 2px;
        }
        .answer-form input::placeholder {
          color: var(--ash);
        }
        .answer-form button[type="submit"] {
          color: var(--frost);
          font-size: 13px;
          font-weight: 500;
          background: none;
          border: none;
          padding: 10px 0;
          cursor: pointer;
        }
        .answer-form button[type="submit"]:disabled {
          color: var(--ash);
          cursor: not-allowed;
        }

        .pill-toggle {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 100px;
          padding: 3px;
        }
        .pill-toggle button {
          width: 28px;
          height: 28px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 600;
          background: none;
          border: none;
          color: var(--ash);
          cursor: pointer;
          transition: color 160ms ease, background 160ms ease;
        }
        .pill-toggle button[aria-pressed="true"] {
          background: var(--paper);
          color: var(--ink-black);
        }

        .paywall-card {
          width: 100%;
          max-width: 60ch;
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          text-align: left;
          background: rgba(255, 255, 255, 0.02);
        }
        .paywall-plans {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (min-width: 640px) {
          .paywall-plans {
            flex-direction: row;
          }
        }
        .plan-btn {
          flex: 1;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px 16px;
          text-align: left;
          background: none;
          cursor: pointer;
          transition: border-color 160ms ease;
          color: var(--paper);
          font-family: inherit;
        }
        .plan-btn:hover:not(:disabled) {
          border-color: var(--frost-dim);
        }
        .plan-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .plan-btn.featured {
          border: 2px solid var(--frost);
        }
        .plan-btn .plan-name {
          display: block;
          font-size: 13px;
          color: var(--ash);
        }
        .plan-btn.featured .plan-name {
          color: var(--frost);
          font-weight: 500;
        }
        .plan-btn .plan-price {
          display: block;
          font-size: 17px;
          font-weight: 600;
          color: var(--paper);
          margin-top: 2px;
        }
        .plan-btn .plan-note {
          display: block;
          font-size: 12px;
          color: var(--ash);
          margin-top: 2px;
        }

        .member-row {
          border-top: 1px solid var(--line);
          padding-top: 16px;
        }
        .verify-input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 14px;
          color: var(--paper);
          outline: none;
        }
        .verify-input:focus {
          border-color: var(--frost-dim);
        }
        .verify-input::placeholder {
          color: var(--ash);
        }
        .verify-btn {
          color: var(--frost);
          font-size: 13px;
          font-weight: 500;
          background: none;
          border: none;
          padding: 8px 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .verify-btn:disabled {
          color: var(--ash);
          cursor: not-allowed;
        }

        .notice-pill {
          font-size: 13px;
          border-radius: 100px;
          padding: 8px 16px;
          display: inline-block;
        }
        .notice-pill.success {
          background: rgba(155, 214, 171, 0.12);
          color: var(--ok);
        }
        .notice-pill.neutral {
          background: rgba(255, 255, 255, 0.06);
          color: var(--ash);
        }

        @keyframes ego-shimmer-dark {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        .shimmer {
          background-image: linear-gradient(
            90deg,
            rgba(111, 160, 216, 0.35) 0%,
            rgba(111, 160, 216, 0.35) 35%,
            var(--frost) 50%,
            rgba(111, 160, 216, 0.35) 65%,
            rgba(111, 160, 216, 0.35) 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: ego-shimmer-dark 1.8s linear infinite;
        }

        .error-text {
          color: var(--warn);
          font-size: 14px;
        }
        .retry-link {
          color: var(--frost);
          font-size: 13px;
          font-weight: 500;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .retry-link:hover {
          text-decoration: underline;
        }

        @media (prefers-reduced-motion: reduce) {
          .home-screen,
          .verdict-screen,
          .shimmer {
            transition-duration: 1ms !important;
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
