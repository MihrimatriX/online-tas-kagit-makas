import { AdminAction } from "../../types";
import { formatTime } from "../../lib/format";

interface AdminActionLogProps {
  actions: AdminAction[];
}

export function AdminActionLog({ actions }: AdminActionLogProps) {
  return (
    <section className="panel">
      <div className="panel-head">
        <span>İşlemler</span>
        <span>{actions.length}</span>
      </div>
      <div className="admin-log-list">
        {actions.length === 0 ? (
          <div className="empty-state compact">Henüz işlem yok.</div>
        ) : (
          actions.map((action) => (
            <article className="admin-log-item" key={action.id}>
              <strong>{action.actionType}</strong>
              <time>{formatTime(action.createdAt)}</time>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
