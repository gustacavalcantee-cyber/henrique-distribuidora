# Spec: Relatório Preço × Custo + Melhoria Cadastros > Custos

**Data:** 2026-03-21
**Status:** Aprovado

---

## Contexto

O usuário precisa acompanhar como o custo de compra de um produto varia ao longo do tempo e compará-lo com o preço de venda praticado em cada loja, visualizando a margem resultante. Além disso, a tela de Cadastros > Custos precisa ser melhorada para exibir os produtos de forma legível (com nome em vez de ID) e com histórico expansível.

---

## Parte 1 — Melhoria: Cadastros > Custos

### Problema atual

A tab Custos em Cadastros exibe um AG Grid cru com `produto_id` (número), sem nome do produto, com todos os registros históricos embaralhados numa lista plana. Difícil de ler e gerenciar.

### Nova visualização

Substituir o AG Grid por uma tabela nativa com:

- **Uma linha por produto** mostrando:
  - Nome do produto
  - Custo vigente atual (registro com `vigencia_fim IS NULL`)
  - Data de início da vigência atual
  - Botão ▶ para expandir o histórico

- **Linhas expandidas** (ao clicar ▶):
  - Cada registro histórico encerrado: custo | de | até

- **Formulário de cadastro** no topo permanece igual, mas o select de produto exibe o nome (já funciona parcialmente, apenas melhora o visual da lista).

### Dados necessários

- `IPC.CUSTOS_LIST` — já existe, retorna todos os registros
- `IPC.PRODUTOS_LIST` — já existe, retorna produtos com nome
- Join manual no frontend: agrupar custos por `produto_id`, resolver nome via produtos

---

## Parte 2 — Nova Aba: Relatório "Preço × Custo"

### Localização

Nova aba na página de Relatórios (`/relatorios`), chamada **"Preço × Custo"**, seguindo o padrão de abas já existente (Quinzena, Financeiro, etc.).

### Filtros

| Campo | Tipo | Obrigatório |
|---|---|---|
| Produto | Select (lista de produtos) | Sim |
| Loja | Select (lista de lojas + "Todas as lojas") | Não |

Botão **Buscar** aciona a consulta.

### Seção 1 — Histórico de Custos de Compra

Tabela com todos os registros da tabela `custos` para o produto selecionado, ordenados do mais recente para o mais antigo:

| Coluna | Fonte |
|---|---|
| Vigência início | `custos.vigencia_inicio` |
| Vigência fim | `custos.vigencia_fim` (ou "—" se vigente) |
| Custo de compra | `custos.custo_compra` formatado em R$ |
| Status | "Vigente" (verde) se `vigencia_fim IS NULL`, "Encerrado" (cinza) caso contrário |

### Seção 2 — Comparação por Loja

Mostra o custo vigente atual vs o preço de venda vigente de cada loja, calculando margem.

**Se "Todas as lojas":** uma linha por loja ativa que tenha preço cadastrado para o produto.

**Se loja específica:** uma única linha.

| Coluna | Cálculo |
|---|---|
| Franquia + Loja | `franqueado.nome + " — " + loja.nome` (ou só loja.nome se sem franqueado) |
| Preço de venda | `precos.preco_venda` vigente (vigencia_fim IS NULL) |
| Custo atual | `custos.custo_compra` vigente (vigencia_fim IS NULL) |
| Margem R$ | `preco_venda - custo_compra` |
| Margem % | `(preco_venda - custo_compra) / preco_venda * 100` |

Margem % colorida: verde ≥ 30%, amarelo 15–30%, vermelho < 15%.

### Seção 3 — Gráfico Mensal

**Biblioteca:** Recharts (instalar via `npm install recharts`).

**Visualização padrão (meses):**
- Eixo X: meses (jan–dez do ano atual, ou dos últimos 12 meses)
- Barras agrupadas: custo de compra (vermelho claro) + preço de venda (azul)
- Linha sobreposta: margem % (verde) com eixo Y secundário (0–100%)

**Zoom (drill-down para o mês):**
- Ao clicar numa barra de mês, o gráfico reexibe com granularidade de dias para aquele mês
- Botão "← Voltar" retorna à visão mensal

**Dados do gráfico:**
- Custo: lido diretamente da tabela `custos` (registro vigente em cada mês)
- Preço de venda: se loja específica, usa `precos` vigente; se "Todas", calcula média dos preços de todas as lojas com preço cadastrado
- Margem %: calculada a partir dos dois valores acima

---

## Backend — Nova função de serviço

**Arquivo:** `src/main/services/relatorios.service.ts`

**Nova função:** `getRelatorioPrecoVsCusto(produto_id, loja_id?)`

**Retorno:**
```typescript
{
  produto_nome: string
  historico_custos: {
    id: number
    custo_compra: number
    vigencia_inicio: string
    vigencia_fim: string | null
  }[]
  comparacao_lojas: {
    loja_id: number
    loja_nome: string        // franqueado + loja
    preco_venda: number | null
    custo_atual: number | null
    margem_reais: number | null
    margem_pct: number | null
  }[]
  grafico_mensal: {
    mes: string              // "2026-01"
    custo: number | null
    preco_medio: number | null
    margem_pct: number | null
    dias: {                  // para drill-down
      dia: string            // "2026-01-15"
      custo: number | null
      preco: number | null
      margem_pct: number | null
    }[]
  }[]
}
```

**Novo IPC channel:** `RELATORIO_PRECO_CUSTO: 'relatorio:precoCusto'`

**Novo tipo TypeScript:** `PrecoVsCustoResult` em `src/shared/types.ts`

---

## Frontend — Componentes

| Arquivo | Descrição |
|---|---|
| `src/renderer/src/pages/Cadastros.tsx` | Substituir CustosTab AG Grid por tabela com expand |
| `src/renderer/src/pages/Relatorios.tsx` | Adicionar aba "Preço × Custo" + componente `PrecoVsCustoTab` |

O componente `PrecoVsCustoTab` pode ficar inline em `Relatorios.tsx` ou extraído para `src/renderer/src/components/Relatorios/PrecoVsCustoTab.tsx` se ficar grande (recomendado).

---

## Dependências

- `recharts` — instalar como dependência de produção
- Sem migração de banco necessária (usa tabelas existentes `custos` e `precos`)
