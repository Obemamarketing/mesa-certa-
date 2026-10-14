import type { NextConfig } from "next";

// Cabeçalhos de segurança, mandados em toda página. Valem para qualquer
// restaurante que usar esta base — não dependem de nada do ZéPelin.
const CABECALHOS_DE_SEGURANCA = [
  // Ninguém consegue abrir o site DENTRO de outro site (um "site falso" que
  // mostra o painel por baixo para capturar cliques ou a senha).
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'none'",
      // sem plugins (Flash, Java) e sem trocar o endereço-base das páginas
      "object-src 'none'",
      "base-uri 'self'",
      // formulários só enviam para o próprio site
      "form-action 'self'",
    ].join("; "),
  },
  // o navegador não "adivinha" o tipo de um arquivo (evita rodar um arquivo
  // como script quando ele não é)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // links para fora levam só o domínio, nunca o caminho completo da página
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // o site não usa câmera, microfone, localização nem pagamento: fica proibido
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // depois da primeira visita, o navegador só aceita o site por https
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // não anuncia que o site é feito em Next.js (uma pista a menos pra quem procura brecha)
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: CABECALHOS_DE_SEGURANCA },
      // o painel não aparece no Google nem em outros buscadores
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
