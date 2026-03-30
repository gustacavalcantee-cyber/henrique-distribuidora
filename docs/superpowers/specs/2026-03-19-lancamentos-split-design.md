# Design: Divisão do Lancamentos.tsx em módulos

**Data:** 2026-03-19
**Status:** Aprovado

## Problema

`Lancamentos.tsx` tem 1.010 linhas com 6 responsabilidades misturadas:
- Gerenciamento de estado global
- Lógica de colunas de produtos por loja (localStorage)
- Lógica de numeração OC
- Renderização da tabela
- Modal de share/WhatsApp
- Aba de estoque

Quando um bug aparece, é difícil saber onde procurar. Qualquer edição corre risco de quebrar outra parte.

## Objetivo

Dividir em 9 arquivos pequenos e focados, cada um com uma única responsabilidade. Ao ver um bug, o desenvolvedor sabe imediatamente qual arquivo abrir.

## Estrutura Proposta

### Hooks (lógica pura, sem JSX)

**`src/renderer/src/hooks/useLancamentos.ts`** — ja existe
Carrega e salva pedidos do banco via IPC. Nao muda.

**`src/renderer/src/hooks/useRowProdutos.ts`** — NOVO (~60 linhas)
Responsabilidade: quais colunas de produto aparecem por loja.
- Estado: `rowProdIds: Record<number, Set<number>>`
- Inicializa do localStorage ou dos produtos da rede
- Exporta: `handleToggleRowProd`, `handleRemoveColumn`, `handleToggleGlobalProd`
- Bug de "produto sumiu" ou "coluna nao aparece" → este arquivo

**`src/renderer/src/hooks/useOcNumbers.ts`** — NOVO (~70 linhas)
Responsabilidade: numeracao OC (placeholder, auto-fill, sequencia).
- Estado: `lastOcBase`, `autoFilledOcIds`
- Computa `ocPlaceholders` a partir das rows atuais
- Exporta: `handleOcChange`, `ocPlaceholders`, `autoFilledOcIds`
- Bug de "OC preencheu numero errado" → este arquivo

### Components (so JSX/UI)

**`src/renderer/src/components/Lancamentos/LancamentosHeader.tsx`** — NOVO (~100 linhas)
Barra superior: seletor de data, botao Editar, botao global Produto, botao Adicionar loja.

**`src/renderer/src/components/Lancamentos/LancamentosTable.tsx`** — NOVO (~220 linhas)
A tabela principal: linha de totais, linha TODAS, cabecalho de colunas, linhas de dados por loja.
Bug visual na tabela → este arquivo.

**`src/renderer/src/components/Lancamentos/ProdutoRowMenu.tsx`** — NOVO (~80 linhas)
Menu flutuante (portal) para gerenciar produtos de uma loja especifica, com campo de preco inline.

**`src/renderer/src/components/Lancamentos/ShareModal.tsx`** — NOVO (~60 linhas)
Modal de previa da nota com botoes Copiar, Salvar e Enviar via WhatsApp.

### Pages

**`src/renderer/src/pages/Lancamentos.tsx`** — REESCRITO (~80 linhas)
Orquestrador fino: usa os hooks, passa props para os componentes, controla qual aba esta ativa.

**`src/renderer/src/pages/EstoqueTab.tsx`** — EXTRAIDO (~185 linhas)
Aba de estoque (ja era praticamente independente, so move para arquivo proprio).

## Mapa de Bugs → Arquivo

| Sintoma | Arquivo |
|---|---|
| Produto sumiu da coluna | `useRowProdutos.ts` |
| Produto nao aparece nem com dados | `useRowProdutos.ts` |
| OC preencheu numero errado | `useOcNumbers.ts` |
| Tabela nao renderiza certo | `LancamentosTable.tsx` |
| Modal de share nao abre / imagem errada | `ShareModal.tsx` |
| Impressao mostrando pedido errado | `useLancamentos.ts` |
| Estoque mostrando valor errado | `EstoqueTab.tsx` |

## Regras de Interface

- Hooks retornam dados e handlers — nao retornam JSX
- Components recebem tudo via props — nao fazem chamadas IPC diretamente
- O `Lancamentos.tsx` e o unico arquivo que conhece todos os outros
- Cada arquivo novo tem no maximo 220 linhas

## Ordem de Implementacao

1. Extrair `EstoqueTab.tsx` (menor risco, ja e independente)
2. Criar `useRowProdutos.ts` e substituir no Lancamentos.tsx
3. Criar `useOcNumbers.ts` e substituir no Lancamentos.tsx
4. Criar `ShareModal.tsx` e substituir no Lancamentos.tsx
5. Criar `ProdutoRowMenu.tsx` e substituir no Lancamentos.tsx
6. Criar `LancamentosTable.tsx` e substituir no Lancamentos.tsx
7. Criar `LancamentosHeader.tsx` e substituir no Lancamentos.tsx
8. Limpar o `Lancamentos.tsx` final (deve ficar com ~80 linhas)
