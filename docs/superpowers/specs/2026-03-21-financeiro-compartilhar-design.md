# Spec: Financeiro — Filtro Franqueado + Compartilhar em Todas as Abas

**Data:** 2026-03-21
**Status:** Aprovado

---

## Contexto

O usuário precisa de duas melhorias nas abas de Relatórios:

1. **FinanceiroTab**: adicionar filtro por franqueado (afeta cards financeiros + notas)
2. **Todas as abas de Relatórios**: botão "Compartilhar" que gera uma imagem pronta para enviar via WhatsApp

---

## Parte 1 — Filtro Franqueado no Financeiro

### Mudança nos filtros

Adicionar select "Franqueado" entre Rede e o botão Buscar:

```
Mês | Ano | Rede | Franqueado | [Buscar]
```

- Opção padrão: "Todos"
- Quando franqueado selecionado: o backend filtra pedidos pelas lojas que pertencem a esse franqueado
- Afeta **tudo**: cards financeiros (Receita, Custo, Margem, Despesas, Lucro) + seção de Notas

### Mudança no backend

**`getRelatorioFinanceiro(mes, ano, rede_id?, franqueado_id?)`**

- Novo parâmetro opcional `franqueado_id`
- Se informado: busca lojas com `franqueado_id` correspondente, depois filtra pedidos com `loja_id IN (lojas do franqueado)`

**`getNotasMes(mes, ano, rede_id?, franqueado_id?)`**

- Mesmo parâmetro adicional, mesma lógica de filtro

### IPC

Ambas as funções já passam por IPC existente (`RELATORIO_FINANCEIRO`, `NOTAS_LIST`). Os handlers precisam aceitar e repassar o novo parâmetro.

---

## Parte 2 — Compartilhar em Todas as Abas

### Mecanismo

**Novo IPC channel:** `RENDER_HTML_IMAGE: 'render:htmlImage'`

**Handler:** recebe uma string HTML, abre janela offscreen (BrowserWindow com `show: false`), carrega o HTML via `loadURL('data:text/html,...')`, aguarda `did-finish-load`, captura com `webContents.capturePage()`, retorna base64 PNG.

**Frontend:** cada aba monta o HTML com o conteúdo atual → chama `RENDER_HTML_IMAGE` → exibe no `ShareModal` existente (`src/renderer/src/components/Lancamentos/ShareModal.tsx`).

### Botão de compartilhar

- Aparece quando há resultados carregados (junto com botões de imprimir existentes)
- Label: "Compartilhar" com ícone `Share2` (já importado em outros componentes)

### Conteúdo da imagem por aba

| Aba | Conteúdo gerado |
|---|---|
| **Quinzena** | Cabeçalho (rede/loja/período) + matriz de datas × produtos + totais |
| **Financeiro** | Cards de resumo + lista de notas em aberto e atrasadas por loja + total em aberto |
| **Cobrança** | Lista de lojas com valor do período + total geral |
| **Por Produto** | Tabela por produto com linhas por loja/franqueado + totais |
| **Preço × Custo** | Tabela de comparação loja × custo vigente × preço × margem |

### Estilo das imagens

HTML simples com:
- Fundo branco, fonte Arial
- Cabeçalho com nome do fornecedor (config `nome_fornecedor`) + filtros aplicados
- Tabela com bordas, sem cores de fundo elaboradas (legível ao compartilhar como imagem)
- Largura fixa de 600px para consistência

---

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/shared/ipc-channels.ts` | Adicionar `RENDER_HTML_IMAGE: 'render:htmlImage'` |
| `src/main/services/relatorios.service.ts` | Adicionar `franqueado_id?` em `getRelatorioFinanceiro` e `getNotasMes` |
| `src/main/handlers/relatorios.ts` | Repassar `franqueado_id` nos dois handlers existentes |
| `src/main/index.ts` (ou novo handler) | Registrar handler `RENDER_HTML_IMAGE` |
| `src/renderer/src/pages/Relatorios.tsx` | Franqueado filter em FinanceiroTab + botão Compartilhar em todas as abas |

---

## Sem mudança de banco

Usa tabelas existentes. Sem migrações necessárias.
