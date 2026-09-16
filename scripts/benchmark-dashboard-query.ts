import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local', quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not configured');
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 2 });

  const accounts = await sql<{
  suffix: string;
  executions: number;
  trade_groups: number;
  first_day: string | null;
  latest_day: string | null;
  }[]>`
  select
    right(a.client_account_id, 4) as suffix,
    (
      select count(*)::int
      from execution e
      where e.account_id = a.id and e.deleted_at is null
    ) as executions,
    (
      select count(*)::int
      from trade_group g
      where g.account_id = a.id and g.deleted_at is null
    ) as trade_groups,
    (
      select min(g.trading_day)
      from trade_group g
      where g.account_id = a.id and g.deleted_at is null
    ) as first_day,
    (
      select max(g.trading_day)
      from trade_group g
      where g.account_id = a.id and g.deleted_at is null
    ) as latest_day
  from trading_account a
  order by executions desc
  limit 10
`;

  console.log(JSON.stringify(accounts));

  for (const account of accounts) {
    if (!account.latest_day) continue;
    const startedAt = performance.now();
    const rows = await sql`
    select
      g.trading_day,
      g.net_pnl,
      g.is_open,
      g.opened_date,
      g.opened_time,
      g.closed_date,
      g.closed_time
    from trade_group g
    inner join trading_account a on a.id = g.account_id
    where right(a.client_account_id, 4) = ${account.suffix}
      and g.deleted_at is null
      and g.trading_day >= to_char(
        to_date(${account.latest_day}, 'YYYYMMDD') - interval '29 days',
        'YYYYMMDD'
      )
      and g.trading_day <= ${account.latest_day}
  `;
    console.log(JSON.stringify({
      suffix: account.suffix,
      rangeRows: rows.length,
      rangeQueryMs: Number((performance.now() - startedAt).toFixed(2)),
    }));
  }

  await sql.end();
}

void main();
