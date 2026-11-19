import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { cacheConfig } from '../../src/config/cache.config';
import { CACHE_NAMESPACES, InMemoryCacheStore } from '../../src/lib/cache';
import { ReportController } from '../../src/modules/reports/report.controller';
import type { ReportService } from '../../src/modules/reports/report.service';
import { WasteController } from '../../src/modules/waste/waste.controller';
import type { WasteActorContext } from '../../src/modules/waste/waste.dto';
import { WasteService } from '../../src/modules/waste/waste.service';

describe('M09-001 Unit: WasteService & WasteController', () => {
  const actor: WasteActorContext = {
    userId: 'u-mgr-1',
    ipAddress: '127.0.0.1',
    userAgent: 'waste-unit',
  };

  const mangoProduct = {
    id: 'p-mango',
    name: 'Mangga Harum Manis',
    productType: 'WEIGHT' as const,
    stockQty: new Prisma.Decimal('20.000'),
    costPerKg: new Prisma.Decimal('22000.00'),
    costPerUnit: null,
    isActive: true,
    deletedAt: null,
  };

  const sampleRecord = {
    id: 'w-1',
    productId: 'p-mango',
    wasteType: 'ROTTEN' as const,
    quantity: new Prisma.Decimal('2.500'),
    estimatedCost: new Prisma.Decimal('55000.00'),
    reason: 'Buah terlalu matang dan lembek',
    photoUrl: null,
    recordedBy: actor.userId,
    recordedAt: new Date('2026-11-19T03:00:00.000Z'),
    createdAt: new Date('2026-11-19T03:00:00.000Z'),
    product: {
      id: 'p-mango',
      name: 'Mangga Harum Manis',
      productType: 'WEIGHT' as const,
      category: { name: 'Buah Lokal' },
    },
    recorder: {
      id: actor.userId,
      fullName: 'Manajer Toko',
    },
  };

  it('recordWaste mengurangi stok atomik, menghitung estimatedCost dari HPP, mencatat WASTE_OUT & membust cache', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      product: {
        findUnique: jest.fn().mockResolvedValue(mangoProduct),
        update: jest.fn().mockResolvedValue({}),
      },
      wasteRecord: {
        create: jest.fn().mockResolvedValue(sampleRecord),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
    } as unknown as PrismaClient;

    const cache = new InMemoryCacheStore();
    const bumpSpy = jest.spyOn(cache, 'bumpVersion');
    const service = new WasteService(prisma, cache, cacheConfig, 'Asia/Jakarta');

    const dto = await service.recordWaste(
      {
        productId: 'p-mango',
        wasteType: 'ROTTEN',
        quantity: 2.5,
        reason: 'Buah terlalu matang dan lembek',
      },
      actor,
    );

    expect(dto.estimatedCost).toBe('55000.00');
    expect(dto.unitCost).toBe('22000.00');
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p-mango' },
      data: { stockQty: { decrement: new Prisma.Decimal(2.5) } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'WASTE_OUT',
          referenceId: 'w-1',
          referenceType: 'WASTE_RECORD',
        }),
      }),
    );
    expect(bumpSpy).toHaveBeenCalledWith(CACHE_NAMESPACES.WASTE);
    expect(bumpSpy).toHaveBeenCalledWith(CACHE_NAMESPACES.DASHBOARD);
    expect(bumpSpy).toHaveBeenCalledWith(CACHE_NAMESPACES.STOCK);
  });

  it('menolak produk tak ada, nonaktif, pecahan untuk UNIT, dan stok tak mencukupi', async () => {
    const makePrismaForProduct = (prod: unknown) => {
      const tx = {
        product: { findUnique: jest.fn().mockResolvedValue(prod) },
      };
      return {
        $transaction: jest.fn(async (cb: (client: typeof tx) => Promise<unknown>) => cb(tx)),
      } as unknown as PrismaClient;
    };

    const sNotFound = new WasteService(
      makePrismaForProduct(null),
      new InMemoryCacheStore(),
      cacheConfig,
      'Asia/Jakarta',
    );
    await expect(
      sNotFound.recordWaste(
        { productId: 'p-missing', wasteType: 'OTHER', quantity: 1, reason: 'Tidak ditemukan' },
        actor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRODUCT_NOT_FOUND, statusCode: 404 });

    const sInactive = new WasteService(
      makePrismaForProduct({ ...mangoProduct, isActive: false }),
      new InMemoryCacheStore(),
      cacheConfig,
      'Asia/Jakarta',
    );
    await expect(
      sInactive.recordWaste(
        { productId: 'p-mango', wasteType: 'EXPIRED', quantity: 1, reason: 'Kadaluarsa' },
        actor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    const sFractionalUnit = new WasteService(
      makePrismaForProduct({
        ...mangoProduct,
        productType: 'UNIT',
        costPerKg: null,
        costPerUnit: new Prisma.Decimal('8000.00'),
      }),
      new InMemoryCacheStore(),
      cacheConfig,
      'Asia/Jakarta',
    );
    await expect(
      sFractionalUnit.recordWaste(
        { productId: 'p-mango', wasteType: 'DAMAGED', quantity: 1.5, reason: 'Pecah kemasan' },
        actor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    const sInsufficient = new WasteService(
      makePrismaForProduct({ ...mangoProduct, stockQty: new Prisma.Decimal('1.000') }),
      new InMemoryCacheStore(),
      cacheConfig,
      'Asia/Jakarta',
    );
    await expect(
      sInsufficient.recordWaste(
        { productId: 'p-mango', wasteType: 'SHRINKAGE', quantity: 3, reason: 'Susut timbangan' },
        actor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.INSUFFICIENT_STOCK, statusCode: 422 });
  });

  it('list, getById & getSummary mengelompokkan kerugian & memakai cache Redis', async () => {
    const prisma = {
      wasteRecord: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sampleRecord]),
        findUnique: jest.fn().mockResolvedValueOnce(sampleRecord).mockResolvedValueOnce(null),
      },
    } as unknown as PrismaClient;

    const service = new WasteService(prisma, new InMemoryCacheStore(), cacheConfig, 'Asia/Jakarta');

    const listed = await service.list({ page: 1, limit: 20, search: 'Mangga' });
    expect(listed.items).toHaveLength(1);
    expect(listed.meta.total).toBe(1);

    const detail = await service.getById('w-1');
    expect(detail.id).toBe('w-1');
    await expect(service.getById('w-404')).rejects.toMatchObject({
      code: ERROR_CODES.WASTE_RECORD_NOT_FOUND,
      statusCode: 404,
    });

    const summary = await service.getSummary({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      groupBy: 'month',
    });
    expect(summary.totalRecords).toBe(1);
    expect(summary.totalEstimatedCost).toBe('55000.00');
    expect(summary.timeline[0]?.date).toBe('2026-11');
    expect(summary.byType[0]?.wasteType).toBe('ROTTEN');

    // Cache hit pada pemanggilan identik kedua
    await service.getSummary({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      groupBy: 'month',
    });
    expect(prisma.wasteRecord.findMany).toHaveBeenCalledTimes(2);

    await expect(
      service.getSummary({
        startDate: '2026-11-30',
        endDate: '2026-11-01',
        groupBy: 'day',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });
  });

  it('WasteController & ReportController.wasteSummary mengembalikan respons HTTP yang benar', async () => {
    const fakeWasteService = {
      recordWaste: jest.fn().mockResolvedValue({ id: 'w-1' }),
      list: jest.fn().mockResolvedValue({ items: [], meta: { page: 1, limit: 20, total: 0 } }),
      getById: jest.fn().mockResolvedValue({ id: 'w-1' }),
      getSummary: jest.fn().mockResolvedValue({ totalRecords: 0 }),
    } as unknown as WasteService;

    const controller = new WasteController(fakeWasteService);
    const makeRes = () =>
      ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      }) as unknown as Response;

    const r1 = makeRes();
    await controller.create(
      {
        authUser: { id: actor.userId },
        body: { productId: 'p-1', wasteType: 'ROTTEN', quantity: 1, reason: 'Busuk' },
        headers: {},
        ip: '127.0.0.1',
      } as unknown as Request,
      r1,
    );
    expect(r1.status).toHaveBeenCalledWith(201);

    const r2 = makeRes();
    await controller.list({ validatedQuery: { page: 1, limit: 20 } } as unknown as Request, r2);
    expect(r2.status).toHaveBeenCalledWith(200);

    const r3 = makeRes();
    await controller.getById({ params: { id: 'w-1' } } as unknown as Request, r3);
    expect(r3.status).toHaveBeenCalledWith(200);

    const rptCtrlOk = new ReportController({} as ReportService, fakeWasteService);
    const r4 = makeRes();
    await rptCtrlOk.wasteSummary({ validatedQuery: { groupBy: 'day' } } as unknown as Request, r4);
    expect(r4.status).toHaveBeenCalledWith(200);

    const rptCtrlMissing = new ReportController({} as ReportService);
    const r5 = makeRes();
    await rptCtrlMissing.wasteSummary(
      { validatedQuery: { groupBy: 'day' } } as unknown as Request,
      r5,
    );
    expect(r5.status).toHaveBeenCalledWith(501);
  });
});
