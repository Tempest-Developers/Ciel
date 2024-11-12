const { wrapDbOperation, mUserDB } = require('./connection');

function getTierIndex(tier) {
    const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
    return tiers.indexOf(tier);
}

async function createPlayer(userID, serverID) {
    return wrapDbOperation(async () => {
        return await mUserDB.insertOne({
            userID,
            serverID,
            counts: [0, 0, 0, 0, 0, 0],
            claims: {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: [],
                URT: [],
                EXT: []
            },
            manualClaims: []
        });
    });
}

async function addClaim(serverID, userID, claim) {
    return wrapDbOperation(async () => {
        const claimData = {
            claimedID: claim.claimedID,
            userID,
            serverID,
            cardName: claim.cardName,
            cardID: claim.cardID,
            owner: claim.owner,
            artist: claim.artist,
            print: claim.print,
            tier: claim.tier,
            timestamp: claim.timestamp
        };

        const userUpdate = await mUserDB.findOneAndUpdate(
            {
                userID,
                serverID,
                [`claims.${claim.tier}`]: {
                    $not: {
                        $elemMatch: {
                            claimedID: claim.claimedID,
                            cardID: claim.cardID,
                            timestamp: claim.timestamp
                        }
                    }
                }
            },
            {
                $push: {
                    [`claims.${claim.tier}`]: {
                        $each: [claimData],
                        $slice: -24
                    }
                },
                $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
            }
        );

        return { 
            claimData, 
            updated: userUpdate.lastErrorObject?.n > 0 
        };
    });
}

async function addManualClaim(serverID, userID, claim) {
    return wrapDbOperation(async () => {
        const claimData = {
            claimedID: claim.claimedID,
            userID,
            serverID,
            cardName: claim.cardName,
            cardID: claim.cardID,
            owner: claim.owner,
            artist: claim.artist,
            print: claim.print,
            tier: claim.tier,
            timestamp: claim.timestamp
        };

        const userUpdate = await mUserDB.findOneAndUpdate(
            {
                userID,
                serverID,
                manualClaims: {
                    $not: {
                        $elemMatch: {
                            claimedID: claim.claimedID,
                            cardID: claim.cardID,
                            timestamp: claim.timestamp
                        }
                    }
                }
            },
            {
                $push: {
                    manualClaims: {
                        $each: [claimData],
                        $slice: -48
                    }
                },
                $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
            }
        );

        return { 
            claimData, 
            updated: userUpdate.lastErrorObject?.n > 0 
        };
    });
}

async function getPlayerData(userID, serverID) {
    return wrapDbOperation(async () => {
        return await mUserDB.findOne({ userID, serverID });
    });
}

module.exports = {
    createPlayer,
    addClaim,
    addManualClaim,
    getPlayerData
};
