import { ActivityFeedEvent } from "../../types";
import { feedTags, formatClock } from "../../lib/format";

const LOUD: ActivityFeedEvent["type"][] = ["tournament_winner", "match_finished", "phase_started"];

export function ActivityFeed({ events, limit }: { events: ActivityFeedEvent[]; limit?: number }) {
  const shown = limit ? events.slice(0, limit) : events;
  return (
    <section className="rail-section" aria-label="Canlı akış">
      <header className="sheet-head sheet-head--small">
        <h2>Akış</h2>
      </header>
      {shown.length === 0 ? (
        <p className="empty-note">Maç sonuçları ve tur geçişleri burada akar.</p>
      ) : (
        <ol className="feed" aria-live="polite">
          {shown.map((event) => (
            <li className={`feed__item${LOUD.includes(event.type) ? " is-loud" : ""}`} key={event.id}>
              <time dateTime={event.timestamp}>{formatClock(event.timestamp)}</time>
              <p>
                <span className="feed__tag">{feedTags[event.type]}</span> {event.text}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
