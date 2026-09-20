# EGO — Auditor Cognitivo

Web de producción de EGO: la pantalla-gancho (estilo Google, EGO en mayúsculas —
E roja, G azul, O amarilla, Poppins Regular) y el corte seco al dictamen
monocromático, conectada de verdad a Claude a través del system prompt de
`lib/ego-system-prompt.md`.

## Arquitectura

- **Next.js 15 (App Router) + TypeScript + Tailwind.** Se eligió porque
  comparte React con lo que hará falta más adelante para la app nativa
  (React Native / Expo puede reutilizar la lógica de `types/ego.ts` y el
  contrato de `/api/audit` tal cual), y porque Vercel lo despliega sin
  configuración.
- **`app/api/audit/route.ts`** — único punto que habla con Anthropic. Usa
  *tool calling* forzado (`tool_choice`) para que Claude devuelva siempre el
  JSON exacto de `types/ego.ts`, no texto libre que haya que parsear.
- **`lib/ego-system-prompt.md`** — fuente única de verdad del system prompt.
  Se edita ahí, no en el código. `lib/system-prompt.ts` lo lee en cada
  arranque del servidor y lo cachea en memoria.
- **`components/EgoApp.tsx`** — las dos pantallas. El corte de Pantalla 1 a
  Pantalla 2 ocurre en el mismo tick de React (sin fade); el diagnóstico
  real llega después de forma asíncrona mientras la Pantalla 2 ya muestra
  "PROCESANDO CASO".
- **`lib/db.ts`** — guarda cada diagnóstico de forma anónima en Postgres
  (ver "Base de datos de casos anónimos" más abajo).

## Base de datos de casos anónimos

Cada auditoría exitosa se guarda en la tabla `cases` (creada sola, en el
primer uso, por `lib/db.ts`): idioma, el texto que escribió el usuario, y
los campos del diagnóstico. No hay cuentas hoy, así que no hay ningún
identificador de usuario que guardar o desvincular.

Dos reglas explícitas, decididas con el propietario del producto — no las
cambies sin volver a hablarlo:

- **Los casos de crisis nunca se guardan aquí.** Si `nota_seguridad` viene
  rellena (se activó la Regla 6 del system prompt), `saveAnonymizedCase`
  lo descarta sin insertarlo. Es el contenido más sensible que puede
  generar EGO.
- **"Anónimo" significa "no vinculado a una cuenta", no "imposible de
  identificar".** El texto libre que escribe alguien puede contener
  nombres, cifras o detalles que lo identifiquen igualmente. Antes de
  usar esta base de datos para algo más que aprender internamente (un
  estudio publicado, compartir con terceros, etc.) hace falta revisar
  esto con un abogado — ver el aviso de privacidad y protección de datos
  más abajo.

El aviso al usuario (ya visible en la home, letra pequeña a propósito
para no robarle protagonismo a la portada) es parte de este mismo
cambio — no lo quites sin quitar también el guardado.

Para desplegar esto hace falta vincular una base de datos Postgres al
proyecto de Vercel: Storage → Create Database → Postgres. Vercel inyecta
`POSTGRES_URL` solo; no hay que tocar código.

## Cobro (Stripe) — construido, solo falta la cuenta real

Decisión de negocio (con el propietario del producto): el diagnóstico y la
segunda lectura son gratis; la tercera lectura (el cierre definitivo de la
auditoría) es solo para miembros. `EgoApp.tsx` ya tiene el paywall completo
delante de la tercera lectura — lo único que falta para que cobre de verdad
es la cuenta real de Stripe y sus variables de entorno. Sin ellas,
`/api/checkout` y `/api/webhook/stripe` responden que el cobro no está
activado, y el paywall se lo dice a la persona en vez de fallar en
silencio; el resto de la web sigue funcionando exactamente igual que hoy.

**Planes:** mensual (marcador de posición: 3 $/mes) y anual (marcador de
posición: 12 $/año — la propia pantalla lo presenta como "equivale a
1 $/mes" para que el ahorro frente al mensual se entienda de un vistazo).
Son precios de ejemplo fáciles de cambiar: los textos están en
`UI_STRINGS` (`paywallMonthlyPrice` / `paywallAnnualPrice` en
`components/EgoApp.tsx`) y el precio real que de verdad se cobra lo define
cada Price en el panel de Stripe (paso 2 más abajo) — ajusta ambos sitios
a la vez.

**Lo que hay:**

- **`lib/stripe.ts`** — cliente de Stripe. Se crea de forma perezosa (no
  al arrancar el servidor) para que la ausencia de `STRIPE_SECRET_KEY` no
  rompa el build ni el resto de la app.
- **`app/api/checkout/route.ts`** — crea una sesión de Stripe Checkout
  para el plan que se le pida (`{ plan: "monthly" | "annual" }`) y
  devuelve su URL. El navegador del cliente se redirige ahí (en una
  pestaña nueva, para no perder el caso en curso); el email y la tarjeta
  los pide y los ve Stripe, nunca pasan por nuestro servidor.
- **`app/api/checkout/confirm/route.ts`** — al volver de Stripe con éxito
  (`?suscripcion=exito&session_id=...`), confirma el pago leyendo
  directamente la sesión de Stripe (no la base de datos, para no
  depender de que el webhook ya haya escrito) y devuelve el email para
  guardarlo en el navegador.
- **`app/api/subscription-status/route.ts`** — "¿ya eres miembro?": dado
  un email, comprueba `isEmailSubscribed` en la base de datos. Lo usa
  tanto la verificación manual del paywall como la revalidación al
  arrancar la app si ya había un email guardado de una visita anterior.
- **`app/api/webhook/stripe/route.ts`** — mantiene la tabla `subscribers`
  al día según lo que pasa de verdad en Stripe: alta (`checkout.session.completed`),
  renovación fallida o baja (`customer.subscription.updated` /
  `.deleted`).
- **`lib/db.ts`** — tabla `subscribers` (email, ids de Stripe, plan,
  estado). Es una tabla aparte de `cases` a propósito: `subscribers` sí
  identifica a la persona (hace falta para cobrarle), `cases` es y sigue
  siendo anónima. No mezclar nunca las dos.
- **Paywall en `EgoApp.tsx`** — aparece cuando alguien responde a la
  pregunta de cierre de la segunda lectura sin ser miembro todavía:
  ofrece los dos planes, y un campo "¿ya eres miembro?" para verificar un
  email sin volver a pasar por Stripe (por ejemplo, desde otro
  dispositivo). El email de la persona se guarda en `localStorage`
  (`ego-member-email`) y se sincroniza entre pestañas, así que en cuanto
  la pestaña de pago confirma la suscripción, la pestaña original
  continúa sola con la tercera lectura pendiente.

**Pasos para activarlo, el día que crees la cuenta de Stripe:**

1. Crea la cuenta en https://dashboard.stripe.com y completa el perfil de
   negocio (esto sí tienes que hacerlo tú — no puedo crear cuentas ni
   introducir tus datos bancarios/fiscales por ti).
2. Product catalog → crea un producto (p. ej. "EGO — plan mensual") con
   un Price recurrente mensual, y otro producto/Price para el anual.
   Copia los IDs (`price_...`) en `STRIPE_PRICE_ID_MONTHLY` y
   `STRIPE_PRICE_ID_ANNUAL` — puedes activar solo uno de los dos si de
   momento no quieres ofrecer ambos planes.
3. Developers → API keys → copia la Secret key (`sk_...`) en
   `STRIPE_SECRET_KEY`.
4. Developers → Webhooks → Add endpoint, con URL
   `https://tu-dominio/api/webhook/stripe` y estos eventos:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copia el Signing secret (`whsec_...`)
   en `STRIPE_WEBHOOK_SECRET`.
5. Añade las variables en Vercel (Settings → Environment Variables) y
   vuelve a desplegar.
6. Prueba con una tarjeta de test de Stripe (`4242 4242 4242 4242`) antes
   de anunciarlo — Stripe tiene modo test y modo live separados por
   completo, con sus propias keys.
7. Actualiza el precio mostrado en `UI_STRINGS` (paso "Planes" arriba) si
   los marcadores de posición no coinciden ya con lo que configuraste en
   Stripe.

Nada de esto bloquea lo que ya funciona hoy: sin las variables, el
paywall sigue apareciendo (para que puedas ver cómo queda) pero el botón
de suscribirse muestra el aviso de que el cobro no está activado todavía,
en vez de romper nada.

## Puesta en marcha local

```bash
npm install
cp .env.example .env.local
# rellena ANTHROPIC_API_KEY y ANTHROPIC_MODEL en .env.local
npm run dev
```

Abre http://localhost:3000.

### Conseguir la API key de Anthropic

1. Entra en https://console.anthropic.com y crea una cuenta (o usa la que
   ya tengas).
2. Activa facturación (Settings → Billing) — la API es de pago por uso,
   no hay capa gratuita indefinida.
3. Crea una key en Settings → API Keys y pégala en `ANTHROPIC_API_KEY`.
4. Copia el ID del modelo que quieras usar (Settings → Models, o la
   documentación de modelos) en `ANTHROPIC_MODEL`. No lo dejamos fijado
   en el código a propósito: los IDs de modelo cambian con el tiempo y
   preferimos que falle de forma explícita a que uses uno desactualizado
   sin darte cuenta.

## Desplegar en Vercel (recomendado, cero configuración para Next.js)

1. Sube este proyecto a un repositorio de GitHub (privado si es un
   producto que vas a vender).
2. En https://vercel.com, "Add New… → Project" e importa ese repositorio.
   Vercel detecta Next.js automáticamente.
3. En "Environment Variables" añade `ANTHROPIC_API_KEY` y
   `ANTHROPIC_MODEL` con los mismos valores que en tu `.env.local`.
4. Deploy. Te da una URL `*.vercel.app` funcionando ya.
5. Cuando tengas el dominio de EGO registrado (Namecheap, Google
   Domains, etc.), en el proyecto de Vercel ve a Settings → Domains,
   añádelo y sigue las instrucciones de DNS que te da Vercel. No hace
   falta tocar código para esto.

## Antes de vender esto (pendiente, a propósito fuera del MVP)

Este proyecto entrega el producto —las dos pantallas y el motor real
conectado— sin construir todavía la capa de negocio, para no montar
infraestructura de más antes de validar que el producto funciona. Cuando
toque, esto es lo que falta:

- **Cuentas y login** — hoy cualquiera con la URL puede usarlo sin
  identificarse. Para cobrar, hace falta autenticación (p. ej. Clerk o
  Auth.js) antes de nada.
- **Cobro / suscripción** — ya preparado (código escrito, cuenta de
  Stripe todavía sin crear) — ver "Cobro (Stripe) — preparado, no
  activado" más arriba. Lo que falta es el botón/flujo en `EgoApp.tsx`
  que lo dispare, y decidir cuándo se enseña (después de cuántas
  auditorías gratis).
- **Límite de uso / anti-abuso** — ahora mismo no hay límite de peticiones
  por usuario ni IP; cada auditoría cuesta dinero real en la API de
  Anthropic (barato por auditoría — del orden de medio céntimo a un
  céntimo con Sonnet 5 — pero sin tope si alguien abusa). Con el cobro ya
  preparado, este es ahora el hueco más urgente: es lo único que
  realmente pone en riesgo el "no perder dinero" antes de lanzar. Añade
  un límite de tasa (p. ej. Upstash Ratelimit) por IP o por dispositivo
  antes de anunciarlo públicamente.
- **Términos de servicio y política de privacidad** — obligatorio antes de
  operar como producto, y más tratándose de algo que toca decisiones
  financieras y estado emocional del usuario. La salvaguarda de seguridad
  ya está en el system prompt (sección 6), pero eso no sustituye un aviso
  legal claro de que EGO no es terapia ni asesoría financiera. Esto es
  ahora más urgente que "antes de vender esto": ya estamos guardando
  datos de usuarios reales (ver "Base de datos de casos anónimos" arriba)
  con solo un aviso corto en la home, no con una política de privacidad
  formal. Habla con un abogado de protección de datos antes de abrir esto
  a clientes reales — el texto libre que escribe la gente puede entrar en
  categorías de datos especialmente protegidas (salud, incluida salud
  mental) según la jurisdicción.
- **Verificación de la marca "EGO"** — antes de invertir en dominio y
  marca, vale la pena una búsqueda rápida de colisión de marca registrada
  en las jurisdicciones donde vayas a operar (a AXIOM le pasó con Axiom
  Telecom en EAU).
- **Monitorización de coste** — cada auditoría es una llamada de pago a
  Claude; conviene tener alertas de gasto en la consola de Anthropic desde
  el primer usuario real.

## App nativa (fase 2)

Cuando llegue el momento: React Native + Expo puede consumir
`/api/audit` tal cual (es una API REST normal) y reutilizar
`types/ego.ts` sin cambios. La lógica de negocio no hay que rehacerla —
solo la capa visual nativa.
