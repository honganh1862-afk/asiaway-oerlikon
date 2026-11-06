-- One shared cart per table, which the staff see on their phones.
--
-- Every phone that scans a table's card adds to the same list; the staff can
-- add to it too (a guest ordering from the printed card), change it, and clear
-- the table once the guests have paid. A cleared cart is kept, with who cleared
-- it and when, and the table's next guests start a new one.
CREATE TABLE IF NOT EXISTS table_carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id    uuid NOT NULL REFERENCES restaurant_tables(id),
  opened_at   timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  cleared_at  timestamptz,
  cleared_by  text
);

-- At most one open cart per table.
CREATE UNIQUE INDEX IF NOT EXISTS table_carts_one_open
  ON table_carts (table_id) WHERE cleared_at IS NULL;

CREATE TABLE IF NOT EXISTS table_cart_lines (
  cart_id       uuid NOT NULL REFERENCES table_carts(id) ON DELETE CASCADE,
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id),
  -- 0 only for the instant between a decrement and the delete that follows it.
  quantity      integer NOT NULL CHECK (quantity BETWEEN 0 AND 99),
  -- 'guest', or the name of the member of staff who last changed the line.
  changed_by    text NOT NULL,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, menu_item_id)
);
