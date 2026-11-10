import type { Metadata } from "next";
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
    <html lang="pt-BR" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-black text-white font-sans">
        {children}
      </body>
    </html>
  );
}
