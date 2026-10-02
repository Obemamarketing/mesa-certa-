export default function StatCard({
  icon,
  label,
  valor,
  rodape,
  progresso,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  rodape?: string;
  progresso?: number;
}) {
  return (
    <div
      className="flex-1 min-w-[150px] p-4 flex flex-col gap-2.5 border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="w-9 h-9 flex items-center justify-center shrink-0"
          style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
        >
          {icon}
        </span>
        <span className="text-[12.5px] font-medium tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      </div>
      <span className="font-display text-[33px] leading-none">{valor}</span>
      {progresso !== undefined ? (
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
          <div className="h-full" style={{ width: `${progresso}%`, background: "var(--color-primary)" }} />
        </div>
      ) : (
        rodape && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{rodape}</span>
        )
      )}
    </div>
  );
}
