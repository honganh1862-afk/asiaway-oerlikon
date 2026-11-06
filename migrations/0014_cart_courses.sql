-- Courses: a guest puts a dish in the first course (1. Gang) or the second
-- (2. Gang), so the staff enter the first now and hold the second in the POS.
-- Every line so far is a first course. The same dish may be in both, so the
-- course becomes part of the line's key.
ALTER TABLE table_cart_lines
  ADD COLUMN IF NOT EXISTS course smallint NOT NULL DEFAULT 1;

ALTER TABLE table_cart_lines
  DROP CONSTRAINT IF EXISTS table_cart_lines_course_valid;
ALTER TABLE table_cart_lines
  ADD CONSTRAINT table_cart_lines_course_valid CHECK (course IN (1, 2));

ALTER TABLE table_cart_lines DROP CONSTRAINT IF EXISTS table_cart_lines_pkey;
ALTER TABLE table_cart_lines ADD PRIMARY KEY (cart_id, menu_item_id, course);

-- Or the table wants everything served at once: no second course held back.
-- The courses of its lines are kept, so switching back restores them.
ALTER TABLE table_carts
  ADD COLUMN IF NOT EXISTS all_at_once boolean NOT NULL DEFAULT false;
