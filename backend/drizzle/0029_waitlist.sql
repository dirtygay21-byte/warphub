CREATE TABLE booking_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id integer NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  date varchar(10) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);
CREATE UNIQUE INDEX booking_waitlist_user_service_date_unique ON booking_waitlist(user_id, service_id, date);
CREATE INDEX booking_waitlist_service_date_index ON booking_waitlist(service_id, date);
