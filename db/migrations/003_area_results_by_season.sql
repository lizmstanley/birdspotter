-- Results received are tracked per season. A row means the area's results arrived that season.
CREATE TABLE public.area_results (
    circle_code  TEXT NOT NULL,
    count_year   SMALLINT NOT NULL,
    area_code    TEXT NOT NULL,
    PRIMARY KEY (circle_code, count_year, area_code),
    FOREIGN KEY (circle_code, count_year)
        REFERENCES public.count_years(circle_code, year) ON DELETE CASCADE,
    FOREIGN KEY (circle_code, area_code)
        REFERENCES public.areas(circle_code, code) ON DELETE CASCADE
);

INSERT INTO public.area_results (circle_code, count_year, area_code)
SELECT a.circle_code, cy.year, a.code
FROM public.areas a
JOIN public.count_years cy ON cy.circle_code = a.circle_code AND cy.is_current
WHERE a.results_received;

ALTER TABLE public.areas DROP COLUMN results_received;
