import { HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { GamesService, GameErrorResponse } from './games.service';
import { Game, GameStatus } from './entities/game.entity';
import { Player } from './entities/player.entity';

describe('GamesService – consistent error shape', () => {
  let service: GamesService;
  let mockManager: Record<string, jest.Mock>;

  function buildService() {
    const gameRepo = {} as Repository<Game>;
    const playerRepo = {} as Repository<Player>;
    const dataSource = {
      transaction: jest.fn((cb: (manager: typeof mockManager) => Promise<unknown>) =>
        cb(mockManager),
      ),
    } as unknown as DataSource;
    return new GamesService(gameRepo, playerRepo, dataSource);
  }

  beforeEach(() => {
    mockManager = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    service = buildService();
  });

  function assertErrorShape(err: unknown, expectedStatus: number, expectedError: string, expectedMessage: string) {
    expect(err).toBeInstanceOf(HttpException);
    const response = (err as HttpException).getResponse() as GameErrorResponse;
    expect(response).toEqual({
      statusCode: expectedStatus,
      error: expectedError,
      message: expectedMessage,
    });
    expect((err as HttpException).getStatus()).toBe(expectedStatus);
  }

  it('returns { statusCode, error, message } when game is not found', async () => {
    mockManager.findOne.mockResolvedValue(null);

    try {
      await service.joinGame('non-existent-id', 'user-1');
      fail('Expected an error');
    } catch (err) {
      assertErrorShape(err, HttpStatus.NOT_FOUND, 'Not Found', 'Game not found');
    }
  });

  it('returns consistent error when game is not in PENDING status', async () => {
    mockManager.findOne.mockResolvedValue({
      id: 'game-1',
      status: GameStatus.IN_PROGRESS,
      players: [],
      number_of_players: 4,
    });

    try {
      await service.joinGame('game-1', 'user-1');
      fail('Expected an error');
    } catch (err) {
      assertErrorShape(err, HttpStatus.BAD_REQUEST, 'Bad Request', 'Game is not in PENDING status');
    }
  });

  it('returns consistent error when game is full', async () => {
    mockManager.findOne.mockResolvedValue({
      id: 'game-1',
      status: GameStatus.PENDING,
      players: [{ id: 'p1' }, { id: 'p2' }],
      number_of_players: 2,
    });

    try {
      await service.joinGame('game-1', 'user-3');
      fail('Expected an error');
    } catch (err) {
      assertErrorShape(err, HttpStatus.BAD_REQUEST, 'Bad Request', 'Game is full');
    }
  });

  it('returns consistent error when player already joined', async () => {
    mockManager.findOne
      .mockResolvedValueOnce({
        id: 'game-1',
        status: GameStatus.PENDING,
        players: [{ id: 'p1', user_id: 'user-1' }],
        number_of_players: 4,
        game_settings: { starting_cash: 1000, randomize_turn_order: false },
      })
      .mockResolvedValueOnce({ id: 'p1', user_id: 'user-1' });

    try {
      await service.joinGame('game-1', 'user-1');
      fail('Expected an error');
    } catch (err) {
      assertErrorShape(err, HttpStatus.CONFLICT, 'Conflict', 'Player already joined this game');
    }
  });

  it('returns a Player on success', async () => {
    const savedPlayer = { id: 'p-new', game_id: 'game-1', user_id: 'user-2', balance: 1000, turn_order: 2 };
    mockManager.findOne
      .mockResolvedValueOnce({
        id: 'game-1',
        status: GameStatus.PENDING,
        players: [{ id: 'p1' }],
        number_of_players: 4,
        game_settings: { starting_cash: 1000, randomize_turn_order: false },
      })
      .mockResolvedValueOnce(null);
    mockManager.create.mockReturnValue(savedPlayer);
    mockManager.save.mockResolvedValue(savedPlayer);

    const result = await service.joinGame('game-1', 'user-2');
    expect(result).toEqual(savedPlayer);
  });
});
