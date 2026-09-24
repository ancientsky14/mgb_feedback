-- Excluding a response from reports: staff tests, spam, duplicates. The row stays (responses
-- are official records and cannot be deleted); every report query filters excluded_at IS NULL.
-- The reasons mirror EXCLUSION_REASONS in packages/shared/src/constants.ts.

ALTER TABLE responses ADD COLUMN excluded_at TEXT;
ALTER TABLE responses ADD COLUMN excluded_by TEXT;
ALTER TABLE responses ADD COLUMN excluded_reason TEXT
  CHECK (excluded_reason IN ('staff_test', 'spam', 'duplicate', 'other'));
ALTER TABLE responses ADD COLUMN excluded_note TEXT CHECK (length(excluded_note) <= 200);

-- The four fields go together: all set (excluded) or all empty (included).
CREATE TRIGGER responses_exclusion_complete
BEFORE UPDATE OF excluded_at, excluded_by, excluded_reason, excluded_note ON responses
WHEN NOT (
  (NEW.excluded_at IS NOT NULL AND NEW.excluded_by IS NOT NULL AND NEW.excluded_reason IS NOT NULL)
  OR (NEW.excluded_at IS NULL AND NEW.excluded_by IS NULL AND NEW.excluded_reason IS NULL AND NEW.excluded_note IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'an exclusion needs its time, author and reason, or none of them');
END;

CREATE INDEX responses_included_by_date ON responses (transaction_date) WHERE excluded_at IS NULL;
