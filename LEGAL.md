# Conformidade legal — guia interno

Documento interno (não aparece no site). Diz o que o sistema já faz para
cumprir a lei e o que ainda depende do restaurante. **Não substitui um
advogado**: os textos das políticas são um bom ponto de partida, escritos a
partir do que o sistema faz de verdade, mas devem passar por uma revisão
jurídica antes de valerem para muitos clientes.

Última revisão: 24/10/2026.

## Antes de publicar (obrigatório)

1. Preencher `lib/empresa.ts`: razão social, CNPJ, endereço, cidade/CEP,
   e-mail, WhatsApp e quem responde pelos dados. Enquanto faltar algo, o site
   mostra `[preencher]` em amarelo no rodapé e nas políticas.
2. Rodar no Supabase a parte 12 do `supabase-completo.sql` (pedidos sobre
   dados, exclusão e limpeza automática).
3. Conferir os direitos das imagens (abaixo).

## O que o sistema já faz

| Exigência | Lei | Onde está |
|---|---|---|
| Dizer quem é o controlador, para que serve cada dado, base legal, prazo, com quem compartilha | LGPD arts. 6º, 9º e 18 | `/privacidade` |
| Coletar só o necessário | LGPD art. 6º, III | Reserva pede só nome e WhatsApp; e-mail saiu; aniversário e observação são opcionais e dizem para que servem |
| Aviso no momento da coleta | LGPD art. 9º | Texto embaixo dos formulários |
| Aceite dos termos | CDC art. 46 | Texto com links acima do botão "Confirmar reserva" e "Entrar na fila" |
| Pedido de acesso, correção e exclusão | LGPD art. 18 | `/meus-dados` → painel, Configurações > Pedidos sobre dados |
| Resposta em até 15 dias | LGPD art. 19 | Painel mostra há quantos dias o pedido está aberto (fica vermelho perto do prazo) |
| Prazo de guarda | LGPD arts. 15 e 16 | Limpeza diária automática: reservas 24 meses, fila 30 dias, pedidos 5 anos |
| Cookies | LGPD + guia de cookies da ANPD (2022) | Site sem cookies de rastreamento; aviso informativo; política em `/privacidade#cookies` |
| Sem rastreamento de terceiros | — | Sem Google Analytics, pixel ou fontes do Google (as fontes vêm do próprio site). Única exceção, quando ligado: o captcha da Cloudflare (Turnstile), que só confere se é uma pessoa e está citado na Política de privacidade |
| Segurança | LGPD art. 46 | Banco fechado, login com duas etapas, https obrigatório (ver `SEGURANCA.md`) |
| Dados da empresa à vista | Decreto 7.962/2013 e CDC art. 31 | Rodapé de todas as páginas do cliente |
| Política de cancelamento e reembolso | CDC | `/cancelamento` (a reserva é gratuita) |
| Aviso sobre bebida alcoólica | ECA art. 243; Código do CONAR, anexo P | Rodapé, cardápio e termos |
| Acessibilidade | Lei Brasileira de Inclusão (13.146/2015) art. 63; WCAG 2.1 AA | Ver abaixo |
| Sem promessas sem prova | CDC arts. 30, 31 e 37 | "Mesa garantida" virou "reservada" + aviso da tolerância; menu sem itens falsos; sem depoimentos |

### Acessibilidade (auditoria de 24/10/2026)

Verificado com o axe-core (padrão WCAG 2.1 A e AA) na página inicial
(computador e celular), formulário de dados, cardápio e nas quatro páginas de
política: **nenhum problema**. Corrigido nesta revisão:

- texto cinza com pouco contraste (3,4:1 → 5:1);
- "companhias." amarelo no computador (2,2:1 → 4,4:1);
- número branco sobre a mesa amarela (2,5:1 → 7:1);
- borda das caixas de formulário (1,3:1 → 3:1);
- nome de cada campo ligado à caixa (leitor de tela) e erro anunciado junto;
- contorno visível no foco do teclado em todo o site;
- textos alternativos das fotos e do logo;
- links mortos no menu ("Reservas" e "O ZéPelin") retirados.

## O que depende do restaurante ou de um advogado

- **Fotos com pessoas.** Resolvido em 29/10/2026: a foto com rostos de clientes
  saiu do site e entrou a do buffet (`public/buffet-zepelin.webp`, quadro de um
  vídeo do próprio ZéPelin, sem pessoas). Para fotos futuras com pessoas, vale
  a regra: só com autorização por escrito (Constituição art. 5º, X; Código
  Civil art. 20). A foto precisa mostrar o restaurante como ele é (CDC art. 37).
- **Quem fez a foto e o logo.** Confirmar que o restaurante é dono das imagens
  ou tem licença do fotógrafo/designer (Lei 9.610/1998).
- **Contrato entre Obema (Mesa Certa) e cada restaurante.** A Obema trata os
  dados em nome do restaurante ("operador", LGPD art. 39). Falta um contrato
  com as obrigações de proteção de dados (o que pode fazer com os dados,
  segurança, aviso de incidente, devolução/exclusão ao fim do contrato). Vale
  para os 30 restaurantes.
- **Fornecedores no exterior.** Supabase, Vercel e Cloudflare (captcha) tratam dados fora do Brasil.
  Aceitar os termos de proteção de dados (DPA) de cada um no painel deles e
  guardar cópia. A ANPD publicou cláusulas-padrão para transferência
  internacional (Resolução CD/ANPD nº 19/2024); o advogado diz se precisam ser
  incluídas.
- **Registro de acessos (Marco Civil, art. 15).** Empresa com site deve guardar
  por 6 meses o registro de acesso (IP, data e hora). Hoje esses registros
  ficam só na Vercel e por pouco tempo. Se o advogado achar necessário, dá para
  guardar IP e hora de cada reserva no banco por 6 meses.
- **Lembrete automático pelo WhatsApp.** Se for ligado, a Meta passa a receber
  nome e telefone. A política já cita isso.
- **Incidente de segurança.** Se houver vazamento, avisar a ANPD e os clientes
  em até 3 dias úteis (Resolução CD/ANPD nº 15/2024). Ter o contato do
  advogado à mão.
- **Agente de pequeno porte.** Microempresa e EPP não são obrigadas a nomear
  encarregado (Resolução CD/ANPD nº 2/2022), mas precisam de um canal de
  contato — é o e-mail e WhatsApp de `lib/empresa.ts`.

## Ao mudar o sistema

- Coletar um dado novo? Atualize a tabela da `/privacidade` e a data em
  `lib/empresa.ts`.
- Colocar Google Analytics, pixel ou chat de terceiros? O aviso de cookies
  precisa virar pedido de permissão (o script só carrega depois do "Aceitar")
  — instruções no topo de `app/AvisoCookies.tsx`.
- Mudar um prazo de guarda? Mude em `lib/empresa.ts` **e** na função
  `anonimizar_dados_antigos` do SQL.
- Cobrar sinal na reserva? Reescreva `/cancelamento` antes (direito de
  arrependimento, CDC art. 49, e regras de devolução).
