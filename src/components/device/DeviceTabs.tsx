'use client';
import { useState } from 'react';
import type { DeviceDetail }  from '@/lib/db/queries';
import { CapacityTab }        from './tabs/CapacityTab';
import { CompressionTab }     from './tabs/CompressionTab';
import { AlertsTab }          from './tabs/AlertsTab';
import { NetworkTab }         from './tabs/NetworkTab';
import { HealthTab }          from './tabs/HealthTab';
import { MTreesTab }          from './tabs/MTreesTab';

const TABS = ['Capacity', 'Compression', 'Alerts', 'Network', 'Health', 'MTrees'] as const;
type Tab = typeof TABS[number];

export function DeviceTabs({ detail, capHistory }: {
  detail: DeviceDetail;
  capHistory: { date: string; usedGib: number }[];
}) {
  const [active, setActive] = useState<Tab>('Capacity');

  return (
    <div>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        marginBottom: '1.25rem',
        gap: 2,
      }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              borderRadius: '6px 6px 0 0',
              cursor: 'pointer',
              background: active === t ? 'var(--accent)' : 'transparent',
              color:      active === t ? '#fff'         : 'var(--muted)',
              borderBottom: active === t ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {active === 'Capacity'    && <CapacityTab    detail={detail} capHistory={capHistory} />}
      {active === 'Compression' && <CompressionTab detail={detail} />}
      {active === 'Alerts'      && <AlertsTab      detail={detail} />}
      {active === 'Network'     && <NetworkTab     detail={detail} />}
      {active === 'Health'      && <HealthTab      detail={detail} />}
      {active === 'MTrees'      && <MTreesTab      detail={detail} />}
    </div>
  );
}
