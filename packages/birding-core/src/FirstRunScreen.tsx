import { EbirdKeyForm } from './EbirdKeyForm.tsx';

interface FirstRunScreenProps {
  readonly appName: string;
  readonly onSave: (key: string) => void;
  readonly onHelp: () => void;
}

/** What shows until an eBird key is saved. */
export function FirstRunScreen({ appName, onSave, onHelp }: FirstRunScreenProps) {
  return (
    <div className="birding-first-run">
      <h1>{appName}</h1>
      <EbirdKeyForm appName={appName} savedKey="" onSave={onSave} />
      <p className="birding-first-run-help">
        <button type="button" onClick={onHelp}>
          How {appName} works
        </button>
      </p>
    </div>
  );
}
