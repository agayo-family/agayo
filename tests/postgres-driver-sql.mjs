// PGlite's default parameter serializer is deliberately permissive for JSON
// strings. Production postgres.js serializes values after PostgreSQL describes
// their parameter OIDs. Use the installed driver's serializers so regressions
// involving JSON text, arrays and inferred types are exercised faithfully.
const { serializers } = await import(new URL('./types.js', import.meta.resolve('postgres')).href);

export function postgresDriverSql(pg) {
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
    return (await pg.query(query, values, { serializers })).rows;
  };
  sql.begin = callback => pg.transaction(tx => callback(postgresDriverSql(tx)));
  sql.unsafe = statement => pg.exec(statement);
  return sql;
}
