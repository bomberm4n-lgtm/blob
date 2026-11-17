// 3-second opening animation: the slime drops in and bounces, the name pops in letter by letter, then it all fades out.
import { useEffect, useState } from 'react';

export const INTRO_MS = 3000;

export default function Intro({ onDone }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), INTRO_MS - 600);
    const done = setTimeout(onDone, INTRO_MS);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [onDone]);

  return (
    <div className={'intro' + (leaving ? ' intro-leave' : '')} onClick={onDone}>
      <div className="intro-glow" />
      <div className="intro-pixels">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <div className="intro-stage">
        <img src="/slime.png" alt="" className="intro-slime" draggable={false} />
        <div className="intro-shadow" />
      </div>
      <h1 className="intro-title">
        {'Blob'.split('').map((c, i) => <span key={i} style={{ '--i': i }}>{c}</span>)}
      </h1>
      <p className="intro-tag">voice · chat · screen share</p>
      <div className="intro-bar"><div /></div>
    </div>
  );
}
