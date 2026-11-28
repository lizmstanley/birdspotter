interface EdgeCueSettingProps {
  readonly isOn: boolean;
  readonly onChange: (isOn: boolean) => void;
}

const ON = 'on';
const OFF = 'off';

export function EdgeCueSetting({ isOn, onChange }: EdgeCueSettingProps) {
  return (
    <>
      <label htmlFor="scout-edge-cue">When you cross your area&apos;s edge</label>
      <select id="scout-edge-cue" value={isOn ? ON : OFF} onChange={(event) => onChange(event.target.value === ON)}>
        <option value={ON}>Buzz or beep</option>
        <option value={OFF}>Do nothing</option>
      </select>
      <p>
        One buzz or beep when you walk in toward your area, two when you walk out of it or out of the circle. An iPhone
        beeps instead of buzzing, and not with its ringer on silent.
      </p>
    </>
  );
}
