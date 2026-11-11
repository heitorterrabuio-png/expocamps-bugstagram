import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { ViewModeProvider } from "@/context/ViewModeContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bugstagram - Simulador do Algoritmo de Recomendação",
  description:
    "Simulador interativo educacional de recomendação de conteúdo estilo Instagram (Feed, Bolhas e Furo de Bolha)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full antialiased dark" suppressHydrationWarning>
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
