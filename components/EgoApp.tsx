"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EgoDiagnosis, EgoSegundaLectura, EgoTerceraLectura } from "@/types/ego";

type ViewState = "hook" | "verdict";
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
    speakStart: "Escuchar diagnóstico",
    speakStop: "Detener lectura",
    speakLoading: "Generando audio…",
    homePlaceholder: "¿Qué te ocurre?",
    homeListening: "Te escucho…",
    homeInputLabel: "¿Qué te ocurre?",
    homeFooterPrivacy: "Un espacio privado y objetivo antes de que actúes.",
    homeFooterAnon:
      "Nadie sabe que fuiste tú: lo que escribes se guarda de forma anónima y nos ayuda a mejorar EGO.",
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
  },
  en: {
    caseLabel: "CASE",
    loadingPrefix: "Analyzing your case",
    retry: "Retry",
    newQuery: "← New inquiry",
    accionTactica: "Tactical action",
    incluyeAccionFisica: "includes physical action",
    antesDeCerrarEsto: "Before you close this",
    speakStart: "Listen to diagnosis",
    speakStop: "Stop reading",
    speakLoading: "Generating audio…",
    homePlaceholder: "What's going on?",
    homeListening: "Listening…",
    homeInputLabel: "What's going on?",
    homeFooterPrivacy: "A private, objective space before you act.",
    homeFooterAnon:
      "No one knows it was you: what you write is stored anonymously and helps us improve EGO.",
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

function ActionItem({ text }: { text: string }) {
  return (
    <li className="flex gap-3 items-start text-[15px] leading-[1.55]">
      <span className="flex-none w-[22px] h-[22px] mt-0.5 rounded-full bg-[#eef1f6] text-[#5f6368] flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="pt-0.5">{text}</span>
    </li>
  );
}

/**
 * Botón de "escuchar" reutilizable: el diagnóstico, la segunda lectura
 * y la tercera lectura son textos distintos que se leen por separado
 * (cada uno con su propio botón), no un único audio con todo — de ahí
 * que `active`/`loading` lleguen ya resueltos por el llamador, no se
 * calculen aquí a partir de un estado global compartido.
 */
function SpeakButton({
  active,
  loading,
  onClick,
  labelStart,
  labelStop,
  labelLoading,
  size = 34,
}: {
  active: boolean;
  loading: boolean;
  onClick: () => void;
  labelStart: string;
  labelStop: string;
  labelLoading: string;
  size?: number;
}) {
  const iconSize = size >= 34 ? 17 : 14;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={active ? labelStop : loading ? labelLoading : labelStart}
      aria-pressed={active}
      style={{ width: size, height: size }}
      className={
        "flex-none rounded-full flex items-center justify-center disabled:cursor-wait " +
        (active || loading
          ? "bg-[#eef1f6] text-[#4285f4] animate-pulse"
          : "bg-[#f8f9fb] text-[#1b1c1e] hover:bg-[#eef1f6]")
      }
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M17 8.5c1.6 1.8 1.6 5.2 0 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export default function EgoApp() {
  const [view, setView] = useState<ViewState>("hook");
  const [status, setStatus] = useState<VerdictStatus>("loading");
  const [inputValue, setInputValue] = useState("");
  const [caseMeta, setCaseMeta] = useState<CaseMeta | null>(null);
  const [diagnosis, setDiagnosis] = useState<EgoDiagnosis | null>(null);
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
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micErrorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingInterval2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingInterval3Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

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
      stopAudio();
      stopLoadingTimer();
      stopLoadingTimer2();
      stopLoadingTimer3();
    };
  }, [stopLoadingTimer, stopLoadingTimer2, stopLoadingTimer3, stopAudio]);

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
        body: JSON.stringify({ input: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo generar el diagnóstico.");
      }
      setDiagnosis(data as EgoDiagnosis);
      setStatus("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "No se pudo generar el diagnóstico.");
      setStatus("error");
    } finally {
      stopLoadingTimer();
    }
  }, [stopLoadingTimer, stopLoadingTimer2, stopLoadingTimer3, stopAudio]);

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
      // Corte seco: la pantalla cambia en el mismo tick, sin fade ni easing.
      // El diagnóstico llega después; el frame del dictamen ya está ahí.
      setView("verdict");
      void runAudit(value);
    },
    [inputValue, runAudit]
  );

  const handleReset = useCallback(() => {
    stopAudio();
    stopLoadingTimer();
    stopLoadingTimer2();
    stopLoadingTimer3();
    setView("hook");
    setInputValue("");
    setDiagnosis(null);
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
      } catch (err) {
        setSegundaLecturaError(
          err instanceof Error ? err.message : "No se pudo generar la segunda lectura."
        );
        setSegundaLecturaStatus("error");
      } finally {
        stopLoadingTimer2();
      }
    },
    [respuestaEspejo, caseMeta, diagnosis, stopLoadingTimer2]
  );

  const handleTerceraLecturaSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
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
      } catch (err) {
        setTerceraLecturaError(
          err instanceof Error ? err.message : "No se pudo generar la tercera lectura."
        );
        setTerceraLecturaStatus("error");
      } finally {
        stopLoadingTimer3();
      }
    },
    [respuestaEspejo2, respuestaEspejo, caseMeta, diagnosis, segundaLectura, preguntaFinal, stopLoadingTimer3]
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
            setSpeakStatus("idle");
          };
          audio.onerror = () => {
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
        await audio.play();
        setSpeakStatus("playing");
      } catch (err) {
        setSpeakStatus("error");
        setSpeakError(err instanceof Error ? err.message : "No se pudo generar el audio.");
      }
    },
    [speakStatus, speakSource, stopAudio, voiceGender]
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
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
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

  if (view === "verdict" && caseMeta) {
    const t = UI_STRINGS[detectUiLang(caseMeta.quote)];
    return (
      <div className="min-h-screen w-full flex flex-col bg-white text-[#1b1c1e] font-sans">
        <header className="flex items-center px-6 sm:px-10 py-5">
          <button
            type="button"
            onClick={handleReset}
            className="font-sans text-2xl font-normal tracking-[-0.5px] select-none"
            aria-label="EGO — volver al inicio"
          >
            <span className="text-g-red">E</span>
            <span className="text-g-blue">G</span>
            <span className="text-g-yellow">O</span>
          </button>
        </header>

        <main className="flex-1 w-full max-w-2xl mx-auto px-5 sm:px-6 pb-28 flex flex-col gap-6">
          <div>
            <div className="flex justify-end">
              <p className="bg-[#eef1f6] rounded-[20px_20px_4px_20px] px-[18px] py-3 max-w-[86%] text-[15.5px] leading-relaxed">
                {caseMeta.quote}
              </p>
            </div>
            <div className="flex justify-end mt-2">
              <span className="font-mono text-[11px] tracking-[0.5px] text-[#5f6368]">
                {t.caseLabel} {caseMeta.caseId} · {caseMeta.time}
              </span>
            </div>
          </div>

          {status === "loading" && (
            <div aria-live="polite" className="flex items-center gap-3 text-[15px] py-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#4285f4] animate-pulse" />
              <span className="ego-shimmer-text font-medium tabular-nums">
                {t.loadingPrefix}
                {elapsedSeconds > 0 ? ` — ${elapsedSeconds}s` : "…"}
              </span>
            </div>
          )}

          {status === "error" && (
            <div role="alert" className="flex flex-col gap-3 py-2">
              <p className="text-[15px] text-[#5f6368] leading-relaxed max-w-[62ch]">{errorMessage}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="self-start text-[#1a73e8] text-sm font-medium hover:underline"
              >
                {t.retry}
              </button>
            </div>
          )}

          {status === "success" && diagnosis && (
            <>
              <span className="inline-flex items-center gap-1.5 self-start bg-[#fef7e0] text-[#7a5b00] rounded-full px-3 py-1.5 text-[12.5px] font-medium">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 2 3 7v6c0 5 4 8.5 9 9 5-.5 9-4 9-9V7l-9-5Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                {diagnosis.sesgo_identificado}
              </span>

              <div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <SpeakButton
                      active={speakStatus === "playing" && speakSource === "diagnosis"}
                      loading={speakStatus === "loading" && speakSource === "diagnosis"}
                      onClick={() =>
                        toggleSpeak(
                          `${diagnosis.diagnostico_titulo}. ${diagnosis.cuerpo_diagnostico}`,
                          "diagnosis"
                        )
                      }
                      labelStart={t.speakStart}
                      labelStop={t.speakStop}
                      labelLoading={t.speakLoading}
                    />
                  </div>
                  <div
                    className="flex-none mt-0.5 flex items-center gap-0.5 bg-[#f1f3f4] rounded-full p-0.5 h-[34px]"
                    role="group"
                    aria-label={`${t.voiceMale} / ${t.voiceFemale}`}
                  >
                    <button
                      type="button"
                      onClick={() => setVoiceGender("m")}
                      aria-pressed={voiceGender === "m"}
                      aria-label={t.voiceMale}
                      title={t.voiceMale}
                      className={
                        "w-[26px] h-[26px] rounded-full text-[11px] font-semibold transition-colors " +
                        (voiceGender === "m"
                          ? "bg-white text-[#1b1c1e] shadow-sm"
                          : "text-[#5f6368] hover:text-[#1b1c1e]")
                      }
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoiceGender("f")}
                      aria-pressed={voiceGender === "f"}
                      aria-label={t.voiceFemale}
                      title={t.voiceFemale}
                      className={
                        "w-[26px] h-[26px] rounded-full text-[11px] font-semibold transition-colors " +
                        (voiceGender === "f"
                          ? "bg-white text-[#1b1c1e] shadow-sm"
                          : "text-[#5f6368] hover:text-[#1b1c1e]")
                      }
                    >
                      F
                    </button>
                  </div>
                  <h2 className="text-[clamp(24px,6vw,32px)] font-semibold leading-tight text-balance pt-1">
                    {diagnosis.diagnostico_titulo}
                  </h2>
                </div>
                <p className="text-[16px] leading-[1.75] text-[#1b1c1e] max-w-[64ch] mt-3.5">
                  {diagnosis.cuerpo_diagnostico}
                </p>
                {speakStatus === "error" && speakSource === "diagnosis" && speakError && (
                  <p className="text-[#d93025] text-[13px] mt-2">{speakError}</p>
                )}
              </div>

              {diagnosis.nota_seguridad && (
                <div
                  role="alert"
                  className="flex gap-3 bg-[#fce8e6] border border-[#c5221f]/25 text-[#8c1d18] rounded-xl px-4 py-3.5 text-[14px] leading-[1.55]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-none mt-0.5">
                    <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M12 9v5M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <p>{diagnosis.nota_seguridad}</p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <p className="text-[12.5px] font-semibold tracking-[0.4px] uppercase text-[#5f6368]">
                    {t.accionTactica}
                  </p>
                  {diagnosis.prescripcion_fisica && (
                    <span className="bg-[#e6f4ea] text-[#1e7d37] text-[11px] font-medium rounded-full px-2 py-0.5">
                      {t.incluyeAccionFisica}
                    </span>
                  )}
                </div>
                <ol className="flex flex-col gap-2.5 list-none">
                  {diagnosis.accion_tactica.map((a, i) => (
                    <ActionItem key={i} text={a} />
                  ))}
                </ol>
              </div>

              {diagnosis.pregunta_espejo && (
                <div className="border-t border-[#e8eaed] pt-5">
                  <p className="text-[12.5px] font-semibold tracking-[0.4px] uppercase text-[#5f6368] mb-2">
                    {t.antesDeCerrarEsto}
                  </p>
                  <p className="text-[17px] leading-[1.6] italic text-[#1b1c1e] max-w-[60ch]">
                    {diagnosis.pregunta_espejo}
                  </p>

                  {!segundaLectura && !segundaNotaSeguridad && !diagnosis.nota_seguridad && (
                    <form onSubmit={handleSegundaLecturaSubmit} className="mt-4 max-w-[60ch]">
                      <label htmlFor="ego-respuesta-input" className="sr-only">
                        {t.respuestaLabel}
                      </label>
                      <div className="flex items-end gap-3 border-b border-[#dfe1e5] focus-within:border-[#1a73e8] transition-colors">
                        <input
                          id="ego-respuesta-input"
                          value={respuestaEspejo}
                          onChange={(e) => setRespuestaEspejo(e.target.value)}
                          placeholder={t.respuestaPlaceholder}
                          autoComplete="off"
                          maxLength={500}
                          disabled={segundaLecturaStatus === "loading"}
                          className="flex-1 min-w-0 outline-none bg-transparent text-[15px] text-[#1b1c1e] placeholder:text-[#9aa0a6] py-2"
                        />
                        <button
                          type="submit"
                          disabled={!respuestaEspejo.trim() || segundaLecturaStatus === "loading"}
                          className="text-[#1a73e8] text-[13px] font-medium py-2 disabled:text-[#c7cad1] disabled:cursor-not-allowed hover:underline"
                        >
                          {t.respuestaSubmit}
                        </button>
                      </div>
                      {segundaLecturaStatus === "loading" && (
                        <span className="ego-shimmer-text text-[13px] font-medium tabular-nums inline-block mt-2">
                          {t.respuestaLoading}
                          {elapsedSeconds2 > 0 ? ` — ${elapsedSeconds2}s` : "…"}
                        </span>
                      )}
                      {segundaLecturaStatus === "error" && (
                        <p className="text-[#d93025] text-[13px] mt-2">{segundaLecturaError}</p>
                      )}
                    </form>
                  )}
                </div>
              )}

              {segundaLectura && (
                <div className="border-t border-[#e8eaed] pt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[12.5px] font-semibold tracking-[0.4px] uppercase text-[#5f6368]">
                      {t.segundaLecturaLabel}
                    </p>
                    <SpeakButton
                      size={26}
                      active={speakStatus === "playing" && speakSource === "segunda"}
                      loading={speakStatus === "loading" && speakSource === "segunda"}
                      onClick={() => toggleSpeak(segundaLectura, "segunda")}
                      labelStart={t.speakStart}
                      labelStop={t.speakStop}
                      labelLoading={t.speakLoading}
                    />
                  </div>
                  <p className="text-[16px] leading-[1.7] text-[#1b1c1e] max-w-[60ch]">{segundaLectura}</p>
                  {speakStatus === "error" && speakSource === "segunda" && speakError && (
                    <p className="text-[#d93025] text-[13px] mt-2">{speakError}</p>
                  )}

                  {preguntaFinal && (
                    <>
                      <p className="text-[17px] leading-[1.6] italic text-[#1b1c1e] max-w-[60ch] mt-4">
                        {preguntaFinal}
                      </p>

                      {!terceraLectura && !terceraNotaSeguridad && (
                        <form onSubmit={handleTerceraLecturaSubmit} className="mt-4 max-w-[60ch]">
                          <label htmlFor="ego-respuesta-input-2" className="sr-only">
                            {t.respuestaLabel}
                          </label>
                          <div className="flex items-end gap-3 border-b border-[#dfe1e5] focus-within:border-[#1a73e8] transition-colors">
                            <input
                              id="ego-respuesta-input-2"
                              value={respuestaEspejo2}
                              onChange={(e) => setRespuestaEspejo2(e.target.value)}
                              placeholder={t.respuestaPlaceholder}
                              autoComplete="off"
                              maxLength={500}
                              disabled={terceraLecturaStatus === "loading"}
                              className="flex-1 min-w-0 outline-none bg-transparent text-[15px] text-[#1b1c1e] placeholder:text-[#9aa0a6] py-2"
                            />
                            <button
                              type="submit"
                              disabled={!respuestaEspejo2.trim() || terceraLecturaStatus === "loading"}
                              className="text-[#1a73e8] text-[13px] font-medium py-2 disabled:text-[#c7cad1] disabled:cursor-not-allowed hover:underline"
                            >
                              {t.respuestaSubmit}
                            </button>
                          </div>
                          {terceraLecturaStatus === "loading" && (
                            <span className="ego-shimmer-text text-[13px] font-medium tabular-nums inline-block mt-2">
                              {t.respuesta2Loading}
                              {elapsedSeconds3 > 0 ? ` — ${elapsedSeconds3}s` : "…"}
                            </span>
                          )}
                          {terceraLecturaStatus === "error" && (
                            <p className="text-[#d93025] text-[13px] mt-2">{terceraLecturaError}</p>
                          )}
                        </form>
                      )}
                    </>
                  )}
                </div>
              )}

              {segundaNotaSeguridad && (
                <div
                  role="alert"
                  className="flex gap-3 bg-[#fce8e6] border border-[#c5221f]/25 text-[#8c1d18] rounded-xl px-4 py-3.5 text-[14px] leading-[1.55]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-none mt-0.5">
                    <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M12 9v5M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <p>{segundaNotaSeguridad}</p>
                </div>
              )}

              {terceraLectura && (
                <div className="border-t border-[#e8eaed] pt-5">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[12.5px] font-semibold tracking-[0.4px] uppercase text-[#5f6368]">
                      {t.terceraLecturaLabel}
                    </p>
                    <SpeakButton
                      size={26}
                      active={speakStatus === "playing" && speakSource === "tercera"}
                      loading={speakStatus === "loading" && speakSource === "tercera"}
                      onClick={() => toggleSpeak(terceraLectura, "tercera")}
                      labelStart={t.speakStart}
                      labelStop={t.speakStop}
                      labelLoading={t.speakLoading}
                    />
                  </div>
                  <p className="text-[16px] leading-[1.7] text-[#1b1c1e] max-w-[60ch]">{terceraLectura}</p>
                  {speakStatus === "error" && speakSource === "tercera" && speakError && (
                    <p className="text-[#d93025] text-[13px] mt-2">{speakError}</p>
                  )}
                </div>
              )}

              {terceraNotaSeguridad && (
                <div
                  role="alert"
                  className="flex gap-3 bg-[#fce8e6] border border-[#c5221f]/25 text-[#8c1d18] rounded-xl px-4 py-3.5 text-[14px] leading-[1.55]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="flex-none mt-0.5">
                    <path d="M12 3 2 20h20L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M12 9v5M12 17.2v.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  <p>{terceraNotaSeguridad}</p>
                </div>
              )}

              {(!diagnosis.pregunta_espejo ||
                diagnosis.nota_seguridad ||
                segundaNotaSeguridad ||
                segundaLecturaStatus === "error" ||
                (segundaLectura && !preguntaFinal) ||
                terceraLectura ||
                terceraNotaSeguridad ||
                terceraLecturaStatus === "error") && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="self-start text-[#9aa0a6] text-[13px] hover:text-[#5f6368] hover:underline mt-8"
                >
                  {t.newQuery}
                </button>
              )}
            </>
          )}
        </main>
      </div>
    );
  }

  const tHome = UI_STRINGS[homeLang];

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white px-6 relative">
      <div className="absolute top-5 right-5 sm:top-6 sm:right-8 flex items-center gap-0.5 bg-[#f1f3f4] rounded-full p-0.5 text-[11px] font-semibold tracking-wide">
        <button
          type="button"
          onClick={() => setUiLang("es")}
          aria-pressed={homeLang === "es"}
          aria-label="Español"
          className={
            "px-2.5 py-1 rounded-full transition-colors " +
            (homeLang === "es" ? "bg-white text-[#1b1c1e] shadow-sm" : "text-[#5f6368] hover:text-[#1b1c1e]")
          }
        >
          ES
        </button>
        <button
          type="button"
          onClick={() => setUiLang("en")}
          aria-pressed={homeLang === "en"}
          aria-label="English"
          className={
            "px-2.5 py-1 rounded-full transition-colors " +
            (homeLang === "en" ? "bg-white text-[#1b1c1e] shadow-sm" : "text-[#5f6368] hover:text-[#1b1c1e]")
          }
        >
          EN
        </button>
      </div>
      <main className="w-full max-w-xl flex flex-col items-center gap-7 -mt-[8vh]">
        <h1 className="font-sans text-[56px] sm:text-[90px] font-normal tracking-[-1px] leading-none select-none">
          <span className="text-g-red">E</span>
          <span className="text-g-blue">G</span>
          <span className="text-g-yellow">O</span>
        </h1>

        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center gap-6">
          <label htmlFor="ego-hook-input" className="sr-only">
            {tHome.homeInputLabel}
          </label>
          <div className="w-full flex items-center gap-3 bg-white border border-[#dfe1e5] rounded-full px-5 py-3 shadow-[0_1px_6px_rgba(32,33,36,0.18)] focus-within:shadow-[0_1px_8px_rgba(32,33,36,0.32)] focus-within:border-transparent transition-shadow">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-[#5f6368] shrink-0"
            >
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <line
                x1="16.6"
                y1="16.6"
                x2="21"
                y2="21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
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
              className="flex-1 min-w-0 outline-none focus:outline-none focus-visible:outline-none appearance-none text-[17px] text-[#202124] placeholder:text-[#5f6368] bg-transparent"
            />
            {micSupported && (
              <button
                type="button"
                onClick={handleMicToggle}
                aria-label={listening ? tHome.micStop : tHome.micStart}
                aria-pressed={listening}
                className="relative shrink-0 flex items-center justify-center w-7 h-7 -mr-1 rounded-full"
              >
                {listening && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[#ea4335]/20 animate-ping"
                  />
                )}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className={listening ? "text-[#ea4335] relative" : "text-[#5f6368] hover:text-[#202124] relative"}
                >
                  <path
                    d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 11a7 7 0 0 1-14 0"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="12"
                    y1="19"
                    x2="12"
                    y2="22"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
          {micError && (
            <p role="status" className="text-[#d93025] text-xs text-center -mt-3">
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
          <button
            type="submit"
            tabIndex={-1}
            aria-hidden="true"
            className="invisible pointer-events-none select-none bg-[#f8f9fa] border border-[#f8f9fa] rounded text-[#1a73e8] text-sm px-5 py-2.5"
          >
            Auditar decisión
          </button>
        </form>

        <div className="flex flex-col items-center gap-1.5">
          <p className="text-[#5f6368] text-[13px] text-center max-w-[380px]">
            {tHome.homeFooterPrivacy}
          </p>
          <p className="text-[#9aa0a6] text-[11px] text-center max-w-[300px]">
            {tHome.homeFooterAnon}
          </p>
        </div>
      </main>
    </div>
  );
}
