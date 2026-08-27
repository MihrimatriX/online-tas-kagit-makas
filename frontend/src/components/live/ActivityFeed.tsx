import { ActivityFeedEvent } from "../../types";
import { feedTone, formatTime } from "../../lib/format";

interface ActivityFeedProps {
  events: ActivityFeedEvent[];
}

const eventMarks: Record<ActivityFeedEvent["type"], string> = {
  phase_waiting: "WAIT",
  phase_started: "LIVE",
  phase_paused: "PAUSE",
  phase_resumed: "RESUME",
  phase_completed: "DONE",
  phase_advanced: "NEXT",
  round_result: "ROUND",
  match_finished: "WIN",
  match_draw_round: "DRAW",
  bye_advance: "BYE",
  tournament_winner: "TITLE",
  admin_action: "ADMIN"
};

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <section className="panel feed-panel" aria-label="Canlı akış">
      <div className="panel-head">
        <span>Ne oldu?</span>
        <span className="live-dot" />
      </div>
      <div className="feed-list">
        {events.length === 0 ? (
          <div className="empty-state">Maç sonuçları burada akar.</div>
        ) : (
          events.map((event) => (
            <article className={`feed-item tone-${feedTone(event)}`} key={event.id}>
              <span className="feed-mark">{eventMarks[event.type]}</span>
              <p>{event.text}</p>
              <time>{formatTime(event.timestamp)}</time>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
