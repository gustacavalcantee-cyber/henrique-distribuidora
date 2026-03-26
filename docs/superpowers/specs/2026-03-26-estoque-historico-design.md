# Estoque — Histórico e Auto-Carry Design

**Data:** 2026-03-26
**Status:** Aprovado

## Contexto

O EstoqueTab atual permite ao usuário monitorar o estoque por produto: ele digita o campo CONTEM (quantidade física em estoque) e o app calcula S/F = CONTEM − total de pedidos do dia. O valor CONTEM é salvo apenas no `localStorage`, sem histórico e sem sincronização entre dispositivos.

## Objetivo

1. Persistir o CONTEM em banco de dados com data, sincronizado entre Mac e Windows via Supabase
2. Auto-preencher o CONTEM do dia atual com o S/F do dia anterior (carry-forward)
3. Mostrar histórico dos últimos 14 dias abaixo da tabela principal

## Modelo de Dados

### Nova tabela: `estoque_entradas`

```sql
CREATE TABLE estoque_entradas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  data       TEXT NOT NULL,           -- 'YYYY-MM-DD'
  quantidade REAL NOT NULL,
  synced     INTEGER DEFAULT 0,
  device_id  TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX uq_estoque_entrada ON estoque_entradas(produto_id, data);
```

- `UNIQUE(produto_id, data)` — uma entrada por produto por dia
- `synced=0` = pendente de push; `synced=1` = sincronizado
- Mesma estrutura criada no Supabase para push/pull

## Lógica de Auto-Carry (carry-forward)

Ao abrir o EstoqueTab para a data D e produto P:

1. Busca `estoque_entradas` WHERE `produto_id = P AND data = D`
   - Se encontrado → usa `quantidade` como CONTEM (entrada manual, fundo branco)
2. Se não encontrado → busca a entrada mais recente antes de D (data D-prev, quantidade Q-prev)
   - Calcula `total_pedidos_D-prev` = soma de `itens_pedido` de todos os pedidos com `data_pedido = D-prev` para o produto P
   - `auto_contem = Q-prev − total_pedidos_D-prev`
   - Exibe esse valor pré-preenchido em **azul** (indicando que é automático)
3. Se não há entrada anterior → CONTEM começa vazio (comportamento atual)

**Quando o usuário digita:**
- Debounce de 1s
- Upsert em `estoque_entradas(produto_id, data=hoje, quantidade)` com `synced=0`
- Valor passa a aparecer em branco (entrada manual)

## Interface

### Tabela principal (sem mudanças estruturais)

A tabela atual continua igual. Apenas o campo CONTEM muda visualmente:
- Fundo **azul claro** + texto em itálico = valor auto-preenchido (carry-forward)
- Fundo **branco** = valor digitado manualmente pelo usuário

### Tabela de histórico (nova, abaixo da tabela principal)

Título "Histórico" com os últimos 14 dias que têm entradas. Cada linha = uma data. Colunas = mesmos produtos selecionados na tabela principal.

Cada célula exibe 3 linhas:
```
CONTEM: 500
Total:  200
S/F:   +300
```

- S/F positivo → célula verde
- S/F negativo → célula vermelha
- S/F zero → célula amarela

O usuário pode **clicar em qualquer CONTEM histórico** para editar o valor daquele dia. O sistema salva o novo valor e recalcula o S/F exibido.

## IPC Channels Novos

| Canal | Parâmetros | Retorno |
|-------|-----------|---------|
| `ESTOQUE_ENTRADAS_GET` | `data: string, produtoIds: number[]` | `{ contem: Record<prodId, {quantidade: number, auto: boolean}>, history: HistoryRow[] }` |
| `ESTOQUE_ENTRADA_UPSERT` | `produtoId: number, data: string, quantidade: number` | `void` |

**HistoryRow:**
```typescript
{
  data: string
  produtos: Record<number, { contem: number; total: number; sf: number }>
}
```

## Sincronização

Entra no fluxo de sync já existente:

- **Push** (`pushPendingOthers`): inclui `estoque_entradas WHERE synced=0` → upsert no Supabase
- **Pull** (`pullFromSupabase`): baixa todas as entradas remotas → upsert local (respeitando `UNIQUE(produto_id, data)`)
- **Conflito**: vence o registro com `updated_at` mais recente
- Sem broadcast especial — o polling de 8s e o Realtime broadcast existente já propagam as mudanças

## Migração

- Remover leitura/escrita do `localStorage` para CONTEM (`estoque_contem_${id}`)
- Na migração do banco (client-local.ts), adicionar `CREATE TABLE IF NOT EXISTS estoque_entradas ...`
- O Supabase precisa da tabela criada manualmente (mesma estrutura)

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/main/db/schema-local.ts` | Nova tabela `estoqueEntradas` |
| `src/main/db/client-local.ts` | Migração CREATE TABLE IF NOT EXISTS |
| `src/main/handlers/estoque.ts` | Novos handlers ESTOQUE_ENTRADAS_GET e ESTOQUE_ENTRADA_UPSERT |
| `src/main/sync/sync.service.ts` | Incluir estoque_entradas no push/pull |
| `src/shared/ipc-channels.ts` | Novos canais |
| `src/renderer/src/pages/EstoqueTab.tsx` | Carry-forward, auto-save, histórico |
