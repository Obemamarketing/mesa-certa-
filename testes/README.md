# Testes do Mesa Certa

Testes automáticos que conferem o sistema inteiro **sem tocar no banco de
verdade**. Rode antes de publicar qualquer mudança.

## Como rodar

Na primeira vez, dentro da pasta `testes`:

```bash
npm install
```

Depois, sempre que quiser:

```bash
npm run tudo
```

No fim aparece algo como `95 testes, todos passaram.` Se algum falhar, ele
mostra qual e por quê.

Também dá para rodar só uma parte:

| Comando | O que testa | Tempo |
|---|---|---|
| `npm run banco` | As regras do banco: quem lê o quê, limites, fila, LGPD, almoço de sábado, login em duas etapas | ~1 min |
| `npm run unidade` | Planilhas e mensagens de lembrete | segundos |
| `npm run navegador` | O site e o painel de verdade, num navegador, clicando como um cliente | ~10 min |

## Como funciona

- **banco/**: cada teste monta um Postgres na memória (pglite), roda o
  `supabase-completo.sql` e tenta fazer o certo e o errado (por exemplo, um
  visitante tentando ler os telefones). Nada sai do computador.
- **navegador/**: sobe o site na porta 3001 ligado a um **Supabase falso**
  (`banco-falso.cjs`) e usa o Microsoft Edge (sem janela) para clicar no site.
  As contas de teste são sorteadas a cada vez e não existem em lugar nenhum.
  As fotos das telas ficam em `navegador/_saida`.
- **unidade/**: confere as funções puras (planilhas, texto dos lembretes).

## Quando mudar o banco

1. Crie a migração nova (`supabase-migration-XXX.sql`) na pasta do projeto.
2. Acrescente-a em `scripts/montar-completo.sh` e rode
   `bash scripts/montar-completo.sh` para refazer o `supabase-completo.sql`.
3. Escreva um teste em `banco/` (copie o começo de um que já existe).

## Observações

- Os testes de navegador precisam do **Microsoft Edge** instalado. Para usar
  outro navegador (Chrome, por exemplo):
  `NAVEGADOR="C:\caminho\chrome.exe" npm run navegador`.
- A ordem dos testes de navegador importa (está em `rodar.cjs`): um usa a
  reserva que o anterior criou, e o de senha fica por último porque troca a
  senha da conta de teste.
- Os testes de banco antigos rodam no "modo antigo" (sexta a domingo, 19h30):
  eles conferem acesso, limites e LGPD. O almoço de sábado tem os seus
  próprios testes (`banco/teste-almoco.mjs` e `navegador/e2e-almoco.cjs`).
