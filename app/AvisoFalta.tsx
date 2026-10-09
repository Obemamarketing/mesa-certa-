// Aviso que trava o botão Continuar quando as mesas escolhidas ainda não
// acomodam o grupo. É o que explica POR QUE o cliente não consegue avançar,
// então precisa ser impossível de não ver: caixa amarela forte, contorno,
// ícone, número em negrito e uma pulsada ao aparecer.

export default function AvisoFalta({ faltam, pessoas, compacto = false }: { faltam: number; pessoas: number; compacto?: boolean }) {
  const lugares = `${faltam} lugar${faltam === 1 ? "" : "es"}`;
  const grupo = pessoas === 1 ? "a pessoa" : `as ${pessoas} pessoas`;

  return (
    <div
      role="alert"
      // key por "faltam": a animação roda de novo toda vez que o número muda
      key={faltam}
      className={`aviso-falta flex items-start gap-3 ${compacto ? "px-3 py-2.5" : "px-4 py-3"}`}
      style={{
        background: "#FFE9A3",
        border: "2px solid #C98A00",
        borderRadius: "12px",
        color: "#3F2A00",
      }}
    >
      <span
        aria-hidden="true"
        className="shrink-0 flex items-center justify-center rounded-full font-bold"
        style={{
          width: compacto ? 24 : 28,
          height: compacto ? 24 : 28,
          background: "#C98A00",
          color: "#FFFFFF",
          fontSize: compacto ? 14 : 17,
          lineHeight: 1,
          marginTop: 1,
        }}
      >
        !
      </span>
      <p className={`leading-snug ${compacto ? "text-[13.5px]" : "text-[15px]"}`}>
        <strong className="font-bold">Faltam {lugares}</strong> para acomodar {grupo}.
        <span className="block font-bold mt-0.5">Escolha mais uma mesa para continuar.</span>
      </p>
    </div>
  );
}
