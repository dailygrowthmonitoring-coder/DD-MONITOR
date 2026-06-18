'use client';
import { useEffect, useState } from 'react';

const TZ = 'Asia/Baghdad';

function nowBaghdad() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function BaghdadClock() {
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => {
    setTime(nowBaghdad());
    const id = setInterval(() => setTime(nowBaghdad()), 1000);
    return () => clearInterval(id);
  }, []);
  if (time === null) return null;
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--muted)' }}>
      {time} <span style={{ opacity: 0.6 }}>AST</span>
    </span>
  );
}
