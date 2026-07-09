-- +goose Up
CREATE TABLE note_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  source_note_id  UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id  UUID REFERENCES notes(id) ON DELETE SET NULL,
  link_text       TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX note_links_source_idx ON note_links (user_id, source_note_id);
CREATE INDEX note_links_target_idx ON note_links (user_id, target_note_id);
CREATE UNIQUE INDEX note_links_source_text_uidx
  ON note_links (user_id, source_note_id, link_text);

-- +goose Down
DROP TABLE IF EXISTS note_links;
