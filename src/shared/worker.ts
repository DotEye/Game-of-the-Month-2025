import {Decimal} from 'decimal.js';
import type {Negative, Positive} from '../games/september';
import {
    calculateTurn,
    CANVAS_SIZE,
    MAGNET_SPEED,
    MAX_SIMULATION_STEPS,
    outOfBounds,
} from '../games/september/shared.ts';
import {getBestMove, BoardState} from '../games/october/shared.ts';

export type ResponseEvent<T> = MessageEvent<{
    month: string;
    data: T;
}>;

namespace SeptemberMessage {
    export interface Angle {
        type: 'angle';
        angle: string;
        negatives: Negative[];
        start: {x: string; y: string};
        precision: number;
    }

    export interface Score {
        type: 'score';
        imageData: Uint8ClampedArray;
        backgroundColor: number[];
    }

    export type Any = Angle | Score;
}

let septemberLatestAngle: string | undefined = undefined;

async function september(message: SeptemberMessage.Any) {
    if (message.type === 'angle') {
        Decimal.config({precision: message.precision});
        septemberLatestAngle = message.angle;
        postMessage({month: 'september', data: {type: 'clear'}});

        const simulated: Positive = {
            x: new Decimal(message.start.x),
            y: new Decimal(message.start.y),
            angle: new Decimal(message.angle),
            startColor: '',
            endColor: '',
        };

        for (let i = 0; i < MAX_SIMULATION_STEPS; ++i) {
            if (i % 100 === 0) {
                // Await nothing to allow new calls to interrupt this one
                await new Promise<void>(resolve => setTimeout(resolve, 0));
                if (message.angle !== septemberLatestAngle) return;
            }

            const totalTurn = calculateTurn(simulated, message.negatives);
            if (totalTurn === 'hit magnet') return;

            simulated.angle = simulated.angle!.plus(totalTurn);
            simulated.x = simulated.x.plus(simulated.angle.cos().times(MAGNET_SPEED));
            simulated.y = simulated.y.plus(simulated.angle.sin().times(MAGNET_SPEED));

            if (outOfBounds(simulated)) return;

            postMessage({
                month: 'september',
                data: {type: 'position', x: simulated.x.toNumber(), y: simulated.y.toNumber()},
            });
        }

        return;
    }

    const {imageData, backgroundColor} = message;
    let score = 0;
    for (let i = 0; i < imageData.length; i += 4) {
        if (
            imageData[i] !== backgroundColor[0] ||
            imageData[i + 1] !== backgroundColor[1] ||
            imageData[i + 2] !== backgroundColor[2]
        ) {
            ++score;
        }
    }

    postMessage({
        month: 'september',
        data: {type: 'score', score: (score / (CANVAS_SIZE * CANVAS_SIZE)) * 100},
    });
}

namespace OctoberMessage {
    export interface BestMove {
        type: 'bestMove';
        board: BoardState;
        lookaheadMoves: number;
        thinkId: number;
    }

    export type Any = BestMove;
}

async function october(message: OctoberMessage.Any) {
    if (message.type === 'bestMove') {
        const bestMove = getBestMove(message.board, message.lookaheadMoves);
        postMessage({month: 'october', data: {type: 'bestMove', ...bestMove, thinkId: message.thinkId}});
    }
}

const handlers: {[month: string]: (data: any) => Promise<void>} = {september, october};

addEventListener('message', event => handlers[event.data.month](event.data.data));
