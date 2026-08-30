import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidad — EGO",
  description: "Política de privacidad de EGO, Auditor Cognitivo.",
};

/**
 * Página estática de política de privacidad. Contenido redactado a
 * partir del comportamiento real del código (ver lib/db.ts,
 * lib/rate-limit.ts, app/api/*) — no es una plantilla genérica. No
 * sustituye la revisión de un abogado antes de escalar a mucho
 * tráfico o a mercados con requisitos específicos (por ejemplo RGPD
 * en la UE de forma más exhaustiva, o CCPA en California).
 */
export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-white text-[#1b1c1e] font-sans">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-[#4285f4] hover:underline">
          ← Volver a EGO
        </Link>

        <h1 className="mt-8 font-display text-4xl tracking-wide">Política de privacidad</h1>
        <p className="mt-2 text-sm text-[#6b6d72]">Última actualización: 30 de agosto de 2026</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="font-medium text-lg mb-2">1. Qué es EGO</h2>
            <p>
              EGO es un auditor cognitivo: describes una situación en la que estás a punto de
              tomar una decisión, y EGO te devuelve un diagnóstico breve sobre si esa decisión
              parece guiada por un sesgo emocional (aversión a la pérdida, exceso de confianza,
              ego). No es un servicio de asesoría financiera, psicológica ni médica, y no
              sustituye a un profesional. Si estás atravesando una crisis emocional, EGO puede
              mostrarte un aviso de seguridad, pero no es una línea de ayuda ni un servicio de
              emergencia.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">2. Qué datos recogemos</h2>
            <p className="mb-2">
              <strong>El texto que escribes o dictas.</strong> Cuando describes tu situación, ese
              texto se envía a la API de Anthropic (Claude) para generar el diagnóstico. También
              se guarda en nuestra base de datos para investigación y para mejorar el propio
              producto.
            </p>
            <p className="mb-2">
              &ldquo;Guardado de forma anónima&rdquo; significa que no lo vinculamos a tu nombre,
              email ni a ningún identificador de cuenta — hoy EGO no tiene cuentas de usuario. No
              significa que el contenido sea, por sí mismo, imposible de identificar: si escribes
              detalles muy específicos sobre tu situación, ese texto sigue siendo tuyo en
              sustancia, aunque no esté conectado a tu identidad en nuestra base de datos.
            </p>
            <p className="mb-2">
              Los casos en los que se activa el aviso de seguridad (situaciones de crisis) nunca
              se guardan en esta base de datos de investigación — se descartan siempre.
            </p>
            <p>
              <strong>Audio.</strong> Si usas la opción de escuchar un diagnóstico, ese texto se
              envía a la API de ElevenLabs para generar la voz. No guardamos el audio generado
              una vez enviado a tu navegador.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">3. Terceros que procesan datos por nosotros</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Anthropic</strong> (motor del diagnóstico) —{" "}
                <a
                  href="https://www.anthropic.com/legal/privacy"
                  className="text-[#4285f4] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  política de privacidad
                </a>
              </li>
              <li>
                <strong>ElevenLabs</strong> (voz) —{" "}
                <a
                  href="https://elevenlabs.io/privacy"
                  className="text-[#4285f4] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  política de privacidad
                </a>
              </li>
              <li>
                <strong>Vercel</strong> (alojamiento e infraestructura) —{" "}
                <a
                  href="https://vercel.com/legal/privacy-policy"
                  className="text-[#4285f4] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  política de privacidad
                </a>
              </li>
              <li>
                <strong>Stripe</strong> (pagos, solo si tienes una suscripción activa) —{" "}
                <a
                  href="https://stripe.com/privacy"
                  className="text-[#4285f4] hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  política de privacidad
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">4. Si te suscribes (pago)</h2>
            <p>
              Cuando la suscripción de pago está activa, guardamos tu email y los identificadores
              de cliente/suscripción de Stripe necesarios para gestionar el cobro y para que
              recuperes el acceso si cambias de dispositivo. Estos datos se guardan por
              separado de la base de datos anónima de casos y nunca se cruzan entre sí.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">5. Límite de uso (anti-abuso)</h2>
            <p>
              Para evitar un uso automatizado abusivo, registramos temporalmente tu dirección IP
              junto con un contador de peticiones por hora. Este dato solo se usa para aplicar
              el límite de uso y no se cruza con el contenido de tus consultas.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">6. Tus derechos</h2>
            <p className="mb-2">
              Si eres residente en la Unión Europea, el Espacio Económico Europeo, o en
              cualquier jurisdicción con derechos equivalentes (acceso, rectificación, supresión,
              portabilidad, oposición), puedes ejercerlos escribiendo a{" "}
              <a href="mailto:hola@ego-app.com" className="text-[#4285f4] hover:underline">
                hola@ego-app.com
              </a>
              .
            </p>
            <p>
              Ten en cuenta una limitación real: como el texto de tus consultas no está
              vinculado a tu identidad, no siempre podemos localizar &ldquo;tu&rdquo; caso
              concreto dentro de la base de datos anónima para borrarlo de forma selectiva. Si
              tienes una suscripción de pago, sí podemos localizar y eliminar los datos
              asociados a tu email.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">7. Menores de edad</h2>
            <p>
              EGO está pensado para mayores de 18 años. No recogemos conscientemente datos de
              menores y no está diseñado para su uso por menores de edad.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">8. Contacto</h2>
            <p>
              Para cualquier duda sobre esta política o sobre tus datos, escribe a{" "}
              <a href="mailto:hola@ego-app.com" className="text-[#4285f4] hover:underline">
                hola@ego-app.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
