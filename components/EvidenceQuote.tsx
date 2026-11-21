export function EvidenceQuote({ text, author, time }: { text: string; author?: string; time?: string }) {
  return (
    <figure className="border-l-2 border-accent pl-4">
      <blockquote className="break-words text-ink">“{text}”</blockquote>
      {(author || time) && (
        <figcaption className="mt-1 text-sm text-muted">
          {author}
          {author && time && " · "}
          {time && <span className="tabular">{time}</span>}
        </figcaption>
      )}
    </figure>
  );
}
