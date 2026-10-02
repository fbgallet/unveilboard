import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Application de bureau (desktop/) : un serveur autonome, embarqué et lancé par Electron.
  // Le build web (Vercel) n'en a pas besoin.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
