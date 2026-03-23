# Design: Migração para Supabase + App Mobile Expo

**Data:** 2026-03-23
**Status:** Aprovado

---

## Problema

O app desktop atual usa SQLite sincronizado via Google Drive, o que causa:
- Conflitos quando duas máquinas editam ao mesmo tempo
- Lentidão na sincronização entre máquinas
- Impossibilidade de acesso pelo celular/tablet

---

## Solução

Dois projetos independentes executados em sequência:

- **Fase 1:** Migrar o desktop Electron de SQLite/Google Drive para Supabase
- **Fase 2:** Construir app mobile iOS/Android com Expo

---

## Arquitetura

```
┌─────────────────────┐     ┌─────────────────────┐
│   Desktop (Electron) │     │  Mobile (Expo)       │
│   Windows / Mac      │     │  iOS / Android       │
│                      │     │                      │
│  React + Tailwind    │     │  React Native        │
│  @supabase/supabase-js│    │  NativeWind          │
└──────────┬───────────┘     └──────────┬───────────┘
           │                            │
           └──────────┬─────────────────┘
                      ▼
             ┌─────────────────┐
             │    Supabase     │
             │  PostgreSQL     │
             │  Auth + Realtime│
             │  Plano gratuito │
             └─────────────────┘
```

---

## Fase 1 — Desktop Electron → Supabase

### Banco de Dados

- Criar projeto Supabase (supabase.com, plano free)
- Recriar schema atual (SQLite → PostgreSQL) — mesmas tabelas:
  `redes`, `franqueados`, `lojas`, `produtos`, `pedidos`, `itens_pedido`, `precos`, `custos`, `despesas`
- Script de migração: exportar `henrique.db` e importar no Supabase sem perda de dados
- Row Level Security (RLS): apenas usuários autenticados leem/escrevem

### Autenticação

- Supabase Auth com e-mail + senha
- Primeira execução: tela de login simples
- Sessão persistida localmente — não pede login a cada abertura
- Uma única conta (do Henrique) — sem múltiplos usuários por ora

### Camada de Dados no Desktop

| Antes | Depois |
|---|---|
| `better-sqlite3` + Drizzle SQLite | `@supabase/supabase-js` |
| Handlers IPC síncronos com `db.prepare().all()` | Handlers IPC assíncronos com `supabase.from().select()` |
| `getDbPath()`, `reloadDb()` | `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` |
| Watcher de arquivo `.db` a cada 8s | Supabase Realtime |

### Realtime (substitui Google Drive watcher)

- Supabase Realtime notifica o desktop instantaneamente quando outro dispositivo altera dados
- O banner "Novos dados disponíveis" da sidebar é substituído por atualização silenciosa
- Sem polling, sem reload forçado de página

### Variáveis de Ambiente

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

Embutidas no executável empacotado — usuário final não configura nada.

### O que desaparece

- Google Drive como banco de dados
- `henrique.db` local
- Watcher de arquivo a cada 8 segundos
- Risco de conflito/corrupção do banco
- Banner "Novos dados disponíveis — clique para atualizar"

---

## Fase 2 — App Mobile Expo

### Tecnologias

- **Expo SDK** — compila para iOS e Android com um só código TypeScript/React Native
- **NativeWind** — Tailwind CSS para React Native, visual consistente com o desktop
- **@supabase/supabase-js** — mesmo cliente usado no desktop
- **Expo Go** — testes no celular via QR code, sem App Store

### Telas

```
Login
└── Home (Dashboard — resumo do dia)
    ├── Lançamentos
    │   ├── Selecionar rede → loja → data
    │   ├── Digitar quantidades por produto (teclado numérico)
    │   └── Confirmar e salvar pedido
    ├── Histórico
    │   ├── Lista de notas com filtro de data/rede
    │   └── Detalhe da nota com itens
    ├── Relatórios
    │   ├── Financeiro (cards + notas em aberto)
    │   ├── Quinzena
    │   ├── Cobrança
    │   ├── Por Produto
    │   └── Preço × Custo
    ├── Despesas
    └── Cadastros (redes, lojas, produtos, franqueados)
```

### Compartilhamento de Código

- Queries e lógica de negócio extraídas para um pacote `/packages/core` compartilhado
- Apenas as camadas de UI são diferentes (React vs React Native)

### Distribuição

- **Fase de testes:** Expo Go (QR code no celular, sem App Store)
- **Produção:** Build com EAS (Expo Application Services) → App Store + Play Store

---

## Plano de Execução

### Fase 1 (Desktop → Supabase)
1. Criar projeto Supabase e configurar schema PostgreSQL
2. Escrever e executar script de migração dos dados existentes
3. Substituir camada de dados no Electron (Drizzle SQLite → Supabase client)
4. Adicionar tela de login no desktop
5. Configurar Supabase Realtime no desktop
6. Remover todo o código do watcher Google Drive
7. Empacotar e publicar nova versão

### Fase 2 (Mobile Expo)
1. Criar projeto Expo com NativeWind e Supabase client
2. Tela de Login
3. Lançamentos (prioridade — uso mais frequente no celular)
4. Histórico e detalhe de notas
5. Relatórios
6. Despesas e Cadastros
7. Testes via Expo Go
8. Build e publicação nas lojas

---

## Custo

| Serviço | Plano | Custo |
|---|---|---|
| Supabase | Free | R$ 0/mês |
| Expo | Free (Expo Go + EAS builds limitados) | R$ 0/mês |
| App Store (iOS) | Apple Developer Program | ~R$ 550/ano |
| Play Store (Android) | Taxa única | ~R$ 130 |

> Para fase inicial de testes via Expo Go: custo zero.
