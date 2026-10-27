import { validateChangePassword, validateLogin, validateRegister } from '../validation';

const validRegister = {
  name: 'Ana',
  username: 'ana_1',
  email: 'ana@example.com',
  password: 'longpassword',
};

describe('validateLogin', () => {
  it('requires identifier and password', () => {
    expect(validateLogin({ identifier: '', password: '' })).toEqual({
      identifier: 'Campo obrigatório',
      password: 'Campo obrigatório',
    });
  });

  it('treats a whitespace-only identifier as empty', () => {
    expect(validateLogin({ identifier: '   ', password: 'secret' })).toEqual({
      identifier: 'Campo obrigatório',
    });
  });

  it('does not trim the password', () => {
    expect(validateLogin({ identifier: 'ana', password: '   ' })).toEqual({});
  });

  it('valid input returns {}', () => {
    expect(validateLogin({ identifier: 'ana', password: 'x' })).toEqual({});
  });
});

describe('validateRegister', () => {
  it('requires every field', () => {
    expect(validateRegister({ name: '', username: '', email: '', password: '' })).toEqual({
      name: 'Campo obrigatório',
      username: 'Campo obrigatório',
      email: 'Campo obrigatório',
      password: 'Campo obrigatório',
    });
  });

  it('treats whitespace-only name, username and email as empty', () => {
    expect(validateRegister({ ...validRegister, name: ' ', username: ' ', email: ' ' })).toEqual({
      name: 'Campo obrigatório',
      username: 'Campo obrigatório',
      email: 'Campo obrigatório',
    });
  });

  it('rejects a username shorter than 3', () => {
    expect(validateRegister({ ...validRegister, username: 'ab' }).username).toBe(
      'Use pelo menos 3 caracteres',
    );
  });

  it('rejects a username with characters outside letters, numbers and _', () => {
    expect(validateRegister({ ...validRegister, username: 'ana-1' }).username).toBe(
      'Use apenas letras, números e _',
    );
  });

  it('rejects a username longer than 30', () => {
    expect(validateRegister({ ...validRegister, username: 'a'.repeat(31) }).username).toBe(
      'Use no máximo 30 caracteres',
    );
  });

  it('accepts usernames of 3 and 30 characters', () => {
    expect(validateRegister({ ...validRegister, username: 'abc' })).toEqual({});
    expect(validateRegister({ ...validRegister, username: 'a'.repeat(30) })).toEqual({});
  });

  it('rejects an invalid e-mail', () => {
    for (const email of ['ana', 'ana@', 'ana@example', '@example.com', 'a na@example.com']) {
      expect(validateRegister({ ...validRegister, email }).email).toBe('Informe um e-mail válido');
    }
  });

  it('rejects a password shorter than 8', () => {
    expect(validateRegister({ ...validRegister, password: '1234567' }).password).toBe(
      'Use pelo menos 8 caracteres',
    );
  });

  it('rejects a password longer than 72', () => {
    expect(validateRegister({ ...validRegister, password: 'a'.repeat(73) }).password).toBe(
      'Use no máximo 72 caracteres',
    );
  });

  it('accepts passwords of 8 and 72 characters', () => {
    expect(validateRegister({ ...validRegister, password: 'a'.repeat(8) })).toEqual({});
    expect(validateRegister({ ...validRegister, password: 'a'.repeat(72) })).toEqual({});
  });

  it('rejects a name longer than 50', () => {
    expect(validateRegister({ ...validRegister, name: 'a'.repeat(51) }).name).toBe(
      'Use no máximo 50 caracteres',
    );
  });

  it('valid input returns {}', () => {
    expect(validateRegister(validRegister)).toEqual({});
  });

  it('validates the trimmed values', () => {
    expect(
      validateRegister({
        name: '  Ana  ',
        username: '  ana_1  ',
        email: '  ana@example.com  ',
        password: 'longpassword',
      }),
    ).toEqual({});
  });
});

describe('validateChangePassword', () => {
  const valid = { current: 'senha-antiga', next: 'senha-nova-123', confirm: 'senha-nova-123' };

  it('accepts a valid change', () => {
    expect(validateChangePassword(valid)).toEqual({});
  });

  it('requires every field', () => {
    expect(validateChangePassword({ current: '', next: '', confirm: '' })).toEqual({
      current: 'Campo obrigatório',
      next: 'Campo obrigatório',
      confirm: 'Campo obrigatório',
    });
  });

  it('applies the sign-up rules to the new password', () => {
    expect(validateChangePassword({ ...valid, next: 'curta', confirm: 'curta' }).next).toBe(
      'Use pelo menos 8 caracteres',
    );
    const long = 'a'.repeat(73);
    expect(validateChangePassword({ ...valid, next: long, confirm: long }).next).toBe(
      'Use no máximo 72 caracteres',
    );
    const max = 'a'.repeat(72);
    expect(validateChangePassword({ ...valid, next: max, confirm: max })).toEqual({});
  });

  it('requires the confirmation to match exactly', () => {
    expect(validateChangePassword({ ...valid, confirm: 'senha-nova-12' }).confirm).toBe(
      'As senhas não coincidem',
    );
    expect(validateChangePassword({ ...valid, confirm: 'senha-nova-123 ' }).confirm).toBe(
      'As senhas não coincidem',
    );
  });
});
