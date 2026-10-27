import { notesForSegment, overviewNotes, RESEARCH_FIXTURE, type ResearchSegment } from "@/lib/research/notes";

export function ResearchTips({ segment }: { segment?: ResearchSegment }) {
  const notes = segment ? notesForSegment(segment) : overviewNotes();
  if (notes.length === 0) return null;
  return (
    <article className="panel rounded-xl p-4">
      <h2 className="text-sm font-medium">知识卡</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        只摘录仓库里的公开标准与手册，不从对话里补论文。没有核对到 DOI 的条目写「未收录」。快照{" "}
        <span className="font-mono">{RESEARCH_FIXTURE.fixture_id}</span> · {RESEARCH_FIXTURE.curated_as_of}
      </p>
      <ul className="mt-3 space-y-3">
        {notes.map((note) => (
          <li key={note.id}>
            <div className="text-sm font-medium leading-6">{note.title}</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">
              {note.standard_id} · {note.year} · {note.doi ? `DOI ${note.doi}` : "DOI 未收录"}
              {note.status === "withdrawn" ? " · 已撤销" : ""}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{note.takeaway}</p>
            {note.url ? (
              <a
                className="mt-1 block break-all font-mono text-[11px] text-primary hover:underline"
                href={note.url}
                target="_blank"
                rel="noreferrer"
              >
                {note.url}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
