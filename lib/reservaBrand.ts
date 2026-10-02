// Arquivo único de marca — pra atender outro restaurante, mexe só aqui.
export const reservaBrand = {
  nome: "Mesa Certa",
  tagline: "Reservas para restaurantes",
  restauranteAtual: "ZéPelin",
  admin: { nome: "maninho", cargo: "Administrador" },
  diasFuncionamento: "Sexta, sábado e domingo",
  cores: {
    fundo: "#F7F2E8",
    superficie: "#FCFAF5",
    dark: "#2A1712",
    vinho: "#7F1717",
    vinhoEscuro: "#5C1010",
    oliva: "#60733A",
    olivaEscura: "#465428",
    mostarda: "#D99A18",
    mostardaEscura: "#96690F",
    erro: "#7F1717",
    textoSecundario: "#8A8178",
    borda: "#E7DED2",
  },
  heroGradiente: "linear-gradient(165deg, #7F1717 0%, #5C1010 65%, #2A1712 100%)",
} as const;
