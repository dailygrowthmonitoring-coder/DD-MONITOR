import { describe, it, expect } from 'vitest';
import { extract } from '../sections/netHardware';

// Represents a typical DD OS 7.7 "Net Show Hardware" sub-section
// Col layout: Port | Speed | Duplex | Supported Speeds | Hardware Address | Physical | Link Status | State
const SECTION_7X = [
  '  Port   Speed    Duplex  Supported Speeds    Hardware Address   Physical   Link Status  State',
  '  -----  -------  ------  ------------------  -----------------  ---------  -----------  -------',
  '  eth0   1 GbE    Full    1 GbE               00:00:00:00:00:01  copper     yes          running',
  '  eth1   1 GbE    Full    1 GbE               00:00:00:00:00:02  copper     no           running',
  '  eth4   -        -       -                   -                  fiber      unknown      down',
  '  -----  -------  ------  ------------------  -----------------  ---------  -----------  -------',
];

describe('netHardware.extract', () => {
  it('parses running port with link up', () => {
    const { data } = extract(SECTION_7X);
    const eth0 = data.find(i => i.port === 'eth0');
    expect(eth0).toBeDefined();
    expect(eth0!.state).toBe('running');
    expect(eth0!.linkUp).toBe(true);
    expect(eth0!.speed).toBe('1 GbE');
    expect(eth0!.duplex).toBe('Full');
  });

  it('normalises running+no-link to fault', () => {
    const { data } = extract(SECTION_7X);
    const eth1 = data.find(i => i.port === 'eth1');
    expect(eth1!.state).toBe('fault');
    expect(eth1!.linkUp).toBe(false);
  });

  it('normalises fiber port with unknown link status to fault', () => {
    const { data } = extract(SECTION_7X);
    const eth4 = data.find(i => i.port === 'eth4');
    expect(eth4).toBeDefined();
    expect(eth4!.linkUp).toBeNull();
    expect(eth4!.state).toBe('fault');
  });

  it('returns empty array for empty input', () => {
    const { data } = extract([]);
    expect(data).toHaveLength(0);
  });
});

// BAG 7.13 adds "Autonegotiation" as a 9th column
const SECTION_713 = [
  '  Port   Speed    Duplex  Supported Speeds    Hardware Address   Physical   Link Status  State    Autonegotiation',
  '  -----  -------  ------  ------------------  -----------------  ---------  -----------  -------  ---------------',
  '  eth0   1 GbE    Full    1 GbE               00:11:22:33:44:55  copper     yes          running  enabled',
  '  -----  -------  ------  ------------------  -----------------  ---------  -----------  -------  ---------------',
];

describe('netHardware.extract (7.13 with Autoneg column)', () => {
  it('parses correctly with 9 columns', () => {
    const { data } = extract(SECTION_713);
    expect(data).toHaveLength(1);
    expect(data[0].port).toBe('eth0');
    expect(data[0].state).toBe('running');
    expect(data[0].linkUp).toBe(true);
    expect(data[0].hardwareAddress).toBe('00:11:22:33:44:55');
  });
});
