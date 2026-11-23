import type { Tab } from '../tabs';

interface Props {
  activeTab: Tab;
  areaCount: number;
  assignmentCount: number;
  outreachCount: number;
  onSelect: (tab: Tab) => void;
}

export function TabNav({ activeTab, areaCount, assignmentCount, outreachCount, onSelect }: Props) {
  const tabs: Array<{ tab: Tab; label: string; title: string }> = [
    {
      tab: 'map',
      label: 'Map & eBird Scout',
      title: 'The circle on a map with your area outlines, plus eBird hotspots and recent sightings',
    },
    {
      tab: 'areas',
      label: `All Areas (${areaCount})`,
      title: 'Every area in this circle, with its counters and results status',
    },
    {
      tab: 'assignments',
      label: `Assignments (${assignmentCount})`,
      title: "Who is counting where this season. Change a person's area here.",
    },
    {
      tab: 'outreach',
      label: `Reminders & Outreach (${outreachCount})`,
      title: 'Who still needs a reminder, and who you may have missed',
    },
    {
      tab: 'import',
      label: 'Import / Export Participants',
      title: 'Import people from a spreadsheet or Audubon list, or export the roster to Excel or CSV',
    },
    {
      tab: 'help',
      label: 'Help & API Keys',
      title: 'How to get a free eBird API key, and what each map source is',
    },
  ];

  return (
    <nav className="tabs">
      {tabs.map(({ tab, label, title }) => (
        <button key={tab} className={activeTab === tab ? 'active' : ''} title={title} onClick={() => onSelect(tab)}>
          {label}
        </button>
      ))}
    </nav>
  );
}
