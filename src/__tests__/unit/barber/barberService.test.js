// BE-05: DTO público do barbeiro.
const { toPublicBarber } = require('../../../modules/barber/barberService');

describe('BE-05 — toPublicBarber', () => {
  it('usa o nome do usuário quando não há display_name e omite dados pessoais', () => {
    const dto = toPublicBarber({
      id: 1,
      user_id: 9,
      branch_id: 2,
      bio: 'Fade',
      display_name: null,
      active: true,
      User: { id: 9, name: 'Carlos', email: 'carlos@x.com', phone: '+55119' },
    });
    expect(dto).toEqual({
      id: 1,
      display_name: 'Carlos',
      bio: 'Fade',
      photo_url: null,
      branch_id: 2,
      active: true,
      services: [],
    });
  });

  it('prefere display_name e lista serviços só com id e nome', () => {
    const dto = toPublicBarber({
      id: 1,
      branch_id: 2,
      bio: '',
      display_name: 'Zé',
      photo_url: 'https://cdn/x.webp',
      active: false,
      Services: [{ id: 5, name: 'Corte', price: '50.00', barber_services: {} }],
    });
    expect(dto.display_name).toBe('Zé');
    expect(dto.active).toBe(false);
    expect(dto.services).toEqual([{ id: 5, name: 'Corte' }]);
  });

  it('null → null', () => {
    expect(toPublicBarber(null)).toBeNull();
  });
});
