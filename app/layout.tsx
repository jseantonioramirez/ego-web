import type { Metadata } from "next";
import "./globals.css";

// Enlace directo a Google Fonts (en vez de next/font/google) a propósito:
// no depende de que el *build* tenga salida a internet, solo el navegador
// del usuario en tiempo de ejecución — más robusto en cualquier entorno
// de CI/despliegue.
export const metadata: Metadata = {
  title: "EGO — Auditor Cognitivo",
  description:
    "Un auditor cognitivo clínico y estoico para detectar cuándo una decisión está guiada por el ego, la aversión a la pérdida o un sesgo emocional.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500&family=Bebas+Neue&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
