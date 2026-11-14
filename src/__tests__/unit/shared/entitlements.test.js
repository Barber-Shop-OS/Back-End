// BE-31: entitlements por plano.
const { can, limit, checkLimit, effectivePlan, upgradeFor } = require('../../../shared/entitlements');

const sub = (plan_code, status = 'active') => ({ plan_code, status });

describe('BE-31 — entitlements', () => {
  it.each([
    ['essencial', 1, 3],
    ['profissional', 3, 10],
    ['rede', 15, null],
  ])('%s: filiais %p, barbeiros %p', (code, branches, barbers) => {
    expect(limit(sub(code), 'branches')).toBe(branches);
    expect(limit(sub(code), 'barbers')).toBe(barbers);
  });

  it('recursos por plano', () => {
    expect(can(sub('essencial'), 'online_booking')).toBe(true);
    expect(can(sub('essencial'), 'financial_reports')).toBe(false);
    expect(can(sub('profissional'), 'financial_reports')).toBe(true);
    expect(can(sub('profissional'), 'network_dashboard')).toBe(false);
    expect(can(sub('rede'), 'network_dashboard')).toBe(true);
  });

  it('trial usa os recursos do Profissional, qualquer que seja o plano escolhido', () => {
    const trial = sub('essencial', 'trialing');
    expect(effectivePlan(trial).code).toBe('profissional');
    expect(can(trial, 'clients_crm')).toBe(true);
    expect(limit(trial, 'barbers')).toBe(10);
  });

  it('sem assinatura nada é permitido', () => {
    expect(can(null, 'agenda')).toBe(false);
    expect(limit(null, 'branches')).toBe(0);
  });

  it('checkLimit indica o upgrade mais barato que comporta o uso', () => {
    expect(checkLimit(sub('essencial'), 'branches', 0)).toEqual({ allowed: true, limit: 1, used: 0, upgrade_to: null });
    expect(checkLimit(sub('essencial'), 'branches', 1)).toEqual({ allowed: false, limit: 1, used: 1, upgrade_to: 'profissional' });
    expect(checkLimit(sub('profissional'), 'barbers', 10).upgrade_to).toBe('rede');
    expect(checkLimit(sub('rede'), 'barbers', 500).allowed).toBe(true);
    expect(upgradeFor('branches', 99)).toBeNull();
  });
});
