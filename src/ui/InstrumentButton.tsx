import { useState } from 'react';
import { playSetup, useStore } from '../state/store';
import InstrumentPicker from './InstrumentPicker';
import { courseCount } from './instrumentText';
import styles from './InstrumentButton.module.css';

const ICON: Record<string, string> = { bowed: '🎻', harp: '🪉', zither: '🎼', drone: '🎼', other: '🎹' };

/** Current instrument (+ sample loading state); opens the picker. */
export default function InstrumentButton({ className = '' }: { className?: string }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const inst = playSetup(s).inst;
  const status = inst.samples ? s.sampleStatus[inst.samples] : undefined;
  return (
    <>
      <button className={`${styles.btn} ${className}`} onClick={() => setOpen(true)} aria-label={`כלי: ${inst.name.he}`}>
        <span className={styles.name}>
          {ICON[inst.family] ?? (inst.id.includes('banjo') ? '🪕' : '🎸')} {inst.name.he}
        </span>
        <small>
          {courseCount(inst)}
          {status === 'loading' && ' · טוען דגימות…'}
          {status === 'error' && ' · סינתזה (הדגימות לא נטענו)'}
        </small>
      </button>
      {open && <InstrumentPicker onClose={() => setOpen(false)} />}
    </>
  );
}
