import postgres from 'postgres'

const sql = postgres(process.env['DATABASE_URL']!)

async function clear() {
  await sql`SET session_replication_role = 'replica'`
  for (const t of ['despesas','custos','precos','itens_pedido','pedidos','configuracoes','produtos','lojas','franqueados','redes']) {
    await sql`TRUNCATE TABLE ${sql(t)} RESTART IDENTITY CASCADE`
    console.log('cleared:', t)
  }
  await sql`SET session_replication_role = 'origin'`
  await sql.end()
  console.log('done')
}

clear().catch(e => { console.error(e); process.exit(1) })
