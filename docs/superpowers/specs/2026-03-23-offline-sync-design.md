# Design: Suporte Offline com Resolução de Conflitos

**Data:** 2026-03-23
**Status:** Aprovado

---

## Problema

O app desktop agora usa Supabase (PostgreSQL cloud) como banco de dados. Quando o usuário fica sem internet, o app para de funcionar — não é possível lançar pedidos offline.

O usuário precisa continuar lançando pedidos sem internet e, ao reconectar, resolver manualmente conflitos com mudanças feitas no celular durante o mesmo período.

---

## Solução

**SQLite local como primário, Supabase como espelho sincronizado.**

Todas as leituras e escritas vão para o SQLite local primeiro. O app nunca fica bloqueado por falta de conexão. Um Sync Service em background sincroniza com o Supabase quando online e detecta conflitos.

---

## Arquitetura

```
Ação do usuário
      ↓
  SQLite local  ←── sempre funciona (online ou offline)
      ↓ (em background, quando online)
  Sync Service
      ↓        ↑
  Supabase ←──→ Realtime (notifica mudanças remotas)
```

### Fluxo de dados

- **Todas as operações** (leitura e escrita) usam o SQLite local via `client.ts` / Drizzle SQLite
- O **Sync Service** monitora a conexão de rede continuamente
- Quando online: sincroniza bidireccionalmente (local → Supabase e Supabase → local)
- Quando detecta conflito: emite evento `IPC.SYNC_CONFLICT` para o renderer

---

## Banco de Dados

### Campos adicionados a todas as tabelas principais

```sql
updated_at  TEXT  -- ISO timestamp da última modificação
device_id   TEXT  -- identificador do dispositivo que modificou
synced      INTEGER DEFAULT 0  -- 0 = pendente, 1 = sincronizado
```

Tabelas afetadas: `redes`, `franqueados`, `lojas`, `produtos`, `pedidos`, `itens_pedido`, `precos`, `custos`, `despesas`, `configuracoes`

### Tabela de controle de sync

```sql
CREATE TABLE sync_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
-- Exemplo: key='last_synced_at', value='2026-03-23T14:00:00Z'
-- Exemplo: key='device_id', value='desktop-<uuid>'
```

---

## Detecção de Conflitos

| Situação | Ação |
|---|---|
| Só local mudou após `last_synced_at` | Push para Supabase automaticamente |
| Só remoto mudou após `last_synced_at` | Pull para local automaticamente |
| **Ambos mudaram após `last_synced_at`** | **Conflito — abre painel de resolução** |
| Nenhum mudou | Nada a fazer |

### Conflitos por tabela

- **`pedidos` + `itens_pedido`**: conflito manual — usuário escolhe item a item
- **Cadastros** (`produtos`, `lojas`, `redes`, etc.): remoto prevalece automaticamente
- **`despesas`**: remoto prevalece automaticamente

### Identificação de pedidos conflitantes

Dois pedidos são considerados o "mesmo pedido" quando têm `numero_oc` + `loja_id` + `data_pedido` iguais mas foram criados em devices diferentes.

---

## Sync Service (`src/main/sync/sync.service.ts`)

```typescript
// Responsabilidades:
// 1. Monitorar conectividade de rede
// 2. Ao reconectar: executar ciclo de sync
// 3. Detectar conflitos e notificar renderer
// 4. Escutar Supabase Realtime para pulls em tempo real

interface SyncCycle {
  push(): Promise<void>   // local → Supabase (registros com synced=0)
  pull(): Promise<void>   // Supabase → local (registros remotos mais novos)
  detectConflicts(): Promise<Conflict[]>
}
```

---

## Painel de Resolução de Conflitos

### Trigger

Banner na sidebar ao reconectar com conflitos:
> ⚠️ **2 pedidos com conflito** — Clique para resolver

### Modal de resolução

Para cada pedido conflitante, exibe uma tabela comparativa por item:

```
OC 1042 — Subway Jardim América — 15/03/2026

PRODUTO          │ DESKTOP (offline)  │ CELULAR (online)   │ MANTER
─────────────────┼────────────────────┼────────────────────┼────────
Alface           │ 12 UN              │ 10 UN              │ ◉ Desktop  ○ Celular
Pepino           │ —                  │ 5 KG               │ ○ Desktop  ◉ Celular
Cebola Roxa      │ 3 KG               │ —                  │ ◉ Desktop  ○ Celular
─────────────────┴────────────────────┴────────────────────┴────────
                          [ Aplicar Seleção ]   [ Ignorar ]
```

- Itens iguais nos dois lados são omitidos
- Padrão sugerido: lado com quantidade preenchida (vs vazia)
- **Aplicar Seleção**: salva no SQLite local e envia versão mesclada para Supabase
- **Ignorar**: mantém local como está, marca conflito como "pendente"

---

## Indicadores na UI

| Estado | Indicador na Sidebar |
|---|---|
| Online, tudo sincronizado | nenhum |
| Online, sincronizando | 🔄 Sincronizando... |
| Offline | 🔴 Sem conexão — dados locais |
| Conflito detectado | ⚠️ X pedidos com conflito |

---

## O que NÃO muda

- A camada de handlers IPC continua idêntica para o renderer
- O schema PostgreSQL no Supabase permanece igual (apenas `updated_at` e `device_id` são adicionados)
- O Realtime do Supabase continua funcionando para sync em tempo real quando online

---

## Fora do escopo

- Conflitos em relatórios (somente leitura)
- Histórico de conflitos resolvidos
- Notificação push no celular sobre conflitos
