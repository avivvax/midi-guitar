import { useEffect } from 'react';
import { ensureAudio } from './controller';
import { useStore, type Screen } from './state/store';
import styles from './App.module.css';
import Connect from './ui/Connect';
import Play from './ui/Play';
import Settings from './ui/Settings';
import Songs from './ui/Songs';
import Debug from './ui/Debug';

const TABS: { id: Screen; label: string; icon: string }[] = [
  { id: 'connect', label: 'חיבור', icon: '🔌' },
  { id: 'play', label: 'נגינה', icon: '🎸' },
  { id: 'songs', label: 'שירים', icon: '🎵' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
  { id: 'debug', label: 'דיבאג', icon: '📈' },
];

export default function App() {
  const screen = useStore((s) => s.screen);
  const set = useStore((s) => s.set);
  const status = useStore((s) => s.status);
  const audioReady = useStore((s) => s.audioReady);

  // Unlock audio on the first user gesture (browser autoplay policy).
  useEffect(() => {
    const unlock = () => {
      void ensureAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);

  return (
    <div className={styles.app}>
      <main className={styles.main}>
        {!audioReady && <div className={styles.banner}>הקש בכל מקום כדי להפעיל את הסאונד</div>}
        {screen === 'connect' && <Connect />}
        {screen === 'play' && <Play />}
        {screen === 'songs' && <Songs />}
        {screen === 'settings' && <Settings />}
        {screen === 'debug' && <Debug />}
      </main>
      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`${styles.tab} ${screen === t.id ? styles.active : ''}`}
            onClick={() => set({ screen: t.id })}
            aria-current={screen === t.id}
          >
            <span className={styles.icon} aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
            {t.id === 'connect' && <span className={`${styles.dot} ${styles[status]}`} />}
          </button>
        ))}
      </nav>
    </div>
  );
}
