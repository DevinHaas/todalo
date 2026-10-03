import type { SQL } from "drizzle-orm";
export async function relationalBoundary(boundary: { rows: Record<string, Record<string, unknown>[]> }) {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  function matches(row: Record<string, unknown>, predicate?: SQL) {
    if (!predicate) return true;
    const query = new PgDialect().sqlToQuery(predicate);
    const expression = query.sql.replace(/"\w+"\."(\w+)"/g, (_, column: string) => `row[${JSON.stringify(column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()))}]`).replace(/\$(\d+)/g, (_, index: string) => `parameters[${Number(index) - 1}]`).replace(/(row\["\w+"\]) in \(([^)]+)\)/g, "[$2].includes($1)").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||").replace(/ = /g, " === ");
    return Boolean(new Function("row", "parameters", `return ${expression}`)(row, query.params));
  }
  function builder(kind: string, table?: Parameters<typeof getTableName>[0], fields?: Record<string, { name: string }>) {
    let predicate: SQL | undefined; let values: Record<string, unknown>[] = []; let limit = Infinity;
    const chain = {
      from(value: typeof table) { table = value; return chain; }, where(value: SQL) { predicate = value; return chain; },
      orderBy() { return chain; }, limit(value: number) { limit = value; return chain; }, returning() { return chain; },
      set(value: Record<string, unknown>) { values = [value]; return chain; }, values(value: Record<string, unknown> | Record<string, unknown>[]) { values = Array.isArray(value) ? value : [value]; return chain; },
      then(resolve: (rows: Record<string, unknown>[]) => unknown, reject: (error: unknown) => unknown) {
        try {
          const key = getTableName(table!); const rows = boundary.rows[key] ??= [];
          let result = rows.filter(row => matches(row, predicate)).slice(0, limit);
          if (kind === "insert") { result = values.map((value, index) => ({ id: `new-${rows.length + index}`, priority: 4, ...value })); rows.push(...result); }
          if (kind === "update") result.forEach(row => Object.assign(row, values[0]));
          if (kind === "delete") boundary.rows[key] = rows.filter(row => !result.includes(row));
          if (fields) result = result.map(row => Object.fromEntries(Object.entries(fields).map(([name, column]) => [name, row[column.name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())]])));
          return Promise.resolve(result).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    }; return chain;
  }
  return { db: { select: (fields?: Record<string, { name: string }>) => builder("select", undefined, fields), insert: (table: Parameters<typeof getTableName>[0]) => builder("insert", table), update: (table: Parameters<typeof getTableName>[0]) => builder("update", table), delete: (table: Parameters<typeof getTableName>[0]) => builder("delete", table) } };

}
