import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import TemaHorario from "@/components/TemaHorario";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JARVIS AUTO",
  description: "Sistema operativo de IA para agencias de autos — JARVIS CORE",
};

// Mismo rango horario que lib/tema.ts (esDeDia) — duplicado a propósito acá:
// este script corre antes de que React hidrate, para que la primera pintada
// ya use el tema correcto (blanco de día / negro de noche, hora Argentina)
// sin flash del tema equivocado.
const SCRIPT_TEMA_INICIAL = `
(function () {
  try {
    var hora = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    var h = parseInt(hora, 10) % 24;
    document.documentElement.dataset.tema = (h >= 7 && h < 20) ? 'dia' : 'noche';
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <Script id="tema-inicial" strategy="beforeInteractive">
          {SCRIPT_TEMA_INICIAL}
        </Script>
        <TemaHorario />
        {children}
      </body>
    </html>
  );
}
