import { redirect } from "next/navigation";

// "Relatórios" virou "Movimento": o endereço antigo leva para a página nova.
export default function RelatoriosPage() {
  redirect("/admin/movimento");
}
