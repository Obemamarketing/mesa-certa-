# Segurança — checklist para cada restaurante

O Mesa Certa guarda nome, telefone, e-mail e aniversário de clientes de outra
empresa. Quem cuida do sistema responde por esses dados (LGPD). Esta lista vale
para **todo** restaurante novo, sem exceção — e para revisar os que já estão no
ar a cada poucos meses.

## Como o sistema se protege (já vem no código)

- **Um projeto Supabase por restaurante.** Os dados de um nunca ficam no mesmo
  banco que os de outro: um problema num não vaza os demais.
- **Painel com login.** Estar logado não basta: a conta precisa estar na tabela
  `administradores`. Quem cria uma conta sozinho não vê nada.
- **Banco fechado para visitante.** A chave pública do site (que vai dentro do
  navegador e qualquer um consegue ver) não lê nem altera as tabelas. O site do
  cliente só usa funções do banco que nunca devolvem telefone nem e-mail:
  `mesas_ocupadas`, `reservar`, `consultar_reservas`, `cancelar_minha_reserva`.
- **Login em duas etapas no painel** (senha + código do app autenticador),
  ativado por cada pessoa em Configurações > Acesso. A regra fica no banco:
  quem ativou e entrou só com a senha não é tratado como administrador.
- **Cancelar pelo site pede os 4 últimos dígitos do telefone**; 5 erros travam.
- **Freio contra abuso na reserva** (`limites_reserva`): mesas por reserva,
  mesas por telefone e mesas por 10 minutos. Ajuste ao tamanho do salão:
  `update limites_reserva set mesas_por_telefone = 10;`
- **Cabeçalhos de segurança** no site (`next.config.ts`): o site não abre
  dentro de outro site, só por https, e o painel fica fora dos buscadores.
- **Planilhas** com texto que viraria fórmula no Excel neutralizado.

## Ao instalar um restaurante novo

1. Projeto Supabase novo (região São Paulo), com senha do banco forte e
   guardada num gerenciador de senhas.
2. `supabase-schema.sql`, depois `supabase-completo.sql`.
3. Criar os usuários do painel (Authentication > Users, "Auto Confirm User") —
   um do restaurante e um de suporte — e rodar `supabase-administradores.sql`.
4. Publicar o site na Vercel com as variáveis do `.env.local.example`.
5. Entrar no painel e conferir as reservas.
6. `supabase-fechar-acesso.sql`. Em Configurações > Acesso tem que aparecer
   "Banco de dados protegido".
7. Configurações do Supabase (abaixo).
8. Ajustar `limites_reserva` ao número de mesas.

## Configurações do Supabase (por projeto)

- [ ] Authentication > Sign In / Providers: desligar **"Allow new users to sign up"**.
- [ ] Authentication: senha mínima de 10 caracteres; ligar a proteção contra
      senhas vazadas (plano Pro).
- [ ] Database > Settings: **Enforce SSL**.
- [ ] Advisors > **Security Advisor**: nada em vermelho.
- [ ] Plano **Pro**: backup diário automático e o projeto não pausa.
- [ ] A chave `service_role` só existe na Vercel (variável de ambiente). Nunca
      no código, no GitHub, em mensagem ou em print.

## Contas da Obema (valem para todos os restaurantes)

- [ ] **Verificação em duas etapas** no Supabase, na Vercel, no GitHub e no
      e-mail usado em cada um. Quem entra numa dessas contas leva os dados de
      TODOS os restaurantes — é o ponto mais importante desta lista.
- [ ] Repositório do GitHub **privado**.
- [ ] Senhas diferentes em cada serviço, num gerenciador de senhas.
- [ ] Quem sai da equipe perde o acesso no mesmo dia.

## Com o restaurante

- [ ] O e-mail do login do painel é do restaurante, com o telefone de
      recuperação do dono.
- [ ] Senha do painel diferente da senha do e-mail.
- [ ] Combinar a cópia semanal das planilhas (Configurações > Cópia dos dados)
      no Google Drive do restaurante.
- [ ] Contrato dizendo que a Obema trata os dados em nome do restaurante
      (operador, na LGPD) e o que acontece com eles no fim do contrato.

## Se algo der errado

- Painel logado sem mostrar reservas depois de fechar o banco:
  `select reabrir_acesso_publico();` no SQL Editor, avisar o suporte e fechar de
  novo (`select fechar_acesso_publico();`) assim que resolver.
- Suspeita de senha vazada: trocar a senha em Authentication > Users e, se
  preciso, tirar a pessoa de `administradores`.
- Suspeita de chave `service_role` vazada: gerar uma nova em Settings > API e
  trocar na Vercel.

## Chaves do Supabase

- A chave **pública** (anon ou `sb_publishable_…`) vai dentro do site de
  propósito; quem protege os dados é o RLS. A chave **secreta** (service_role
  ou `sb_secret_…`) só existe na Vercel.
- Prefira o formato novo (`sb_publishable_…` / `sb_secret_…`): cada chave
  pode ser revogada sozinha se vazar. Troca: Settings > API Keys > criar as
  duas; na Vercel, pôr a publishable em `NEXT_PUBLIC_SUPABASE_ANON_KEY` e a
  secret em `SUPABASE_SERVICE_ROLE_KEY`; publicar de novo, testar o site e o
  painel e só então desativar as chaves antigas (legacy).

## Perdeu o celular do login em duas etapas

Authentication > Users > (a pessoa) > apagar o fator de MFA. Ela entra só com
a senha e ativa de novo com o celular novo.

## Captcha (Cloudflare Turnstile): como ligar

O código já está pronto. O captcha protege **reservar, entrar na fila e "Meus
dados"**: quem não passa pelo "não sou um robô" não grava nada. Na maioria das
vezes o cliente nem precisa clicar (a Cloudflare decide sozinha). Sem as chaves,
o site funciona como antes, sem captcha.

**Ordem obrigatória:**

1. **Cloudflare** (grátis): crie uma conta em dash.cloudflare.com, vá em
   **Turnstile** > **Add widget**:
   - Widget name: `ZéPelin reservas`
   - Hostnames: `zepellinmesacerta.com.br` e `mesa-certa.vercel.app`
   - Widget mode: **Managed**
   - Ela mostra a **Site Key** (pública) e a **Secret Key** (secreta).
2. **Supabase**: Settings > API > copie a chave **service_role** (secreta).
3. **Vercel** > projeto mesa-certa > Settings > **Environment Variables**,
   adicione (ambiente Production):
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = a Site Key
   - `TURNSTILE_SECRET_KEY` = a Secret Key
   - `SUPABASE_SERVICE_ROLE_KEY` = a service_role
4. Vercel > Deployments > último > **Redeploy**.
5. Abra o site, faça uma reserva de teste e confira que aparece o quadradinho
   da Cloudflare e que a reserva entra. Cancele a reserva de teste.
6. **Só depois**, no Supabase (SQL Editor), rode `supabase-fechar-reserva-direta.sql`.
   A partir daí, o banco recusa reserva feita direto, sem passar pelo captcha.

**Se o captcha der problema num sábado:** veja `PLANO-DE-EMERGENCIA.md`
(item 3c): `select reabrir_reserva_direta();` e tirar a Site Key da Vercel.

As duas chaves secretas (Secret Key e service_role) **só na Vercel**: nunca no
código, nunca com `NEXT_PUBLIC_`, nunca em conversa.

## O que ainda falta (próximos passos)

- Monitor de "site no ar" (UptimeRobot, grátis) avisando por e-mail/celular.
