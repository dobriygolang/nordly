-- +goose Up
ALTER TABLE work_tasks
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT;

-- Legacy rows did not record the containing calendar, so retaining their event
-- id would make future patch/delete calls target a guessed calendar. Clear that
-- unresolvable link explicitly instead.
UPDATE work_tasks
SET google_event_id = NULL,
    conference_url = CASE WHEN conference_provider = 'meet' THEN NULL ELSE conference_url END,
    conference_provider = CASE WHEN conference_provider = 'meet' THEN NULL ELSE conference_provider END,
    updated_at = now()
WHERE google_event_id IS NOT NULL;

ALTER TABLE work_tasks
  ADD CONSTRAINT work_tasks_google_event_ref_pair_chk CHECK (
    (google_event_id IS NULL AND google_calendar_id IS NULL)
    OR (
      google_event_id IS NOT NULL
      AND btrim(google_event_id) <> ''
      AND google_calendar_id IS NOT NULL
      AND btrim(google_calendar_id) <> ''
    )
  ),
  ADD CONSTRAINT work_tasks_single_conference_ref_chk CHECK (
    google_event_id IS NULL OR zoom_meeting_id IS NULL
  );

-- 00001 already created the equivalent idx_epics_user_name_active index.
-- Drop only the later duplicate so already-applied databases converge safely.
DROP INDEX IF EXISTS epics_user_name_active_uidx;

-- +goose Down
CREATE UNIQUE INDEX IF NOT EXISTS epics_user_name_active_uidx
  ON epics(user_id, lower(name))
  WHERE archived_at IS NULL;

ALTER TABLE work_tasks
  DROP CONSTRAINT work_tasks_single_conference_ref_chk,
  DROP CONSTRAINT work_tasks_google_event_ref_pair_chk,
  DROP COLUMN zoom_meeting_id,
  DROP COLUMN google_calendar_id;
