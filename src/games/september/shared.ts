import {Decimal} from 'decimal.js';
import {Negative, Positive} from './index.ts';

export const MAGNET_PICKUP_RADIUS = 20;
export const MAGNET_RADIUS = 10;
export const MAGNET_RADIUS_SQ = 100;
export const MAGNET_SPEED = 4;
export const MAX_SIMULATION_STEPS = 10000;

// The web worker cannot read this from the DOM.
// Could instead pass it as a parameter, but this is easier,
// and I doubt the canvas size will be changed at this point.
export const CANVAS_SIZE = 600;

const GRAVITY = 100;

export function calculateTurn(positive: Positive, negatives: Negative[]) {
    let totalTurn = new Decimal(0);
    for (const negative of negatives) {
        const dX = positive.x.neg().add(negative.x);
        const dY = positive.y.neg().add(negative.y);
        const distance = dX.pow(2).plus(dY.pow(2));
        if (distance.isZero()) continue;
        if (distance.lt(MAGNET_RADIUS_SQ)) return 'hit magnet';
        totalTurn = totalTurn.plus(Decimal.atan2(dY, dX).sub(positive.angle!).sin().div(distance).mul(GRAVITY));
    }
    return totalTurn;
}

export function outOfBounds(position: {x: Decimal; y: Decimal}) {
    return (
        position.x.lt(-MAGNET_PICKUP_RADIUS) ||
        position.x.gt(CANVAS_SIZE + MAGNET_PICKUP_RADIUS) ||
        position.y.lt(-MAGNET_PICKUP_RADIUS) ||
        position.y.gt(CANVAS_SIZE + MAGNET_PICKUP_RADIUS)
    );
}
