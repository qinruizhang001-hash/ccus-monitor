import fixtureJson from "../../content/ccus-research-notes.json" with { type: "json" };

export type ResearchSegment = "capture" | "transport" | "storage" | "mva";

export type ResearchNote = {
  id: string;
  title: string;
  year: number;
  standard_id: string;
  doi: string | null;
  url: string | null;
  segments: ResearchSegment[];
  themes: string[];
  status?: string;
  takeaway: string;
};

export type ResearchFixture = {
  fixture_id: string;
  curated_as_of: string;
  source: string;
  notes: ResearchNote[];
};

export const RESEARCH_FIXTURE = fixtureJson as ResearchFixture;

export function notesForSegment(segment: ResearchSegment) {
  const matched = RESEARCH_FIXTURE.notes.filter((note) => note.segments.includes(segment));
  const primary = matched.filter((note) => note.segments[0] === segment);
  const rest = matched.filter((note) => note.segments[0] !== segment);
  return [...primary, ...rest].slice(0, 2);
}

export function overviewNotes() {
  const storage = RESEARCH_FIXTURE.notes.find((note) => note.id === "iso-27914-2026");
  const mva = RESEARCH_FIXTURE.notes.find((note) => note.id === "spe-225861-ms");
  return [storage, mva].filter((note): note is ResearchNote => Boolean(note));
}

export function selectResearchNotes(input?: { segment?: string; id?: string; query?: string }) {
  let notes = RESEARCH_FIXTURE.notes.slice();
  const id = input?.id?.trim().toLowerCase();
  if (id) {
    notes = notes.filter((note) => note.id.toLowerCase() === id || note.standard_id.toLowerCase() === id);
  }
  if (input?.segment) {
    notes = notes.filter((note) => note.segments.includes(input.segment as ResearchSegment));
  }
  const query = input?.query?.trim().toLowerCase();
  if (query) {
    notes = notes.filter((note) =>
      [note.id, note.title, note.standard_id, note.takeaway, note.status ?? "", ...note.themes]
        .join("\n")
        .toLowerCase()
        .includes(query),
    );
  }
  return notes;
}
