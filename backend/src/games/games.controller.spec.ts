import { Test, TestingModule } from '@nestjs/testing';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

describe('GamesController', () => {
  let controller: GamesController;
  let service: jest.Mocked<Pick<GamesService, 'joinGame'>>;

  beforeEach(async () => {
    service = {
      joinGame: jest.fn().mockResolvedValue({
        id: 'player-1',
        game_id: 'game-1',
        user_id: 'user-1',
        balance: 1000,
        turn_order: 1,
        symbol: null,
        created_at: new Date(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GamesController],
      providers: [{ provide: GamesService, useValue: service }],
    }).compile();

    controller = module.get(GamesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates joinGame to the service with correct parameters', async () => {
    const result = await controller.joinGame('game-1', { userId: 'user-1' });

    expect(service.joinGame).toHaveBeenCalledWith('game-1', 'user-1');
    expect(result).toMatchObject({ id: 'player-1', game_id: 'game-1' });
  });

  it('has ApiTags decorator on the controller', () => {
    const tags = Reflect.getMetadata('swagger/apiUseTags', GamesController);
    expect(tags).toContain('games');
  });

  it('has ApiOperation decorator on joinGame', () => {
    const metadata = Reflect.getMetadata(
      'swagger/apiOperation',
      controller.joinGame,
    );
    expect(metadata).toBeDefined();
    expect(metadata.summary).toBe('Join a game');
  });

  it('documents multiple ApiResponse statuses on joinGame', () => {
    const responses = Reflect.getMetadata(
      'swagger/apiResponse',
      controller.joinGame,
    );
    expect(responses).toBeDefined();
    const statuses = Object.keys(responses).map(Number);
    expect(statuses).toEqual(expect.arrayContaining([201, 400, 404, 409, 429]));
  });
});
