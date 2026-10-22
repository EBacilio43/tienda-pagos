import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { COOKIE_TEMA, type Tema } from "@/lib/tema";
import { APP_CONFIG } from "@/lib/config";
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
  title: APP_CONFIG.nombre,
  description: APP_CONFIG.descripcion,
};

// Props explícitas en vez de LayoutProps<"/">: el slot @modal vive dentro
// del grupo (app), y como los grupos de rutas no crean segmento de URL,
// Next le atribuye el slot a la ruta "/" — la misma que sirve este layout.
// Eso hacía que LayoutProps<"/"> se expandiera con `modal`, y el validador
// de `next build` rechazara este export (aunque `tsc --noEmit` pasara).
// Quien realmente recibe y pinta el slot es (app)/layout.tsx, que es donde
// vive la carpeta @modal; aquí solo pasan los children.
export default async function RootLayout({ children }: { children: ReactNode }) {
  // Fase 9 / ADR-17. "sistema" no lleva clase: el servidor no conoce
  // prefers-color-scheme, así que ese caso lo resuelve la media query de
  // globals.css en el propio primer paint — sin JS, sin parpadeo. Nada del
  // cliente muta esta clase después, por eso no hace falta
  // suppressHydrationWarning.
  const tema = ((await cookies()).get(COOKIE_TEMA)?.value ?? "sistema") as Tema;
  const claseTema = tema === "oscuro" ? "dark" : tema === "claro" ? "light" : "";

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${claseTema} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
