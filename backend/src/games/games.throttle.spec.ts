import { ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

describe('GamesController – rate limiting', () => {
  let controller: GamesController;

  beforeEach(() => {
    const mockService = { joinGame: jest.fn() };
    controller = new GamesController(mockService as unknown as GamesService);
  });

  it('applies ThrottlerGuard at the controller level', () => {
    const guards = Reflect.getMetadata('__guards__', GamesController) as Array<new () => unknown>;
    expect(guards).toContain(ThrottlerGuard);
  });

  it('configures joinGame with short throttle policy (10 req / 60s)', () => {
    const limit = Reflect.getMetadata(THROTTLER_LIMIT + 'short', controller.joinGame);
    const ttl = Reflect.getMetadata(THROTTLER_TTL + 'short', controller.joinGame);

    expect(limit).toBe(10);
    expect(ttl).toBe(60000);
  });
});
