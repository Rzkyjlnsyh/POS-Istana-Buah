import { AppError } from '../../src/utils/app-error';

describe('AppError', () => {
  it('default statusCode 400 dan details kosong', () => {
    const err = new AppError('VALIDATION_ERROR', 'Input tidak valid');
    expect(err.statusCode).toBe(400);
    expect(err.details).toBeUndefined();
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.name).toBe('AppError');
  });

  it('mempertahankan statusCode & details yang diberikan', () => {
    const err = new AppError('INSUFFICIENT_STOCK', 'Stok tidak mencukupi', 422, { available: 1 });
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual({ available: 1 });
  });

  it('dapat dikenali lewat instanceof dan Error', () => {
    const err = new AppError('X', 'x');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});
