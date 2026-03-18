CREATE TABLE `configuracoes` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text
);
--> statement-breakpoint
CREATE TABLE `custos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`produto_id` integer,
	`custo_compra` real NOT NULL,
	`vigencia_inicio` text NOT NULL,
	`vigencia_fim` text,
	FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `despesas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` text NOT NULL,
	`categoria` text NOT NULL,
	`rede_id` integer,
	`loja_id` integer,
	`descricao` text,
	`valor` real NOT NULL,
	FOREIGN KEY (`rede_id`) REFERENCES `redes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loja_id`) REFERENCES `lojas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `itens_pedido` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pedido_id` integer,
	`produto_id` integer,
	`quantidade` real NOT NULL,
	`preco_unit` real NOT NULL,
	`custo_unit` real NOT NULL,
	FOREIGN KEY (`pedido_id`) REFERENCES `pedidos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lojas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rede_id` integer,
	`nome` text NOT NULL,
	`codigo` text,
	`ativo` integer DEFAULT 1,
	FOREIGN KEY (`rede_id`) REFERENCES `redes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `pedidos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rede_id` integer,
	`loja_id` integer,
	`data_pedido` text NOT NULL,
	`numero_oc` text NOT NULL,
	`observacoes` text,
	`criado_em` text DEFAULT (datetime('now')),
	FOREIGN KEY (`rede_id`) REFERENCES `redes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loja_id`) REFERENCES `lojas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pedidos_rede_id_loja_id_data_pedido_numero_oc_unique` ON `pedidos` (`rede_id`,`loja_id`,`data_pedido`,`numero_oc`);--> statement-breakpoint
CREATE TABLE `precos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`produto_id` integer,
	`loja_id` integer,
	`preco_venda` real NOT NULL,
	`vigencia_inicio` text NOT NULL,
	`vigencia_fim` text,
	FOREIGN KEY (`produto_id`) REFERENCES `produtos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`loja_id`) REFERENCES `lojas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `produtos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rede_id` integer,
	`nome` text NOT NULL,
	`unidade` text NOT NULL,
	`ordem_exibicao` integer DEFAULT 0,
	`ativo` integer DEFAULT 1,
	FOREIGN KEY (`rede_id`) REFERENCES `redes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `redes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`cor_tema` text,
	`ativo` integer DEFAULT 1
);
