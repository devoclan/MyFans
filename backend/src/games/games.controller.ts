import { Controller, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { GamesService } from './games.service';
import { JoinGameDto } from './dto/join-game.dto';

@ApiTags('games')
@Controller({ path: 'games', version: '1' })
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post(':id/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Join a game',
    description:
      'Adds the authenticated user as a player in the specified game. ' +
      'The game must be in PENDING status and must not be full. ' +
      'Each user can only join a game once.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the game to join',
    type: String,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: JoinGameDto })
  @ApiResponse({
    status: 201,
    description: 'Successfully joined the game. Returns the created player record.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        game_id: { type: 'string', format: 'uuid' },
        user_id: { type: 'string', format: 'uuid' },
        balance: { type: 'number', example: 1000 },
        turn_order: { type: 'integer', example: 1 },
        symbol: { type: 'string', nullable: true },
        created_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Game is not in PENDING status or is full',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer', example: 400 },
        error: { type: 'string', example: 'Bad Request' },
        message: { type: 'string', example: 'Game is not in PENDING status' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Game not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer', example: 404 },
        error: { type: 'string', example: 'Not Found' },
        message: { type: 'string', example: 'Game not found' },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Player already joined this game',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer', example: 409 },
        error: { type: 'string', example: 'Conflict' },
        message: { type: 'string', example: 'Player already joined this game' },
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async joinGame(@Param('id') id: string, @Body() joinGameDto: JoinGameDto) {
    return await this.gamesService.joinGame(id, joinGameDto.userId);
  }
}
