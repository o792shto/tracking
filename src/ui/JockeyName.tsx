/** 騎手の名前とランクの札（S+・S・A・B・C） */
export function JockeyName({ jockey }: { jockey: { name: string; rank: string } }) {
  const cls = jockey.rank === 'S+' ? 'splus' : jockey.rank.toLowerCase();
  return (
    <span className="jockey-name">
      <span className={`jk-rank jk-${cls}`} title={`${jockey.rank}ランク`}>
        {jockey.rank}
      </span>
      {jockey.name}
    </span>
  );
}
