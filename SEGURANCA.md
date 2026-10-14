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

## O que ainda falta (próximos passos)

- Captcha invisível (Cloudflare Turnstile) na reserva e na consulta: é o que
  barra robô de verdade; o freio só diminui o estrago.
- Login em duas etapas no painel (senha + código no celular).
