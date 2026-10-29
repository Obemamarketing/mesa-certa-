# Plano de emergência — o site caiu no sábado ao meio-dia

Guia rápido para quando o sistema parar no meio do almoço. Primeiro o
restaurante continua atendendo; depois a gente conserta.

## 1. Nos primeiros 5 minutos: o restaurante não para

- **O salão continua normal.** Quem já reservou continua com a mesa: as
  reservas estão guardadas no banco, não somem porque o site caiu.
- **Lista de papel:** imprima (ou deixe salvo no celular do Maninho) a planilha
  de reservas do dia **na sexta à noite**: painel > Configurações > Cópia dos
  dados > Reservas. Se o painel não abrir no sábado, é por ela que se recebe os
  clientes.
- **Quem chegar sem reserva:** atende por ordem de chegada, como era antes do
  sistema.
- **Recado para quem tenta reservar:** no Instagram/WhatsApp do ZéPelin,
  "Nosso site de reservas está instável agora. Para reservar, ligue
  (41) 3082-6969."

## 2. Descobrir o que caiu (5 minutos)

Abra estes endereços **no celular, usando 4G** (não o Wi-Fi do restaurante):

| O que testar | Se não abrir… |
|---|---|
| zepellinmesacerta.com.br | Pode ser o domínio ou a Vercel → passo 3 |
| mesa-certa.vercel.app | Se este abre e o de cima não, é o **domínio** (registro.br) → passo 3a |
| zepellinmesacerta.com.br/admin abre, mas sem reservas / "Não deu para abrir o painel" | É o **banco** (Supabase) → passo 3b |
| Abre tudo, mas "Confirmar reserva" dá erro | Pode ser o **captcha** → passo 3c |

## 3. Consertar

### 3a. Domínio (registro.br)
- Entre no registro.br e confira se o domínio está **"Publicado"** e se a
  zona DNS tem o registro **A → 216.198.79.1**.
- Enquanto isso, divulgue o endereço reserva: **mesa-certa.vercel.app**.
- Lembre: o domínio vence em **28/10/2027**. Deixe a renovação automática ligada.

### 3b. Banco (Supabase)
- Entre em supabase.com. Se aparecer **"Project is paused"**, clique em
  **Resume project** (leva uns minutos). É a causa mais provável no plano grátis.
- Veja status.supabase.com: se o Supabase inteiro estiver fora, só resta esperar
  e atender pelo papel.

### 3c. Captcha (Cloudflare)
Se o quadradinho "não sou um robô" não carrega e ninguém consegue reservar:
1. No Supabase, SQL Editor, rode: `select reabrir_reserva_direta();`
2. Na Vercel, apague a variável `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e faça
   **Redeploy**.
O site volta a reservar sem captcha. Depois que a Cloudflare voltar, ligue de
novo (o guia está em `SEGURANCA.md`).

### 3d. Site (Vercel)
- Veja vercel.com > projeto **mesa-certa** > **Deployments**. Se o último deu
  erro, abra o anterior que estava verde e clique em **Promote to Production**
  (volta para a versão que funcionava).
- Status geral: vercel-status.com.

## 4. Chamar o suporte (Gustavo + Claude)

Abra o Claude Code na pasta `mesa-certa` e diga o que aconteceu, com um print.
Não é preciso saber programar: descreva o que aparece na tela. **Nunca** cole
senhas, chaves ou códigos de recuperação na conversa.

## 5. Depois do sábado

- Anote o que aconteceu, quanto tempo durou e quantos clientes foram afetados.
- Se algum cliente teve a reserva perdida, ligue para ele.
- Se dados de clientes possam ter vazado (não é o caso de "site fora do ar"),
  siga o `LEGAL.md`: aviso à ANPD e aos clientes em até 3 dias úteis.

## Para diminuir o risco

- [ ] Supabase **Pro** (sem pausa e com cópia diária do banco).
- [ ] Monitor grátis (UptimeRobot) avisando por e-mail/celular se o site cair.
- [ ] Planilha do dia salva na sexta à noite.
- [ ] Este plano impresso no caixa.
