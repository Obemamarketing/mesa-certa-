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
      className="flex-1 min-w-[220px] p-4 flex flex-col gap-3 border"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", borderRadius: "var(--radius-md)" }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 flex items-center justify-center shrink-0"
          style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)", borderRadius: "var(--radius-sm)" }}
        >
          {icon}
        </span>
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[26px] font-bold leading-none" style={{ color: "var(--color-dark)" }}>{valor}</span>
          <span className="text-[13.5px] truncate" style={{ color: "var(--color-text-muted)" }}>{label}</span>
        </div>
      </div>
      {progresso !== undefined ? (
        <div className="flex flex-col gap-1.5">
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-border)" }}>
            <div className="h-full" style={{ width: `${progresso}%`, background: "var(--color-primary)" }} />
          </div>
          {rodape && <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{rodape}</span>}
        </div>
      ) : (
        rodape && (
          <span className="text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>{rodape}</span>
        )
      )}
    </div>
  );
}
