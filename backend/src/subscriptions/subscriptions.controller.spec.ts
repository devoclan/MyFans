import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionStatus } from './entities/subscription-index.entity';
import { Reflector } from '@nestjs/core';
import { FeatureFlagGuard } from '../feature-flags/feature-flag.guard';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import {
  FanBearerGuard,
  RequestWithFan,
} from './guards/fan-bearer.guard';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let service: jest.Mocked<
    Pick<
      SubscriptionsService,
      'getFanCreatorSubscriptionState' | 'listCreatorSubscribers' | 'listSubscriptions'
    >
  >;

  const fan = `G${'A'.repeat(55)}`;
  const creator = `G${'B'.repeat(55)}`;

  beforeEach(async () => {
    service = {
      getFanCreatorSubscriptionState: jest.fn().mockResolvedValue({
        fan,
        creator,
        active: false,
        indexedStatus: 'none',
        indexed: null,
        chain: {
          configured: false,
          isSubscriber: null,
          simulationCost: {
            method: 'is_subscriber',
            worstCaseMinResourceFee: null,
            lastObservedMinResourceFee: null,
            updatedAt: null,
            stale: true,
          },
        },
      }),
      listCreatorSubscribers: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      }),
      listSubscriptions: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
        nextCursor: null,
        cursor: null,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: service },
        FanBearerGuard,
        Reflector,
        FeatureFlagGuard,
        {
          provide: FeatureFlagsService,
          useValue: { isEnabled: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get(SubscriptionsController);
  });

  it('delegates subscription-state lookup with fan from request', async () => {
    const req = { fanAddress: fan } as RequestWithFan;
    const result = await controller.getFanCreatorSubscriptionState(req, {
      creator,
    });

    expect(service.getFanCreatorSubscriptionState).toHaveBeenCalledWith(
      fan,
      creator,
    );
    expect(result).toMatchObject({
      indexedStatus: 'none',
      chain: {
        simulationCost: {
          method: 'is_subscriber',
          stale: true,
        },
      },
    });
  });

  it('delegates creator subscriber query to the service', async () => {
    await controller.listCreatorSubscribers({
      creator,
      status: 'active',
      cursor: 'abc',
      limit: 5,
    });

    expect(service.listCreatorSubscribers).toHaveBeenCalledWith(
      creator,
      'active',
      'abc',
      5,
      undefined,
    );
  });

  it('listMySubscriptions delegates to listSubscriptions with fan from request', async () => {
    const req = { fanAddress: fan } as RequestWithFan;
    await controller.listMySubscriptions(req, {
      fan,
      status: SubscriptionStatus.ACTIVE,
      sort: 'created',
      cursor: undefined,
      limit: 10,
    });

    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      SubscriptionStatus.ACTIVE,
      'created',
      undefined,
      10,
    );
  });

  it('listMySubscriptions passes sort=expiry to service', async () => {
    const req = { fanAddress: fan } as RequestWithFan;
    await controller.listMySubscriptions(req, {
      fan,
      sort: 'expiry',
      cursor: undefined,
      limit: 20,
    });

    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      undefined,
      'expiry',
      undefined,
      20,
    );
  });
});

describe('ListSubscriptionsQueryDto – status validation', () => {
  async function validateDto(plain: object) {
    const dto = plainToInstance(ListSubscriptionsQueryDto, plain);
    return validate(dto);
  }

  it('passes when status is a valid SubscriptionStatus value', async () => {
    for (const value of Object.values(SubscriptionStatus)) {
      const errors = await validateDto({ fan: 'GFAN', status: value });
      expect(errors.filter((e) => e.property === 'status')).toHaveLength(0);
    }
  });

  it('fails when status is an invalid string', async () => {
    const errors = await validateDto({ fan: 'GFAN', status: 'unknown' });
    const statusErrors = errors.filter((e) => e.property === 'status');
    expect(statusErrors).toHaveLength(1);
    expect(Object.values(statusErrors[0].constraints ?? {})[0]).toMatch(
      /active, expired, cancelled/,
    );
  });

  it('passes when status is omitted', async () => {
    const errors = await validateDto({ fan: 'GFAN' });
    expect(errors.filter((e) => e.property === 'status')).toHaveLength(0);
  });

  it('passes when sort is "created"', async () => {
    const errors = await validateDto({ fan: 'GFAN', sort: 'created' });
    expect(errors.filter((e) => e.property === 'sort')).toHaveLength(0);
  });

  it('passes when sort is "expiry"', async () => {
    const errors = await validateDto({ fan: 'GFAN', sort: 'expiry' });
    expect(errors.filter((e) => e.property === 'sort')).toHaveLength(0);
  });

  it('fails when sort is an invalid value', async () => {
    const errors = await validateDto({ fan: 'GFAN', sort: 'invalid' });
    const sortErrors = errors.filter((e) => e.property === 'sort');
    expect(sortErrors).toHaveLength(1);
    expect(Object.values(sortErrors[0].constraints ?? {})[0]).toMatch(/created, expiry/);
  });

  it('passes when sort is omitted', async () => {
    const errors = await validateDto({ fan: 'GFAN' });
    expect(errors.filter((e) => e.property === 'sort')).toHaveLength(0);
  });
});

describe('SubscriptionsController – listSubscriptions', () => {
  let controller: SubscriptionsController;
  let service: jest.Mocked<Pick<SubscriptionsService, 'listSubscriptions' | 'getFanCreatorSubscriptionState'>>;

  const fan = `G${'A'.repeat(55)}`;

  beforeEach(async () => {
    service = {
      listSubscriptions: jest.fn().mockReturnValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false, nextCursor: null, cursor: null }),
      getFanCreatorSubscriptionState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: service },
        FanBearerGuard,
        Reflector,
        FeatureFlagGuard,
        {
          provide: FeatureFlagsService,
          useValue: { isEnabled: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get(SubscriptionsController);
  });

  it('passes typed SubscriptionStatus.ACTIVE to service', () => {
    const query: ListSubscriptionsQueryDto = { fan, status: SubscriptionStatus.ACTIVE, cursor: undefined, limit: 20 };
    controller.listSubscriptions(query);
    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      SubscriptionStatus.ACTIVE,
      undefined,
      undefined,
      20,
    );
  });

  it('passes typed SubscriptionStatus.EXPIRED to service', () => {
    const query: ListSubscriptionsQueryDto = { fan, status: SubscriptionStatus.EXPIRED, cursor: undefined, limit: 20 };
    controller.listSubscriptions(query);
    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      SubscriptionStatus.EXPIRED,
      undefined,
      undefined,
      20,
    );
  });

  it('passes sort=created to service', () => {
    const query: ListSubscriptionsQueryDto = { fan, sort: 'created', cursor: undefined, limit: 20 };
    controller.listSubscriptions(query);
    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      undefined,
      'created',
      undefined,
      20,
    );
  });

  it('passes sort=expiry to service', () => {
    const query: ListSubscriptionsQueryDto = { fan, sort: 'expiry', cursor: undefined, limit: 20 };
    controller.listSubscriptions(query);
    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      undefined,
      'expiry',
      undefined,
      20,
    );
  });

  it('passes cursor to service', () => {
    const query: ListSubscriptionsQueryDto = { fan, cursor: 'some-cursor', limit: 10 };
    controller.listSubscriptions(query);
    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      undefined,
      undefined,
      'some-cursor',
      10,
    );
  });

  it('passes undefined status when omitted', () => {
    const query: ListSubscriptionsQueryDto = { fan, cursor: undefined, limit: 20 };
    controller.listSubscriptions(query);
    expect(service.listSubscriptions).toHaveBeenCalledWith(
      fan,
      undefined,
      undefined,
      undefined,
      20,
    );
  });
});

describe('SubscriptionsController – checkout & write endpoints', () => {
  let controller: SubscriptionsController;
  let service: Record<string, jest.Mock>;

  const fan = `G${'A'.repeat(55)}`;
  const creator = `G${'B'.repeat(55)}`;

  const mockCheckout = {
    id: 'checkout-1',
    fanAddress: fan,
    creatorAddress: creator,
    planId: 1,
    assetCode: 'XLM',
    assetIssuer: null,
    amount: '10.00',
    fee: '0.50',
    total: '10.50',
    status: 'PENDING',
    expiresAt: new Date().toISOString(),
    txHash: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    service = {
      isSubscriber: jest.fn().mockResolvedValue(true),
      createCheckout: jest.fn().mockReturnValue(mockCheckout),
      getCheckout: jest.fn().mockReturnValue(mockCheckout),
      getPlanSummary: jest.fn().mockReturnValue({ planId: 1, name: 'Basic', price: '10.00' }),
      getPriceBreakdown: jest.fn().mockReturnValue({ subtotal: '10.00', fee: '0.50', total: '10.50' }),
      getWalletStatus: jest.fn().mockReturnValue({ XLM: '100.00', USDC: '50.00' }),
      getTransactionPreview: jest.fn().mockReturnValue({ destination: creator, amount: '10.50' }),
      validateBalance: jest.fn().mockReturnValue({ sufficient: true }),
      confirmSubscription: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      failCheckout: jest.fn().mockReturnValue({ status: 'FAILED' }),
      cancelSubscription: jest.fn().mockResolvedValue({ cancelled: true }),
      getFanCreatorSubscriptionState: jest.fn(),
      listSubscriptions: jest.fn(),
      listCreatorSubscribers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: service },
        FanBearerGuard,
        Reflector,
        FeatureFlagGuard,
        {
          provide: FeatureFlagsService,
          useValue: { isEnabled: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get(SubscriptionsController);
  });

  it('checkSubscription delegates to isSubscriber and returns shape', async () => {
    const result = await controller.checkSubscription(fan, creator);

    expect(service.isSubscriber).toHaveBeenCalledWith(fan, creator);
    expect(result).toEqual({ isSubscriber: true });
  });

  it('createCheckout delegates to service with all parameters', () => {
    const body = { fanAddress: fan, creatorAddress: creator, planId: 1, assetCode: 'XLM', assetIssuer: undefined };
    const result = controller.createCheckout(body, 'testnet');

    expect(service.createCheckout).toHaveBeenCalledWith(fan, creator, 1, 'XLM', undefined, 'testnet');
    expect(result).toMatchObject({ id: 'checkout-1', status: 'PENDING' });
  });

  it('createCheckout omits txHash and error from the response', () => {
    const body = { fanAddress: fan, creatorAddress: creator, planId: 1 };
    const result = controller.createCheckout(body);

    expect(result).not.toHaveProperty('txHash');
    expect(result).not.toHaveProperty('error');
  });

  it('getCheckout delegates to service and includes txHash and error', () => {
    const result = controller.getCheckout('checkout-1');

    expect(service.getCheckout).toHaveBeenCalledWith('checkout-1');
    expect(result).toHaveProperty('txHash');
    expect(result).toHaveProperty('error');
  });

  it('getPlanSummary fetches checkout then plan summary', () => {
    const result = controller.getPlanSummary('checkout-1');

    expect(service.getCheckout).toHaveBeenCalledWith('checkout-1');
    expect(service.getPlanSummary).toHaveBeenCalledWith(mockCheckout.planId);
    expect(result).toMatchObject({ planId: 1, name: 'Basic' });
  });

  it('getPriceBreakdown delegates with checkout ID', () => {
    const result = controller.getPriceBreakdown('checkout-1');

    expect(service.getPriceBreakdown).toHaveBeenCalledWith('checkout-1');
    expect(result).toMatchObject({ subtotal: '10.00', total: '10.50' });
  });

  it('getWalletStatus fetches checkout then wallet status using fanAddress', () => {
    const result = controller.getWalletStatus('checkout-1');

    expect(service.getCheckout).toHaveBeenCalledWith('checkout-1');
    expect(service.getWalletStatus).toHaveBeenCalledWith(fan);
    expect(result).toHaveProperty('XLM');
  });

  it('getTransactionPreview delegates with checkout ID', () => {
    const result = controller.getTransactionPreview('checkout-1');

    expect(service.getTransactionPreview).toHaveBeenCalledWith('checkout-1');
    expect(result).toMatchObject({ destination: creator });
  });

  it('validateBalance fetches checkout then validates with fan address', () => {
    const result = controller.validateBalance('checkout-1', { assetCode: 'XLM', amount: '10.50' });

    expect(service.getCheckout).toHaveBeenCalledWith('checkout-1');
    expect(service.validateBalance).toHaveBeenCalledWith(fan, 'XLM', '10.50');
    expect(result).toEqual({ sufficient: true });
  });

  it('confirmSubscription delegates with checkout ID and optional txHash', () => {
    controller.confirmSubscription('checkout-1', { txHash: 'tx-abc' });

    expect(service.confirmSubscription).toHaveBeenCalledWith('checkout-1', 'tx-abc');
  });

  it('confirmSubscription works without txHash', () => {
    controller.confirmSubscription('checkout-1', {});

    expect(service.confirmSubscription).toHaveBeenCalledWith('checkout-1', undefined);
  });

  it('failCheckout delegates with error and optional rejected flag', () => {
    controller.failCheckout('checkout-1', { error: 'user cancelled', rejected: true });

    expect(service.failCheckout).toHaveBeenCalledWith('checkout-1', 'user cancelled', true);
  });

  it('failCheckout works without rejected flag', () => {
    controller.failCheckout('checkout-1', { error: 'timeout' });

    expect(service.failCheckout).toHaveBeenCalledWith('checkout-1', 'timeout', undefined);
  });

  it('cancelSubscription delegates with fan and creator addresses', () => {
    controller.cancelSubscription({ fanAddress: fan, creatorAddress: creator });

    expect(service.cancelSubscription).toHaveBeenCalledWith(fan, creator);
  });
});

describe('FanBearerGuard', () => {
  let guard: FanBearerGuard;

  beforeEach(() => {
    guard = new FanBearerGuard();
  });

  it('throws when Authorization is missing', () => {
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
        }),
      } as never),
    ).toThrow(UnauthorizedException);
  });

  it('attaches fanAddress for valid Bearer token', () => {
    const fanAddr = `G${'C'.repeat(55)}`;
    const token = Buffer.from(fanAddr, 'utf8').toString('base64');
    const req: { headers: Record<string, string>; fanAddress?: string } = {
      headers: { authorization: `Bearer ${token}` },
    };

    expect(
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => req }),
      } as never),
    ).toBe(true);
    expect(req.fanAddress).toBe(fanAddr);
  });
});
