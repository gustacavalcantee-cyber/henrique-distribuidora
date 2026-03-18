# Design Spec: Sistema de Vendas e Relatórios — Henrique Distribuidor

**Data:** 2026-03-17
**Status:** Aprovado
**Stack:** Electron + React + TypeScript + SQLite + Drizzle ORM + AG Grid + Zod

---

## Contexto

Henrique é fornecedor/distribuidor de hortifruti que abastece lojas de redes como Subway, Bob's, 10 Pasteis, CIAM, Johnny Rockets, McDonald's e outras. O sistema substitui planilhas Excel no fluxo de:

1. Lançamento diário de pedidos por loja
2. Impressão do documento de entrega em 2 vias
3. Fechamento quinzenal por loja (detalhe + matriz para nota fiscal)
4. Controle financeiro: receita, custo de aquisição, despesas operacionais, margem

**Usuário único.** Sem login no MVP. Sem migração de dados históricos — começa do zero.

---

## Arquitetura

### Processos Electron

```
main process
  ├── db/          Drizzle schema + migrations (better-sqlite3, síncrono)
  ├── handlers/    IPC handlers por domínio (pedidos, relatórios, cadastros, etc.)
  └── services/    Lógica de negócio e geração de relatórios

renderer process (React)
  ├── pages/       Telas principais
  ├── components/  Componentes compartilhados
  └── hooks/       Hooks de dados (chamam IPC via preload)

shared/
  ├── types/       Tipos TypeScript compartilhados
  └── schemas/     Schemas Zod (validação no renderer e no handler)
```

### Princípios
- O renderer NUNCA acessa SQLite diretamente — tudo via IPC tipado
- Schemas Zod em `shared/` são reutilizados em ambos os processos
- Impressão via janela Electron oculta renderizando HTML/CSS + `window.print()`
- Dados locais persistidos offline — sem dependência de rede

---

## Banco de Dados (Drizzle + better-sqlite3)

### Tabelas

```sql
redes
  id           INTEGER PRIMARY KEY
  nome         TEXT NOT NULL
  cor_tema     TEXT
  ativo        INTEGER DEFAULT 1

lojas
  id           INTEGER PRIMARY KEY
  rede_id      INTEGER REFERENCES redes(id)
  nome         TEXT NOT NULL
  codigo       TEXT
  ativo        INTEGER DEFAULT 1

produtos
  id           INTEGER PRIMARY KEY
  rede_id      INTEGER REFERENCES redes(id)  -- NULL = produto global
  nome         TEXT NOT NULL
  unidade      TEXT NOT NULL  -- 'UN' ou 'KG'
  ordem_exibicao INTEGER DEFAULT 0
  ativo        INTEGER DEFAULT 1

pedidos
  id           INTEGER PRIMARY KEY
  rede_id      INTEGER REFERENCES redes(id)
  loja_id      INTEGER REFERENCES lojas(id)
  data_pedido  TEXT NOT NULL  -- ISO date YYYY-MM-DD
  numero_oc    TEXT NOT NULL
  observacoes  TEXT
  criado_em    TEXT DEFAULT (datetime('now'))
  UNIQUE(rede_id, loja_id, data_pedido, numero_oc)

itens_pedido
  id           INTEGER PRIMARY KEY
  pedido_id    INTEGER REFERENCES pedidos(id) ON DELETE CASCADE
  produto_id   INTEGER REFERENCES produtos(id)
  quantidade   REAL NOT NULL
  preco_unit   REAL NOT NULL  -- snapshot do preço vigente no momento do lançamento
  custo_unit   REAL NOT NULL  -- snapshot do custo vigente no momento do lançamento

precos
  id              INTEGER PRIMARY KEY
  produto_id      INTEGER REFERENCES produtos(id)
  loja_id         INTEGER REFERENCES lojas(id)  -- preço por loja
  preco_venda     REAL NOT NULL
  vigencia_inicio TEXT NOT NULL
  vigencia_fim    TEXT           -- NULL = vigente

custos
  id              INTEGER PRIMARY KEY
  produto_id      INTEGER REFERENCES produtos(id)
  custo_compra    REAL NOT NULL
  vigencia_inicio TEXT NOT NULL
  vigencia_fim    TEXT           -- NULL = vigente

despesas
  id         INTEGER PRIMARY KEY
  data       TEXT NOT NULL
  categoria  TEXT NOT NULL
  rede_id    INTEGER REFERENCES redes(id)    -- opcional
  loja_id    INTEGER REFERENCES lojas(id)    -- opcional
  descricao  TEXT
  valor      REAL NOT NULL

configuracoes
  chave  TEXT PRIMARY KEY
  valor  TEXT
```

### Regras de negócio
- `itens_pedido.preco_unit` e `custo_unit` são snapshots — o histórico nunca muda ao alterar preços futuros
- Preços são por loja (cada loja tem seu preço por produto)
- Custos são por produto (custo de aquisição no atacado, sem variação por loja)
- Unicidade de pedido por `(rede_id, loja_id, data_pedido, numero_oc)`: sistema alerta mas permite salvar com confirmação
- Produtos não deletados, apenas desativados (`ativo = 0`)

---

## Telas

### Navegação
Sidebar fixa à esquerda:
- Dashboard
- Lançamentos ← tela mais usada
- Histórico
- Relatórios (Quinzena / Financeiro)
- Despesas
- Cadastros

---

### 1. Lançamentos

Matriz diária. Uma aba por rede (com a cor da rede). Todas as lojas da rede como linhas. Produtos como colunas. O usuário preenche as quantidades e imprime por linha.

```
DATA: [17/03/2026]   [Subway] [Bob's] [10 Pasteis] ...

TOTAIS DO DIA →    75      7,2     4,8      1,4     18,6
NOTA       LOJA      ALFACE  CEB.ROXA  PEPINO  PIMENTÃO  TOMATE   AÇÕES
OC 00402   MUNDI       35                                          [Imprimir]
OC 00403   MANAUARA             3,4      2,4      1,4      6,4    [Imprimir]
```

**Comportamento:**
- Preços vigentes carregados automaticamente por loja
- Navegação por Tab, Enter, setas
- Autosave ao sair de cada célula
- Totais de coluna atualizam em tempo real
- [Imprimir] gera o documento de 2 vias

---

### 2. Documento de Impressão (2 vias)

HTML/CSS, A4 paisagem, 2 vias idênticas lado a lado.

- Cabeçalho: HENRIQUE + telefone + rede + loja, OC e data em caixas com borda
- Tabela: PRODUTO | Quantidade | Unidade | Valor | TOTAL
- Produtos sem quantidade: `-` na qtd e total, mantém preço
- Linhas em branco até completar espaço
- Rodapé: TOTAL em caixa + linha de assinatura
- Nome e telefone vêm da tabela `configuracoes`

---

### 3. Histórico

Filtros: período, rede, loja, OC. Colunas: DATA | REDE | LOJA | OC | TOTAL | AÇÕES. Excluir pede confirmação.

---

### 4. Relatório de Quinzena

Filtros: Rede | Loja | Mês | Quinzena (1ª: 1-15 / 2ª: 16-fim)

**Esquerda — Detalhe por pedido:**
data, OC, produto, qtd, preço, total, custo. Totais: VENDAS / CUSTO / MARGEM.

**Direita — Matriz para Nota Fiscal:**
data × produto = quantidade. Totais de quantidade, preço e valor por produto.

Exportação: PDF + Excel.

---

### 5. Relatório Financeiro

Filtros: mês, rede. Cards: RECEITA BRUTA, CUSTO PRODUTOS, MARGEM BRUTA (%), DESPESAS, LUCRO LÍQUIDO (%).

---

### 6. Despesas

CRUD inline (AG Grid). Colunas: data, categoria, descrição, rede, loja, valor. Totalizador no rodapé.

---

### 7. Cadastros

Sub-abas: Redes | Lojas | Produtos | Preços | Custos. Cada sub-aba é AG Grid editável inline.

---

### 8. Dashboard

- Vendas do dia / quinzena
- Despesas da quinzena
- Margem bruta e lucro líquido
- Top 5 lojas

---

## UX

- Tema claro padrão
- Cor da aba de rede na tela de Lançamentos
- Tab/Enter/setas na grade
- Autosave ao sair de célula
- Exportação PDF e Excel

---

## Seed Inicial

- Configurações: `nome_fornecedor = 'HENRIQUE'`, `telefone = '98127-2205'`
- Redes: Subway (verde #1a7a3a), Bob's (rosa #c0392b)
- Produtos Subway: Alface (UN), Cebola Roxa (KG), Pepino (KG), Pimentão (KG), Tomate (KG)
- Produtos Bob's: Alface USA (UN), Alface (UN), Cebola (KG), Cebola Roxa (KG), Tomate (KG), Repolho Branco (KG)

---

## Fora do escopo (MVP)

- Login / autenticação
- Sincronização em nuvem
- Controle de estoque
- NFe
- App mobile
