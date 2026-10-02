export default function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[40px] leading-tight">{titulo}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>{descricao}</p>
      </div>
      <div
        className="border flex flex-col items-center justify-center gap-3 py-16 px-6 text-center"
        style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
      >
        <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        </span>
        <p className="font-display text-lg">Em construção</p>
        <p className="text-sm max-w-sm" style={{ color: "var(--color-text-muted)" }}>
          Essa área ainda não está pronta nesse protótipo — as reservas e os clientes já funcionam de verdade.
        </p>
      </div>
    </div>
  );
}
