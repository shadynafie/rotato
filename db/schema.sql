-- Rota Manager schema (PostgreSQL)
-- Use: psql -f db/schema.sql

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role = 'admin')
);

CREATE TABLE clinicians (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('consultant','registrar')),
  email TEXT,
  notify_email BOOLEAN NOT NULL DEFAULT true,
  notify_whatsapp BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clinicians_role_idx ON clinicians(role) WHERE active = true;

CREATE TABLE duties_catalog (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_plan_weeks (
  id SERIAL PRIMARY KEY,
  clinician_id INT NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  week_no SMALLINT NOT NULL CHECK (week_no BETWEEN 1 AND 5),
  am_duty_id INT REFERENCES duties_catalog(id),
  pm_duty_id INT REFERENCES duties_catalog(id),
  notes TEXT,
  UNIQUE (clinician_id, week_no)
);

-- On-call cycle definition
CREATE TABLE oncall_cycles (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('consultant','registrar')),
  cycle_length SMALLINT NOT NULL CHECK (cycle_length > 0),
  position SMALLINT NOT NULL CHECK (position > 0),
  clinician_id INT NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  UNIQUE (role, position)
);

CREATE TABLE rota_entries (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  clinician_id INT NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  session TEXT NOT NULL CHECK (session IN ('AM','PM','FULL')),
  duty_id INT REFERENCES duties_catalog(id),
  is_oncall BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL CHECK (source IN ('jobplan','oncall','manual','leave')),
  note TEXT,
  created_by INT REFERENCES users(id),
  updated_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, clinician_id, session)
);
CREATE INDEX rota_entries_date_idx ON rota_entries(date);
CREATE INDEX rota_entries_oncall_idx ON rota_entries(date, is_oncall);

CREATE TABLE leaves (
  id SERIAL PRIMARY KEY,
  clinician_id INT NOT NULL REFERENCES clinicians(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('AM','PM','FULL')),
  type TEXT NOT NULL CHECK (type IN ('annual','study','sick','professional')),
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinician_id, date, session)
);
CREATE INDEX leaves_date_idx ON leaves(date);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  clinician_id INT REFERENCES clinicians(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp_stub')),
  type TEXT NOT NULL CHECK (type IN ('change','digest','test')),
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  actor_user_id INT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INT,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log(entity, entity_id);

-- Token for public sharing and iCal feeds
CREATE TABLE share_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- Convenience view combining rota entries with clinicians and duties
CREATE VIEW rota_view AS
SELECT r.date, r.session, r.is_oncall, r.source, r.note,
       c.id AS clinician_id, c.name AS clinician_name, c.role AS clinician_role,
       d.id AS duty_id, d.name AS duty_name, d.color AS duty_color
FROM rota_entries r
JOIN clinicians c ON c.id = r.clinician_id
LEFT JOIN duties_catalog d ON d.id = r.duty_id;

