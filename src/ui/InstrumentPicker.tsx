import { useMemo, useState } from 'react';
import { FAMILY_NAMES, INSTRUMENTS, REGION_NAMES } from '../instruments/registry';
import type { InstrumentDef, Region } from '../instruments/types';
import { useStore } from '../state/store';
import { courseCount, tuningText } from './instrumentText';
import styles from './InstrumentPicker.module.css';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ְͯ-ׇ]/g, '');

function matches(inst: InstrumentDef, q: string): boolean {
  if (!q) return true;
  const hay = norm([inst.name.en, inst.name.he, inst.id, FAMILY_NAMES[inst.family].he, REGION_NAMES[inst.region].he, REGION_NAMES[inst.region].en].join(' '));
  return norm(q)
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

/** Full-screen instrument chooser: search, region chips, grouped by family. */
export default function InstrumentPicker({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.instrument);
  const set = useStore((s) => s.set);
  const [q, setQ] = useState('');
  const [region, setRegion] = useState<Region | null>(null);

  const groups = useMemo(() => {
    const list = INSTRUMENTS.filter((i) => (!region || i.region === region) && matches(i, q));
    const byFamily = new Map<InstrumentDef['family'], InstrumentDef[]>();
    for (const i of list) byFamily.set(i.family, [...(byFamily.get(i.family) ?? []), i]);
    return [...byFamily.entries()];
  }, [q, region]);

  return (
    <div className={styles.sheet} role="dialog" aria-label="בחירת כלי">
      <div className={styles.head}>
        <input className={styles.search} placeholder="חיפוש כלי (עברית / English)" aria-label="חיפוש כלי" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button onClick={onClose} aria-label="סגור">
          ✕
        </button>
      </div>
      <div className={styles.chips} role="group" aria-label="אזור">
        <button className={region === null ? styles.chipOn : ''} onClick={() => setRegion(null)}>
          הכול
        </button>
        {(Object.keys(REGION_NAMES) as Region[]).map((r) => (
          <button key={r} className={region === r ? styles.chipOn : ''} onClick={() => setRegion(region === r ? null : r)}>
            {REGION_NAMES[r].he}
          </button>
        ))}
      </div>
      <div className={styles.list}>
        {groups.length === 0 && <p className={styles.empty}>לא נמצאו כלים</p>}
        {groups.map(([family, list]) => (
          <section key={family} aria-label={FAMILY_NAMES[family].he}>
            <h3>
              {FAMILY_NAMES[family].he} <small className="ltr">{FAMILY_NAMES[family].en}</small>
            </h3>
            <ul>
              {list.map((inst) => (
                <li key={inst.id}>
                  <button
                    className={`${styles.row} ${inst.id === current ? styles.sel : ''}`}
                    aria-pressed={inst.id === current}
                    onClick={() => {
                      set({ instrument: inst.id });
                      onClose();
                    }}
                  >
                    <span className={styles.names}>
                      <b>{inst.name.he}</b>
                      <span className="ltr">{inst.name.en}</span>
                    </span>
                    <span className={styles.meta}>
                      <span>{courseCount(inst)}</span>
                      <span className="ltr">{tuningText(inst.tunings[0].notes)}</span>
                      <span className={styles.badges}>
                        {inst.samples ? <i className={styles.sampled}>דגימות</i> : <i>סינתזה</i>}
                        {inst.tunings.some((t) => t.uncertain) && <i className={styles.warn}>כוונון משוער</i>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
