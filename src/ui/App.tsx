import { useEffect } from 'react';
import { getGameStore, getWorldStore, loadOrCreateWorld, useGame, useWorld } from '../store';
import { DataScreen } from './DataScreen';
import { GameHeader } from './GameHeader';
import { HorseModal } from './HorseModal';
import { MeetingTop } from './MeetingTop';
import { RaceCard } from './RaceCard';
import { RecordScreen } from './RecordScreen';
import { ResultScreen } from './ResultScreen';
import { Watch } from './Watch';
import { freshSeed } from './useRace';

/** 名簿の世界を読み込み（なければ作り）、ゲームの進み具合の週を世界の週にそろえる */
function useBoot() {
  useEffect(() => {
    void loadOrCreateWorld(getWorldStore(), freshSeed).then((world) => {
      const game = getGameStore().getState();
      if (game.serial !== world.serial) game.beginWeek(world.serial);
    });
  }, []);
}

const STATUS_TEXT = {
  loading: '馬の名簿を読み込んでいます…',
  creating: '新しい世界を作っています（はじめの1回だけ、数秒かかります）…',
  advancing: '次の週へ進めています…',
};

export function App() {
  useBoot();
  const screen = useGame((s) => s.screen);
  const status = useWorld((s) => s.status);
  const hasWorld = useWorld((s) => s.world !== null);
  if (!hasWorld || status === 'creating') {
    return (
      <div className="app boot">
        <p className="boot-status" role="status">
          {STATUS_TEXT[status === 'ready' ? 'loading' : status]}
        </p>
      </div>
    );
  }
  return (
    <div className={`app screen-${screen}`}>
      <GameHeader />
      {status === 'advancing' && (
        <div className="advancing" role="status">
          {STATUS_TEXT.advancing}
        </div>
      )}
      {screen === 'top' && <MeetingTop />}
      {screen === 'card' && <RaceCard />}
      {screen === 'watch' && <Watch />}
      {screen === 'result' && <ResultScreen />}
      {screen === 'record' && <RecordScreen />}
      {screen === 'data' && <DataScreen />}
      <HorseModal />
    </div>
  );
}
