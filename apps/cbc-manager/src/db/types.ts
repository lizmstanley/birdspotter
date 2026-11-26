export interface SavedCircle {
  code: string;
  name: string;
  state_province: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
  is_favorite: boolean;
  is_active: boolean;
  compiler_name: string | null;
  compiler_email: string | null;
  count_date: string | null;
  audubon_url: string | null;
  current_year: number | null;
}

export interface AssignmentRow {
  circle_code: string;
  participation_id: number;
  person_id: number;
  area: string | null;
  cities: string | null;
  full_name: string;
  email: string | null;
  rsvp_status: string;
  counter_type: string | null;
  is_area_leader: boolean;
  companions: string | null;
  active_notes: string;
  first_year_participated: number | null;
  seasons_counted: number;
  phone: string | null;
}

export interface PersonHistory {
  person: {
    id: number;
    full_name: string;
    roster_status: string;
    experience_level: string | null;
    phone: string | null;
    first_year_participated: number | null;
    current_year: number | null;
  };
  emails: Array<{ email: string; is_primary: boolean; on_current_list: boolean; in_audubon_list: boolean }>;
  seasons: Array<{
    count_year: number;
    rsvp_status: string;
    assigned_area_code: string | null;
    is_area_leader: boolean;
    counter_type: string | null;
    preferred_area_codes: string[] | null;
    notes: string[];
  }>;
}

export interface OpenAreaRow {
  circle_code: string;
  area: string;
  cities: string | null;
  notable_spots: string | null;
  walking_friendly: boolean | null;
  active_restrictions: string | null;
  confirmed_field_counters: number;
  feeder_only_counters: number;
}

export interface ReminderRow {
  circle_code: string;
  person_id: number;
  full_name: string;
  email: string | null;
  last_year_counted: number | null;
}

export interface PossibleOutreachRow {
  circle_code: string;
  person_id: number;
  full_name: string;
  roster_status: string;
  /** not_on_list: on the Audubon list, not the current list. old_email: on the current list, with another email too. */
  reason: 'not_on_list' | 'old_email';
  email: string | null;
  /** Emails that are not on the current list, for reason old_email. */
  old_emails: string | null;
  last_year_counted: number | null;
  warnings: string;
}

export interface AreaOption {
  code: string;
  cities: string | null;
  notable_spots?: string | null;
  active_restrictions: string | null;
  counter_note: string | null;
  is_counted: boolean;
  results_received: boolean;
}

export interface AreaBoundaryRow {
  circle_code: string;
  code: string;
  label: string | null;
  boundary_geojson: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'Point';
    coordinates: unknown;
  };
}

export interface ImportedParticipantRow {
  full_name: string;
  email: string;
  area_code?: string | null;
  /** Undefined when the file has no RSVP for this row. */
  rsvp_status?: string;
  /** Undefined when the file has no counter type for this row. */
  counter_type?: string;
  note?: string;
  in_audubon_list?: boolean;
}

export interface ImportOptions {
  /** RSVP for a person new to this season whose row has none. */
  readonly defaultRsvp?: string;
  /** False: the file only adds people and season records, and never changes ones that exist. */
  readonly updateExisting: boolean;
  /** True: the file's emails become the circle's current list, and every other email leaves it. */
  readonly isCurrentList: boolean;
}

export interface RolloverOptions {
  /** True: people who had an area last season keep it, with their RSVP reset to no response. */
  readonly carryAssignments: boolean;
}

export interface CircleInput {
  code: string;
  name: string;
  state_province?: string | null;
  center_lat: number;
  center_lng: number;
  radius_miles?: number;
  compiler_name?: string | null;
  compiler_email?: string | null;
  count_date?: string | null;
  audubon_url?: string | null;
  setActive?: boolean;
}

export interface CircleInfoInput {
  compiler_name?: string | null;
  compiler_email?: string | null;
  count_date?: string | null;
  audubon_url?: string | null;
}

export interface BoundaryInput {
  code: string;
  name: string;
  geometry: unknown;
  isOuterCircle?: boolean;
}
