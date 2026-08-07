import { useState } from 'react';
import type { GameState, GameAction } from '../../domain/model';
import { heroClassNames, giftDefinitions, dayLabel, affinityStage, dormGreeting } from '../../content/gameContent';
import { narrativeService, playerPlaceholder } from '../../infrastructure/llm';
import type { NarrativeMessage } from '../../infrastructure/llm';

export interface QuartersProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  onRestClick: () => void;
}

const quartersPortraits: Record<string, string> = {
  lan: '/assets/portraits-dorm/lan-dorm-v2.png',
  wu: '/assets/portraits-dorm/wu-dorm-v2.png',
  xingluo: '/assets/portraits-dorm/xingluo-dorm-v2.png',
  cheng: '/assets/portraits-dorm/cheng-dorm-v2.png',
  yan: '/assets/portraits-dorm/yan-dorm-v2.png',
  scout: '/assets/actors/scout-v1.png',
};

const quartersGreetings: Record<string, string> = {
  lan: '还没休息吗？进来吧，我正好在整理明天要带的东西。',
  wu: '门没锁。要聊聊今天在路上看到的事吗？',
  xingluo: '来得正好，我刚把星盘收起来。今晚的天象很安静。',
  cheng: '请进吧，需要热茶或者包扎伤口吗？我刚整理好药箱。',
};

// 旧版泛用台词：按 log[0] 关键词匹配结果（远征完成/提前撤回/体力竭）。
// 打磨 2 之后只在"无 lastExpedition"（旧档/尚未远征）时作为回退使用。
const postExpeditionGreeting = (heroId: string, log: string) => {
  if (log.includes('远征完成')) return { lan: '回来就好。先把伤口和补给清点完，别急着庆祝。', wu: '这次路没白走。队长，下次我们要不要试试另一条岔路？', xingluo: '封印的回声还在耳边……但我们确实带回了新的线索。', cheng: '大家都平安回来了，这就是最好的消息。伤口片刻就能治好。' }[heroId];
  if (log.includes('提前撤回')) return { lan: '及时撤回是正确判断。活着回来，才有下一次远征。', wu: '我就知道队长不会把撤退当成丢脸的事。下次换个走法。', xingluo: '虽然没能看完，但那些痕迹不会消失。我们准备好再去。', cheng: '队长做出了明智的选择。队员们的健康和安全永远是第一位的。' }[heroId];
  if (log.includes('体力竭')) return { lan: '别勉强说话，先休息。责任不该只落在一个人身上。', wu: '我把门关好了。今晚不谈遗迹，只谈怎么把大家养回来。', xingluo: '是我太急了……不过，能回来就还有重新计算的机会。', cheng: '伤得这么重……别担心，有我在，快躺下休息，我会用药草帮大家疗伤。' }[heroId];
  return undefined;
};

export function Quarters({ state, dispatch, onRestClick }: QuartersProps) {
  const recruited = state.roster.filter((hero) => hero.recruited);
  const [heroId, setHeroId] = useState(recruited[0]?.id ?? '');
  const [roomHeroId, setRoomHeroId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NarrativeMessage[]>([{ role: 'assistant', content: '今晚的宿舍很安静。' }]);
  const [playerText, setPlayerText] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const hero = recruited.find((item) => item.id === heroId) ?? recruited[0];
  const connection = narrativeService.status();
  const freeChatAvailable = state.settings.llmEnabled && connection.available;

  const talk = async (presetText?: string) => {
    const text = (presetText ?? playerText).trim();
    if (!hero || !text || loading) return;
    const history = messages;
    setMessages((current) => [...current, { role: 'user' as const, content: text }].slice(-16));
    setPlayerText('');
    setLoading(true);
    const result = await narrativeService.chatWithStatus(hero, state, history, text);
    setMessages((current) => [...current, { role: 'assistant' as const, content: result.text }].slice(-16));
    if (!result.ok && result.errorKind) {
      console.warn('[narrative] 对白生成失败', result.errorKind);
    }
    setLoading(false);
  };

  const enterRoom = (id: string) => {
    setHeroId(id);
    setRoomHeroId(id);
    // 打磨 2：优先用 lastExpedition 事实驱动台词（outcome + choices 命中），
    // 无事实记录（旧档/尚未远征）时回退旧版关键词泛用逻辑。
    const greeting =
      dormGreeting(id, state.lastExpedition)
      ?? postExpeditionGreeting(id, state.log[0] ?? '')
      ?? quartersGreetings[id]
      ?? '今晚的宿舍很安静。';
    setMessages([{ role: 'assistant', content: greeting }]);
    setPlayerText('');
    setHistoryOpen(false);
  };

  if (!roomHeroId) {
    return (
      <section className="page quarters-page quarters-hall">
        <img className="quarters-background" src="/assets/world/quarters-hall-v1.webp" alt="冒险者宿舍公共走廊" />
        <div className="room-directory">
          {recruited.map((item, index) => (
            <button className={`room-entry room-entry-${index}`} key={item.id} onClick={() => enterRoom(item.id)}>
              <strong>{item.name}的房间</strong>
              <span>{heroClassNames[item.heroClass]} · 敲门进入</span>
            </button>
          ))}
        </div>
        <button className="quarters-rest-button" onClick={onRestClick}>
          <strong>上楼休息</strong>
          <span>结束今日 · 进入 {dayLabel(state.day + 1)}</span>
        </button>
      </section>
    );
  }

  return (
    <section className="page quarters-page">
      <img className="quarters-background" src="/assets/world/quarters-dorm-v1.webp" alt="暮色中的冒险者宿舍" />
      <div className="quarters-topbar">
        <div>
          <p className="eyebrow">{hero?.name}的房间 · 日常交谈</p>
          <strong>远征后的安静时间</strong>
          {hero && (
            <div className="gift-row">
              <span className="gift-info">好感 {hero.affinity} · {affinityStage(hero.affinity).name}</span>
              {giftDefinitions
                .filter((g) => (state.inventory[g.id] ?? 0) > 0)
                .map((g) => (
                  <button
                    key={g.id}
                    disabled={(state.giftsGivenToday[hero.id] ?? 0) >= 1}
                    onClick={() => dispatch({ type: 'GIVE_GIFT', heroId: hero.id, giftId: g.id })}
                  >
                    {g.name}×{state.inventory[g.id]}
                    {hero.preferredGiftTags.some((t) => g.tags.includes(t)) ? '★' : ''}
                  </button>
                ))}
              {(state.giftsGivenToday[hero.id] ?? 0) >= 1 && <span>今日已送</span>}
            </div>
          )}
        </div>
        <button className="leave-room" onClick={() => setRoomHeroId(null)}>返回公共区域</button>
      </div>

      {hero && (
        <div className="quarters-character" aria-hidden="true">
          <div className="quarters-character-shadow" />
          <img key={hero.id} src={quartersPortraits[hero.id] ?? '/assets/actors-v2/scout-idle-v2.png'} alt="" />
        </div>
      )}

      <div
        className={`quarters-chat gal-dialogue ${historyOpen ? 'history-open' : ''} ${loading ? 'loading' : ''}`}
        aria-label={historyOpen ? '对话回顾' : '宿舍聊天窗口'}
      >
        <div className="gal-nameplate">
          <strong>{hero?.name ?? '无人'}</strong>
          <span>{hero ? `${heroClassNames[hero.heroClass]} · 与队长交谈` : ''}</span>
        </div>
        <button
          className="gal-history"
          onClick={(event) => {
            event.stopPropagation();
            setHistoryOpen((open) => !open);
          }}
        >
          {historyOpen ? '返回对白' : '回顾'}
        </button>
        <div className="chat-thread">
          {messages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={`${index}-${message.content}`}>
              {message.role === 'assistant' ? `“${message.content}”` : `队长 ${playerPlaceholder}：${message.content}`}
            </div>
          ))}
        </div>
        {!historyOpen && (
          <form
            className={`gal-input ${freeChatAvailable ? '' : 'offline'}`}
            onSubmit={(event) => {
              event.preventDefault();
              void (freeChatAvailable ? talk() : talk('今晚好好休息，明天见。'));
            }}
          >
            <span className="speaker-label">队长 {playerPlaceholder}</span>
            <input
              value={playerText}
              onChange={(event) => setPlayerText(event.target.value)}
              disabled={loading || !hero || !freeChatAvailable}
              maxLength={240}
              placeholder={
                loading
                  ? `${hero?.name ?? '对方'}正在回应…`
                  : freeChatAvailable
                  ? `和${hero?.name ?? '对方'}说点什么…`
                  : '连接 LLM 后可自由交谈'
              }
              aria-label="以队长身份输入对话内容"
            />
            <button disabled={loading || (freeChatAvailable && !playerText.trim())} type="submit">
              {loading ? '回应中' : freeChatAvailable ? '发送' : '简单问候'}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
export { quartersPortraits };
