import { reservaBrand } from "@/lib/reservaBrand";

export default function ConfiguracoesPage() {
  return (
    <div className="flex-1 overflow-y-auto px-5 sm:px-8 lg:px-10 py-7 flex flex-col gap-6 max-w-xl">
      <div>
        <h1 className="font-display text-[40px] leading-tight">Configurações</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>Dados do estabelecimento e acesso.</p>
      </div>

      <div className="border p-5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
        <p className="font-display text-lg mb-3">Estabelecimento</p>
        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between"><span style={{ color: "var(--color-text-muted)" }}>Nome</span><span className="font-medium">{reservaBrand.restauranteAtual}</span></div>
          <div className="flex justify-between"><span style={{ color: "var(--color-text-muted)" }}>Funcionamento</span><span className="font-medium">{reservaBrand.diasFuncionamento}</span></div>
        </div>
      </div>

      <div className="border p-5" style={{ borderColor: "var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}>
        <p className="font-display text-lg mb-3">Acesso</p>
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "var(--color-primary)", color: "#fff" }}>
            {reservaBrand.admin.nome.charAt(0).toUpperCase()}
          </span>
          <div>
            <span className="text-sm font-medium block">{reservaBrand.admin.nome}</span>
            <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{reservaBrand.admin.cargo}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
