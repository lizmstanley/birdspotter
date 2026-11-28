-- One row per party: one phone in CBC Scout, or one paper report. Area totals are summed from these rows.
-- A party from CBC Scout keeps its party code's ID, so saving it again replaces the row.
CREATE TABLE public.parties (
    circle_code   TEXT NOT NULL,
    count_year    SMALLINT NOT NULL,
    party_id      TEXT NOT NULL CHECK (char_length(party_id) BETWEEN 1 AND 64),
    area_code     TEXT NOT NULL,
    start_time    TIMESTAMPTZ NOT NULL,
    stop_time     TIMESTAMPTZ NOT NULL,
    participants  INTEGER NOT NULL CHECK (participants >= 1),
    car_hours     NUMERIC(7, 2) NOT NULL CHECK (car_hours >= 0),
    foot_hours    NUMERIC(7, 2) NOT NULL CHECK (foot_hours >= 0),
    feeder_hours  NUMERIC(7, 2) NOT NULL CHECK (feeder_hours >= 0),
    car_miles     NUMERIC(7, 2) NOT NULL CHECK (car_miles >= 0),
    foot_miles    NUMERIC(7, 2) NOT NULL CHECK (foot_miles >= 0),
    PRIMARY KEY (circle_code, count_year, party_id),
    CHECK (stop_time >= start_time),
    FOREIGN KEY (circle_code, count_year)
        REFERENCES public.count_years(circle_code, year) ON DELETE CASCADE,
    FOREIGN KEY (circle_code, area_code)
        REFERENCES public.areas(circle_code, code) ON DELETE CASCADE
);

CREATE INDEX idx_parties_area ON public.parties (circle_code, area_code);
