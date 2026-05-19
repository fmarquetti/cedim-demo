export default function StatCard({ title, value, detail, icon, dataTour }) {
  return (
    <div className="stat-card" data-tour={dataTour}>
      <div className="stat-icon">{icon}</div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
