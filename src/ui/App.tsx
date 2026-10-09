import { useGame } from '../store';
import { GameHeader } from './GameHeader';
import { MeetingTop } from './MeetingTop';
import { RaceCard } from './RaceCard';
import { RecordScreen } from './RecordScreen';
import { ResultScreen } from './ResultScreen';
import { Watch } from './Watch';

export function App() {
  const screen = useGame((s) => s.screen);
  return (
    <div className={`app screen-${screen}`}>
      <GameHeader />
      {screen === 'top' && <MeetingTop />}
      {screen === 'card' && <RaceCard />}
      {screen === 'watch' && <Watch />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'record' && <RecordScreen />}
    </div>
  );
}
