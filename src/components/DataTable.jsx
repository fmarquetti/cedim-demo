export default function DataTable({ columns, rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {safeRows.length > 0 ? (
            safeRows.map((row, index) => (
              <tr key={index}>
                {Object.values(row).map((value, i) => (
                  <td key={i}>{value}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="table-empty-cell" colSpan={columns.length || 1}>
                No hay informacion para mostrar.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
