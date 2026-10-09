import { useStore } from '../state/store';
import SongImport from './SongImport';
import SongLibrary from './SongLibrary';
import SongPlayer from './SongPlayer';

export default function Songs() {
  const view = useStore((s) => s.songView);
  if (view === 'player') return <SongPlayer />;
  if (view === 'import') return <SongImport />;
  return <SongLibrary />;
}
