"use client";

/**
 * El cúmulo de partículas 3D de "Sala EGO" — adaptado directamente del
 * concepto (concept-sala-ego-particulas3d.html), que a su vez adapta la
 * técnica real de "Creating Audio-Reactive Visuals with Dynamic Particles
 * in Three.js" (Codrops): mismo shader (curl noise desplazando una nube de
 * puntos generada a partir de una malla 3D), mismo reparto del audio en
 * tres bandas (low/mid/high) alimentando frequency/amplitude/offsetGain.
 *
 * Solo se porta la combinación ya confirmada y cerrada con José Antonio:
 * esfera, tamaño grande, movimiento "danza", color "Plata Vivo" — el resto
 * de presets del panel de pruebas del concepto (galaxia, tubo, latido,
 * órbita...) no forman parte de la app real y no se portan.
 *
 * Este componente no toca `view`/estado de React para animar — todo el
 * bucle (easing de energía, rotación, escala) vive en un único
 * requestAnimationFrame interno, igual que en el concepto, y se controla
 * desde fuera de forma imperativa (ver ParticleStageHandle) para que un
 * pulso de energía o un cambio de foco no dispare un re-render de EgoApp.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

export interface ParticleBand {
  low: number;
  mid: number;
  high: number;
}

export interface ParticleStageHandle {
  /** Sube la energía de golpe (p. ej. al enviar el formulario) y la deja
   * caer sola a un reposo bajo unos 220ms después — igual que pulse() en
   * el concepto. */
  pulse: (strength: number) => void;
  /** 0 = encuadre de la pantalla de inicio, 1 = encuadre del dictamen.
   * Se interpola solo, con inercia (ver `focus` en updateParticles). */
  setFocusTarget: (target: number) => void;
  /** Al terminar de hablar: deja una energía más alta un par de segundos
   * antes de apagarse, para que la danza se aprecie del todo. */
  settleAfterSpeech: () => void;
  /** Engancha un AnalyserNode ya conectado a la cadena de audio real (ver
   * boostAudioGain en EgoApp) — mientras esté enganchado, la energía y el
   * reparto de bandas vienen del audio de verdad, no de un pulso simulado. */
  attachAnalyser: (analyser: AnalyserNode) => void;
  detachAnalyser: () => void;
}

const VERTEX_SHADER = `
varying float vDistance;
uniform float time;
uniform float offsetSize;
uniform float size;
uniform float offsetGain;
uniform float amplitude;
uniform float frequency;
uniform float maxDistance;
vec3 mod289(vec3 x){ return x-floor(x*(1./289.))*289.; }
vec2 mod289(vec2 x){ return x-floor(x*(1./289.))*289.; }
vec3 permute(vec3 x){ return mod289(((x*34.)+1.)*x); }
float noise(vec2 v) {
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1;
  i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz;
  x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.;
  vec3 h=abs(x)-.5;
  vec3 ox=floor(x+.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}
vec3 curl(float x,float y,float z) {
  float eps=1.,eps2=2.*eps;
  float n1,n2,a,b;
  x+=time*.05; y+=time*.05; z+=time*.05;
  vec3 curl=vec3(0.);
  n1=noise(vec2(x,y+eps)); n2=noise(vec2(x,y-eps)); a=(n1-n2)/eps2;
  n1=noise(vec2(x,z+eps)); n2=noise(vec2(x,z-eps)); b=(n1-n2)/eps2;
  curl.x=a-b;
  n1=noise(vec2(y,z+eps)); n2=noise(vec2(y,z-eps)); a=(n1-n2)/eps2;
  n1=noise(vec2(x+eps,z)); n2=noise(vec2(x+eps,z)); b=(n1-n2)/eps2;
  curl.y=a-b;
  n1=noise(vec2(x+eps,y)); n2=noise(vec2(x-eps,y)); a=(n1-n2)/eps2;
  n1=noise(vec2(y+eps,z)); n2=noise(vec2(y-eps,z)); b=(n1-n2)/eps2;
  curl.z=a-b;
  return curl;
}
void main() {
  vec3 newpos = position;
  vec3 target = position + (normal*.1) + curl(newpos.x * frequency, newpos.y * frequency, newpos.z * frequency) * amplitude;
  float d = length(newpos - target) / maxDistance;
  newpos = mix(position, target, pow(d, 4.));
  newpos.z += sin(time) * (.1 * offsetGain);
  vec4 mvPosition = modelViewMatrix * vec4(newpos, 1.);
  gl_PointSize = size + (pow(d,3.) * offsetSize) * (1./-mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  vDistance = d;
}
`;

const FRAGMENT_SHADER = `
varying float vDistance;
uniform vec3 startColor;
uniform vec3 endColor;
float circle(in vec2 _st,in float _radius){
  vec2 dist=_st-vec2(.5);
  return 1.-smoothstep(_radius-(_radius*.01), _radius+(_radius*.01), dot(dist,dist)*4.);
}
void main(){
  vec2 uv = vec2(gl_PointCoord.x,1.-gl_PointCoord.y);
  vec3 circ = vec3(circle(uv,1.));
  vec3 color = mix(startColor,endColor,vDistance);
  gl_FragColor=vec4(color,circ.r * vDistance);
}
`;

// Plata Vivo — confirmado y cerrado como color final.
const START_COLOR = 0x7c89a8;
const END_COLOR = 0xf8faff;

// Movimiento "danza" — confirmado y cerrado: varias ondas seno
// superpuestas (nunca un único periodo) para que se sienta hipnótico sin
// ser mecánico/repetitivo.
const MOVE = {
  ampBase: 0.85,
  freqBase: 0.65,
  gainBase: 0.32,
  timeMul: 0.85,
  harmonic: {
    amp1Depth: 0.24,
    amp1Speed: 0.55,
    amp2Depth: 0.14,
    amp2Speed: 1.35,
    amp2Phase: 1.1,
    freqDepth: 0.22,
    freqSpeed: 0.1,
    rotYSpeed: 0.012,
    rotYWobbleDepth: 0.5,
    rotYWobbleSpeed: 0.35,
    rotXDepth: 0.32,
    rotXSpeed: 0.22,
    rotZDepth: 0.24,
    rotZSpeed: 0.17,
    rotZPhase: 0.8,
    bobDepth: 0.09,
    bobSpeed: 0.3,
  },
};

// Dos estados de encuadre: presente ya en la pantalla de inicio (el
// círculo es el centro de TODA la app, no solo del dictamen), y grande y
// centrado en la pantalla del dictamen, donde el texto pasa a segundo
// plano. "focus" interpola entre ambos con inercia.
const HOME_Y = 2.15;
const VERDICT_Y = 1.3;
const HOME_SCALE = 0.58;
const VERDICT_SCALE = 1.0;

function readFrequencyBands(analyser: AnalyserNode, freqData: Uint8Array<ArrayBuffer>): ParticleBand {
  analyser.getByteFrequencyData(freqData);
  const sampleRate = analyser.context.sampleRate;
  const bufferLength = freqData.length;
  const lowEnd = Math.floor((150 * bufferLength) / sampleRate);
  const midEnd = Math.floor((9000 * bufferLength) / sampleRate);

  function avg(start: number, end: number) {
    if (end <= start) return 0;
    let sum = 0;
    let n = 0;
    for (let i = start; i <= end && i < bufferLength; i++) {
      sum += freqData[i];
      n++;
    }
    return n ? sum / n / 256 : 0;
  }

  return {
    low: avg(0, lowEnd),
    mid: avg(lowEnd, midEnd),
    high: avg(midEnd, bufferLength - 1),
  };
}

const ParticleStage = forwardRef<ParticleStageHandle>(function ParticleStage(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Estado imperativo puro (fuera de React) — igual que las variables
  // sueltas del concepto: un pulso o un cambio de foco no debe disparar
  // un re-render de EgoApp, solo mover números que el rAF de abajo lee.
  const energyRef = useRef(0);
  const energyTargetRef = useRef(0);
  const focusRef = useRef(0);
  const focusTargetRef = useRef(0);
  const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      pulse(strength: number) {
        energyTargetRef.current = Math.min(1, strength);
        if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = setTimeout(() => {
          energyTargetRef.current = 0.1;
        }, 220);
      },
      setFocusTarget(target: number) {
        focusTargetRef.current = target;
      },
      settleAfterSpeech() {
        if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
        energyTargetRef.current = 0.34;
        settleTimeoutRef.current = setTimeout(() => {
          energyTargetRef.current = 0.1;
        }, 3400);
      },
      attachAnalyser(analyser: AnalyserNode) {
        analyserRef.current = analyser;
        freqDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      },
      detachAnalyser() {
        analyserRef.current = null;
        freqDataRef.current = null;
      },
    }),
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 10.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    function resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", resize);

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        offsetSize: { value: reduceMotion ? 57 : 95 },
        size: { value: 2.7 },
        frequency: { value: 0.85 },
        amplitude: { value: 1.05 },
        offsetGain: { value: 0.3 },
        maxDistance: { value: 1.8 },
        startColor: { value: new THREE.Color(START_COLOR) },
        endColor: { value: new THREE.Color(END_COLOR) },
      },
    });

    const geometry = new THREE.SphereGeometry(1, reduceMotion ? 14 : 30, reduceMotion ? 10 : 22);
    const points = new THREE.Points(geometry, material);
    const holder = new THREE.Object3D();
    holder.add(points);
    holder.rotation.set(0.5, 0.3, 0);
    scene.add(holder);

    let particleTime = 0;
    let uiClock = 0;
    let harmonicSpin = 0;
    let breathEnergy = 0;
    let rafId = 0;

    function updateParticles(en: number, band: ParticleBand | null) {
      uiClock += 0.016;
      const speakAmp = en * 0.22;
      const speakGain = en * 0.25;
      const speakFreq = en * 0.2;
      let amp = MOVE.ampBase + speakAmp;
      let gain = MOVE.gainBase + speakGain;
      let freq = MOVE.freqBase + speakFreq;

      if (band) {
        amp += THREE.MathUtils.mapLinear(band.high, 0, 0.6, -0.05, 0.14);
        gain += band.mid * 0.25;
        freq += band.low * 0.4;
        const speed = THREE.MathUtils.mapLinear(band.low, 0, 1, 0.006, 0.024) * MOVE.timeMul;
        particleTime += THREE.MathUtils.clamp(speed, 0.004, 0.045);
      } else {
        gain = MOVE.gainBase * 0.6 + speakGain;
        particleTime += (0.006 + en * 0.014) * MOVE.timeMul;
      }

      const h = MOVE.harmonic;
      amp +=
        Math.sin(uiClock * h.amp1Speed) * h.amp1Depth +
        Math.sin(uiClock * h.amp2Speed + h.amp2Phase) * h.amp2Depth;
      freq += Math.sin(uiClock * h.freqSpeed) * h.freqDepth;

      material.uniforms.amplitude.value = Math.min(1.12, Math.max(0.05, amp));
      material.uniforms.offsetGain.value = gain;
      material.uniforms.frequency.value = freq;
      material.uniforms.time.value = particleTime;

      harmonicSpin += h.rotYSpeed * (1 + en * 1.2);
      holder.rotation.y = harmonicSpin + Math.sin(uiClock * h.rotYWobbleSpeed) * h.rotYWobbleDepth;
      holder.rotation.x = Math.sin(uiClock * h.rotXSpeed) * h.rotXDepth;
      holder.rotation.z = Math.sin(uiClock * h.rotZSpeed + h.rotZPhase) * h.rotZDepth;
      const bob = Math.sin(uiClock * h.bobSpeed) * h.bobDepth;

      focusRef.current += (focusTargetRef.current - focusRef.current) * 0.05;
      holder.position.y = HOME_Y + (VERDICT_Y - HOME_Y) * focusRef.current + bob;

      breathEnergy += (en - breathEnergy) * 0.045;
      const breathX = 1 + breathEnergy * 0.05;
      const breathY = 1 + breathEnergy * 0.1;
      const baseScale = HOME_SCALE + (VERDICT_SCALE - HOME_SCALE) * focusRef.current;
      holder.scale.set(baseScale * breathX, baseScale * breathY, baseScale * breathX);
    }

    function frame() {
      try {
        let band: ParticleBand | null = null;
        if (analyserRef.current && freqDataRef.current) {
          band = readFrequencyBands(analyserRef.current, freqDataRef.current);
          energyTargetRef.current = Math.min(1, 0.12 + ((band.low + band.mid + band.high) / 3) * 1.3);
        }
        const releasing = energyTargetRef.current < energyRef.current;
        energyRef.current += (energyTargetRef.current - energyRef.current) * (releasing ? 0.018 : 0.06);
        updateParticles(energyRef.current, band);
        renderer.render(scene, camera);
      } catch (err) {
        console.error("[Sala EGO] frame() falló:", err);
      }
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        filter: "brightness(1.12) saturate(1.05) drop-shadow(0 0 9px rgba(214, 226, 255, 0.22))",
      }}
    />
  );
});

export default ParticleStage;
