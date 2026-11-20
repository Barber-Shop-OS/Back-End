// BE-52: trial de 14 dias definido num único lugar e usado pelo início do trial.
const { TRIAL_DAYS, TRIAL_PLAN_CODE } = require('../../../shared/plans');

describe('BE-52 — trial', () => {
  it('TRIAL_DAYS = 14 com recursos do Profissional', () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_PLAN_CODE).toBe('profissional');
  });
});
