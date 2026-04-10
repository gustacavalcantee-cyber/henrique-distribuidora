# Design: Lista de Preços + Busca em Lançamentos

**Data:** 2026-04-10

---

## Resumo

Duas funcionalidades:
1. **Lista de Preços** — nova página para montar e enviar listas de preço para clientes, como imagem (WhatsApp) ou impressão.
2. **Busca em Lançamentos** — campo de filtro na página de Lançamentos para localizar produtos rapidamente.

---

## 1. Navegação

- Novo item `Lista de Preços` no `Sidebar.tsx`, com ícone `Tag` (lucide-react)
- Posição: entre Histórico e Relatórios
- Nova rota `/lista-precos` no `App.tsx`
- Novo componente: `src/renderer/src/pages/ListaPrecos.tsx`

---

## 2. Página de Edição (`ListaPrecos.tsx`)

### Layout
- **Barra superior**: campo de busca/filtro por nome + botão `+ Novo produto`
- **Tabela única**: todos os produtos do cadastro
  - Colunas: `[toggle] [Produto] [Unidade] [Preço]`
  - Linha cinza: produto desmarcado — preço exibido, não editável
  - Linha verde: produto marcado — preço editável em campo inline
- **Rodapé da tabela**: botões `📷 Gerar Imagem` e `🖨️ Imprimir`

### Comportamento
- Abre com todos os produtos carregados do cadastro e preços vigentes (`precos` table)
- Preços editados são apenas locais (não alteram o cadastro)
- Toggle inclui/exclui produto da lista gerada
- Busca filtra a tabela em tempo real por nome do produto

### Modal "Novo produto"
- Campos: Nome, Unidade (select: KG, SC, CX, UN, FD, etc.), Preço
- Salva permanentemente no cadastro via `produtos:create`
- Após salvar, produto aparece na tabela já marcado com o preço informado

---

## 3. Backend

### Novos IPC channels
| Canal | Descrição |
|---|---|
| `lista-precos:getImage` | Gera HTML da lista e captura screenshot (retorna base64 PNG) |
| `lista-precos:print` | Abre janela de preview com botão imprimir |

### Novo serviço
`src/main/services/lista-precos.service.ts`
- `generateListaPrecosHtml(data: ListaPrecosData): string` — gera o HTML da imagem
- Logo lido de `src/renderer/src/assets/logo.png` e convertido para base64 para embutir no HTML

### IPC channels reutilizados (sem alteração)
- `produtos:list` — carrega produtos
- `precos:list` — carrega preços vigentes
- `produtos:create` — salva novo produto
- `config:get` — busca `nome_fornecedor`

### Tipo de dados
```typescript
interface ListaPrecosData {
  nomeEmpresa: string        // de config 'nome_fornecedor'
  logoBase64: string         // logo.png em base64
  itens: Array<{
    nome: string
    unidade: string
    preco: number
  }>
}
```

---

## 4. Design da Imagem Gerada

### Visual (opção C aprovada)
- **Fundo**: branco
- **Marca d'água**: nome da empresa diagonal centralizado, opacidade ~4%
- **Cabeçalho**: nome da empresa (esquerda) + linha verde embaixo + logo PNG real redondo (canto superior direito, ~32px)
- **Tabela**: colunas Produto / Unidade / Preço; linhas alternadas com fundo levemente verde (`rgba(16,185,129,0.04)`)
- **Rodapé fixo**: *"Preços sujeitos a alteração sem aviso prévio"*
- **Formato**: retrato, largura 400px (otimizado para WhatsApp/celular)

### Geração
- Usa `BrowserWindow` oculto (igual ao `nota:getImage`)
- Captura screenshot e retorna como base64 PNG
- Frontend exibe modal com preview + botão "Copiar imagem" + botão "Salvar arquivo"

---

## 5. Busca em Lançamentos

### Comportamento
- Campo de busca de texto adicionado ao header da página `Lancamentos.tsx`
- Filtra as **colunas de produto** visíveis na grade em tempo real
- Produtos que não correspondem ao filtro ficam ocultos (colunas)
- Limpar o campo restaura todas as colunas
- Não afeta os dados, apenas a visualização

### Implementação
- Estado local `prodSearch` em `Lancamentos.tsx`
- Filtro aplicado sobre `visibleProdutos` antes de renderizar as colunas
- Campo de busca no `LancamentosHeader` (componente já existente)

---

## Fora do Escopo

- Salvar/reutilizar listas de preço anteriores (sem histórico)
- Envio direto por WhatsApp (usuário copia/salva e envia manualmente)
- Editar preços no cadastro a partir desta tela
