import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos de uso — EGO",
  description: "Términos y condiciones de uso de EGO, Auditor Cognitivo.",
};

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-white text-[#1b1c1e] font-sans">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link href="/" className="text-sm text-[#4285f4] hover:underline">
          ← Volver a EGO
        </Link>

        <h1 className="mt-8 font-display text-4xl tracking-wide">Términos de uso</h1>
        <p className="mt-2 text-sm text-[#6b6d72]">Última actualización: 30 de agosto de 2026</p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed">
          <section>
            <h2 className="font-medium text-lg mb-2">1. Qué ofrece EGO</h2>
            <p>
              EGO es una herramienta que analiza, mediante inteligencia artificial, la
              descripción que escribes de una decisión que estás a punto de tomar, y te devuelve
              un diagnóstico breve sobre posibles sesgos cognitivos o emocionales presentes en
              ella (aversión a la pérdida, exceso de confianza, sesgo de confirmación, entre
              otros).
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">2. No es asesoramiento profesional</h2>
            <p>
              EGO no ofrece asesoramiento financiero, de inversión, legal, médico ni
              psicológico, y ningún diagnóstico generado por EGO debe interpretarse como una
              recomendación de compra, venta, inversión, o como un diagnóstico clínico. Las
              decisiones que tomes a partir de lo que EGO te devuelve son enteramente tuyas y
              bajo tu responsabilidad. Si necesitas asesoramiento profesional, consulta a un
              profesional cualificado.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">3. Contenido generado por IA</h2>
            <p>
              Los diagnósticos de EGO se generan mediante un modelo de lenguaje (Anthropic
              Claude) siguiendo instrucciones específicas, pero como cualquier sistema de IA
              puede cometer errores, generar interpretaciones incorrectas o no ajustarse
              perfectamente a tu situación real. Úsalo como un punto de partida para
              reflexionar, no como una verdad objetiva incuestionable.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">4. Uso aceptable</h2>
            <p className="mb-2">Al usar EGO, te comprometes a no:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Automatizar peticiones al servicio de forma masiva o abusiva.</li>
              <li>Intentar eludir los límites de uso técnico establecidos.</li>
              <li>Usar el servicio para generar contenido ilegal, dañino o que incumpla la ley aplicable.</li>
              <li>Revender, redistribuir o hacer scraping sistemático del servicio sin autorización.</li>
            </ul>
            <p className="mt-2">
              Nos reservamos el derecho a limitar o suspender el acceso de cualquier uso que
              incumpla estos términos.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">5. Suscripción de pago</h2>
            <p>
              Cuando esté disponible una suscripción de pago, sus condiciones específicas
              (precio, periodicidad, política de cancelación y reembolso) se mostrarán de forma
              clara antes de completar el pago, gestionado a través de Stripe.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">6. Menores de edad</h2>
            <p>
              EGO está destinado a personas mayores de 18 años. Si tienes menos de 18 años, no
              debes usar este servicio.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">7. Aviso de seguridad</h2>
            <p>
              Si el sistema detecta indicios de una situación de crisis personal, EGO puede
              mostrar un aviso sugiriendo que busques apoyo profesional o de personas de
              confianza. Este aviso es orientativo — EGO no es un servicio de emergencia ni de
              intervención en crisis. Si tú o alguien está en peligro inmediato, contacta con los
              servicios de emergencia de tu país.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">8. Limitación de responsabilidad</h2>
            <p>
              EGO se ofrece &ldquo;tal cual&rdquo;, sin garantías de disponibilidad continua ni
              de resultados. En la medida permitida por la ley aplicable, no somos responsables
              de decisiones tomadas a partir del uso del servicio, ni de pérdidas económicas,
              emocionales o de otro tipo derivadas de dichas decisiones.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">9. Cambios en estos términos</h2>
            <p>
              Podemos actualizar estos términos según evolucione el servicio. Los cambios
              relevantes se reflejarán con una nueva fecha de &ldquo;última actualización&rdquo;
              en esta misma página.
            </p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">10. Contacto</h2>
            <p>
              Para cualquier duda sobre estos términos, escribe a{" "}
              <a href="mailto:hola@ego-app.com" className="text-[#4285f4] hover:underline">
                hola@ego-app.com
              </a>
              . Consulta también nuestra{" "}
              <Link href="/privacidad" className="text-[#4285f4] hover:underline">
                política de privacidad
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
