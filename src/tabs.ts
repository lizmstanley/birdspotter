export type Tab = 'assignments' | 'open' | 'results' | 'outreach' | 'map' | 'areas' | 'area' | 'import' | 'help';
export type AreaReturnTab = 'map' | 'areas' | 'results';

export const AREA_RETURN_LABELS: Record<AreaReturnTab, string> = {
  map: 'Map',
  areas: 'All Areas',
  results: 'Awaiting Results',
};

export interface SelectedArea {
  code: string;
  label?: string | null;
  from: AreaReturnTab;
}
