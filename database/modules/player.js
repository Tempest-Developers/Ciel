const { wrapDbOperation, connectDB } = require('./connection');

function getTierIndex(tier) {
    const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
    return tiers.indexOf(tier);
}

async function createPlayer(userID, serverID) {
    return wrapDbOperation(async () => {
        const { mUserDB } = await connectDB();
        
        // First try to find if user document exists
        const existingUser = await mUserDB.findOne({ userID });
        
        if (existingUser) {
            // If user exists, add new server data
            return await mUserDB.updateOne(
                { userID },
                {
                    $set: {
                        [`servers.${serverID}`]: {
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
                        }
                    }
                }
            );
        } else {
            // Create new user document with server data
            return await mUserDB.insertOne({
                userID,
                servers: {
                    [serverID]: {
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
                    }
                }
            });
        }
    });
}

async function addClaim(serverID, userID, claim) {
    return wrapDbOperation(async () => {
        const { mUserDB } = await connectDB();
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
                [`servers.${serverID}.claims.${claim.tier}`]: {
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
                    [`servers.${serverID}.claims.${claim.tier}`]: {
                        $each: [claimData],
                        $slice: -24
                    }
                },
                $inc: { [`servers.${serverID}.counts.${getTierIndex(claim.tier)}`]: 1 }
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
        const { mUserDB } = await connectDB();
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
                [`servers.${serverID}.manualClaims`]: {
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
                    [`servers.${serverID}.manualClaims`]: {
                        $each: [claimData],
                        $slice: -48
                    }
                },
                $inc: { [`servers.${serverID}.counts.${getTierIndex(claim.tier)}`]: 1 }
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
        const { mUserDB } = await connectDB();
        const userData = await mUserDB.findOne({ userID });
        if (!userData || !userData.servers[serverID]) {
            return null;
        }
        // Return in the old format for backward compatibility
        return {
            userID,
            serverID,
            counts: userData.servers[serverID].counts,
            claims: userData.servers[serverID].claims,
            manualClaims: userData.servers[serverID].manualClaims
        };
    });
}

module.exports = {
    createPlayer,
    addClaim,
    addManualClaim,
    getPlayerData
};
