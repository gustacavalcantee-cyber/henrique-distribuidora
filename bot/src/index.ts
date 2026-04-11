import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.join(__dirname, '../.env') })

import { Bot } from 'grammy'
import { handleResumo } from './commands/resumo'
import { handlePedidos } from './commands/pedidos'
import { handleQuinzena } from './commands/quinzena'
import { handlePrecos } from './commands/precos'

const token = process.env.TELEGRAM_TOKEN
const allowedChatId = process.env.ALLOWED_CHAT_ID
if (!token) throw new Error('Missing TELEGRAM_TOKEN in bot/.env')
if (!allowedChatId || allowedChatId === 'PLACEHOLDER') throw new Error('Missing ALLOWED_CHAT_ID in bot/.env — get it from @userinfobot')

const bot = new Bot(token)

// Auth middleware — only owner can use the bot
bot.use(async (ctx, next) => {
  if (String(ctx.chat?.id) !== allowedChatId) {
    await ctx.reply('⛔ Acesso negado.')
    return
  }
  await next()
})

bot.command('start', ctx =>
  ctx.reply('Olá! Use /ajuda para ver os comandos disponíveis.'))

bot.command('ajuda', ctx =>
  ctx.reply(
    `*Comandos disponíveis:*\n\n` +
    `/resumo — Financeiro do mês atual\n` +
    `/quinzena 1 — Quinzena 1 do mês atual\n` +
    `/quinzena 2 — Quinzena 2 do mês atual\n` +
    `/quinzena 1 04 2026 — Quinzena específica\n` +
    `/pedidos — Pedidos de hoje\n` +
    `/pedidos Mundi — Pedidos da loja (últimos 7 dias)\n` +
    `/pedidos Mundi 10/04/2026 — Pedidos em data específica\n` +
    `/precos — Gera e envia a Lista de Preços`,
    { parse_mode: 'Markdown' }
  ))

bot.command('resumo', handleResumo)
bot.command('quinzena', handleQuinzena)
bot.command('pedidos', handlePedidos)
bot.command('precos', handlePrecos)

bot.start()
console.log('✅ Bot iniciado.')
