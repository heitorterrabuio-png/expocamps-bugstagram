import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { ViewModeProvider } from "@/context/ViewModeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bugstagram - Simulador do Algoritmo de Recomendação",
  description:
    "Simulador interativo educacional de recomendação de conteúdo estilo Instagram (Feed, Bolhas e Furo de Bolha)",
};

const ANTI_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem("bugstagram-theme")||"dark";var r=document.documentElement;r.classList.remove("light","dark");r.classList.add(t==="light"?"light":"dark");r.style.colorScheme=t==="light"?"light":"dark";}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full antialiased dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: ANTI_FOUC_SCRIPT }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-200">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ViewModeProvider>{children}</ViewModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
