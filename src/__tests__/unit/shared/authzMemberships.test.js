// BE-49: regras puras de papel por barbearia (gerente × recepcionista) no authz e no roleMiddleware.
const authz = require('../../../shared/authz');
const roleMiddleware = require('../../../middlewares/roleMiddleware');

const shop = { id: 7, owner_id: 1 };
const branch = (id) => ({ id, barbershop_id: 7, Barbershop: shop });
const receptionist = { id: 2, role: 'cliente', memberships: [{ barbershop_id: 7, role: 'receptionist', branch_ids: [10] }] };
const manager = { id: 3, role: 'cliente', memberships: [{ barbershop_id: 7, role: 'manager', branch_ids: null }] };
const owner = { id: 1, role: 'owner', memberships: [] };

const run = (allowed, user) => {
  let result;
  roleMiddleware(allowed)({ user }, {}, (error) => {
    result = error ? error.statusCode || error.status : 'ok';
  });
  return result;
};

describe('BE-49 — authz de membros', () => {
  it('recepcionista opera só a filial do vínculo e nunca gerencia', () => {
    expect(authz.canOperateBranch(receptionist, branch(10))).toBe(true);
    expect(authz.canOperateBranch(receptionist, branch(11))).toBe(false);
    expect(authz.canManageBranch(receptionist, branch(10))).toBe(false);
    expect(authz.membershipFor(receptionist, 7)).toBeUndefined();
    expect(authz.receptionistMembershipFor(receptionist, 7)).toMatchObject({ branch_ids: [10] });
    expect(authz.managedBranchIds(receptionist, shop)).toEqual([]);
  });

  it('dono e gerente operam e gerenciam', () => {
    expect(authz.canOperateBranch(owner, branch(11))).toBe(true);
    expect(authz.canOperateBranch(manager, branch(11))).toBe(true);
    expect(authz.managerMemberships(manager)).toHaveLength(1);
    expect(authz.receptionistMemberships(manager)).toHaveLength(0);
  });

  it('roleMiddleware: recepcionista só passa em rotas que declaram receptionist; gerente passa nas de dono', () => {
    expect(run(['admin', 'owner'], receptionist)).toBe(403);
    expect(run(['admin', 'owner', 'receptionist'], receptionist)).toBe('ok');
    expect(run(['admin', 'owner'], manager)).toBe('ok');
    expect(run(['admin', 'receptionist'], manager)).toBe(403);
  });
});
