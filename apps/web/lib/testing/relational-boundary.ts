import type { SQL } from "drizzle-orm";
export async function relationalBoundary(boundary: { rows: Record<string, Record<string, unknown>[]> }) {
  const { getTableColumns, getTableName, is, SQL: SQLClass } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  function matches(row: Record<string, unknown>, predicate?: SQL) {
    if (!predicate) return true;
    const query = new PgDialect().sqlToQuery(predicate);
    const expression = query.sql.replace(/"\w+"\."(\w+)"/g, (_, column: string) => `row[${JSON.stringify(column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()))}]`).replace(/\$(\d+)/g, (_, index: string) => `parameters[${Number(index) - 1}]`).replace(/(row\["\w+"\]) in \(([^)]+)\)/g, "[$2].includes($1)").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/ is not null/g, " != null").replace(/ is null/g, " == null").replace(/ <> /g, " !== ").replace(/ = /g, " === ");
    // Timestamps compare as the ISO strings drizzle sends to the driver.
    const instant = (value: unknown) => value instanceof Date ? value.toISOString() : value;
    const view = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, instant(value)]));
    return Boolean(new Function("row", "parameters", `return ${expression}`)(view, query.params.map(instant)));
  }
  function builder(kind: string, table?: Parameters<typeof getTableName>[0], fields?: Record<string, { name: string }>) {
    let predicate: SQL | undefined; let values: Record<string, unknown>[] = []; let limit = Infinity; let skipConflicts = false;
    let upsert: { key: string; set: Record<string, unknown> } | undefined;
    const chain = {
      from(value: typeof table) { table = value; return chain; }, where(value: SQL) { predicate = value; return chain; },
      orderBy() { return chain; }, limit(value: number) { limit = value; return chain; }, returning() { return chain; },
      onConflictDoNothing() { skipConflicts = true; return chain; },
      // Models a single-column unique target (e.g. user_settings.user_id).
      onConflictDoUpdate({ target, set }: { target: { name: string }; set: Record<string, unknown> }) { upsert = { key: target.name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), set }; return chain; },
      set(value: Record<string, unknown>) { values = [value]; return chain; }, values(value: Record<string, unknown> | Record<string, unknown>[]) { values = Array.isArray(value) ? value : [value]; return chain; },
      then(resolve: (rows: Record<string, unknown>[]) => unknown, reject: (error: unknown) => unknown) {
        try {
          const key = getTableName(table!); const rows = boundary.rows[key] ??= [];
          let result = rows.filter(row => matches(row, predicate)).slice(0, limit);
          if (kind === "insert") {
            result = values.map((value, index) => ({ id: `new-${rows.length + index}`, priority: 4, ...value }));
            // onConflictDoNothing models a primary-key (id) conflict only.
            if (skipConflicts) result = result.filter(row => !rows.some(existing => existing.id === row.id));
            if (upsert) {
              const { key, set } = upsert;
              result = result.map(row => { const existing = rows.find(item => item[key] === row[key]); return existing ? Object.assign(existing, set) : (rows.push(row), row); });
            } else rows.push(...result);
          }
          if (kind === "update") {
            // As drizzle: unset columns with $onUpdate get a fresh value; a `sql` value
            // (a self-reference such as sql`${tasks.updatedAt}`) keeps the column as it was.
            const fresh = Object.fromEntries(Object.entries(getTableColumns(table!)).filter(([name, column]) => column.onUpdateFn && !(name in values[0])).map(([name, column]) => [name, column.onUpdateFn!()]));
            const set = Object.fromEntries(Object.entries(values[0]).filter(([, value]) => !is(value, SQLClass)));
            result.forEach(row => Object.assign(row, fresh, set));
          }
          if (kind === "delete") boundary.rows[key] = rows.filter(row => !result.includes(row));
          if (fields) result = result.map(row => Object.fromEntries(Object.entries(fields).map(([name, column]) => [name, row[column.name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())]])));
          return Promise.resolve(result).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    }; return chain;
  }
  // neon-http batch: one transaction, so a failing statement leaves every table as it was.
  async function batch(queries: PromiseLike<unknown>[]) {
    const snapshot = structuredClone(boundary.rows);
    try { const results = []; for (const query of queries) results.push(await query); return results; }
    catch (error) { boundary.rows = snapshot; throw error; }
  }
  return { db: { batch, select: (fields?: Record<string, { name: string }>) => builder("select", undefined, fields), insert: (table: Parameters<typeof getTableName>[0]) => builder("insert", table), update: (table: Parameters<typeof getTableName>[0]) => builder("update", table), delete: (table: Parameters<typeof getTableName>[0]) => builder("delete", table) } };

}
