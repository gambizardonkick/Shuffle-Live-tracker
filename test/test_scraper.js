const assert = require('assert');
const { createStableBetId } = require('../scraper');

function testCreateStableBetId() {
    console.log('Running test: testCreateStableBetId');
    const bet1 = {
        username: 'TheGoobr',
        amount: 10,
        game: 'Slots',
        multiplier: 2,
        payout: 20,
        timestamp: 1678886400000
    };

    const bet2 = {
        username: 'TheGoobr',
        amount: 10,
        game: 'Slots',
        multiplier: 2,
        payout: 20,
        timestamp: 1678886401000
    };

    const betId1 = createStableBetId(bet1.username, bet1.amount, bet1.game, bet1.multiplier, bet1.payout, bet1.timestamp);
    const betId2 = createStableBetId(bet2.username, bet2.amount, bet2.game, bet2.multiplier, bet2.payout, bet2.timestamp);
    const betId3 = createStableBetId(bet1.username, bet1.amount, bet1.game, bet1.multiplier, bet1.payout, bet1.timestamp);

    assert.notStrictEqual(betId1, betId2, 'Bet IDs should be different for identical bets with different timestamps');
    assert.strictEqual(betId1, betId3, 'Bet IDs should be the same for identical bets with the same timestamp');

    console.log('Test passed');
}

testCreateStableBetId();
