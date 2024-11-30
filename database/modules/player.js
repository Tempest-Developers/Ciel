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
        
        const defaultServerData = {
            counts: [0, 0, 0, 0, 0, 0],
            countManualClaims: [0, 0, 0, 0, 0, 0],
            claims: {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: [],
                URT: [],
                EXT: []
            },
            manualClaims: {
                CT: [],
                RT: [],
                SRT: [],
                SSRT: [],
                URT: [],
                EXT: []
            }
        };
        
        if (existingUser) {
            // If user exists, add new server data
            return await mUserDB.updateOne(
                { userID },
                {
                    $set: {
                        [`servers.${serverID}`]: defaultServerData
                    }
                }
            );
        } else {
            // Create new user document with server data
            return await mUserDB.insertOne({
                userID,
                servers: {
                    [serverID]: defaultServerData
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
                [`servers.${serverID}.manualClaims.${claim.tier}`]: {
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
                    [`servers.${serverID}.manualClaims.${claim.tier}`]: {
                        $each: [claimData],
                        $slice: -24
                    }
                },
                $inc: { 
                    [`servers.${serverID}.counts.${getTierIndex(claim.tier)}`]: 1,
                    [`servers.${serverID}.countManualClaims.${getTierIndex(claim.tier)}`]: 1
                }
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
        // Return in the old format for backward compatibility, including countManualClaims
        return {
            userID,
            serverID,
            counts: userData.servers[serverID].counts,
            countManualClaims: userData.servers[serverID].countManualClaims || [0, 0, 0, 0, 0, 0],
            claims: userData.servers[serverID].claims,
            manualClaims: userData.servers[serverID].manualClaims
        };
    });
}

async function resetUserCounts() {
    return wrapDbOperation(async () => {
        const { mUserDB } = await connectDB();
        const result = await mUserDB.updateMany(
            {},
            { 
                $set: { 
                    "servers.$[].counts": [0, 0, 0, 0, 0, 0],
                    "servers.$[].countManualClaims": [0, 0, 0, 0, 0, 0],
                    "servers.$[].claims": {
                        CT: [],
                        RT: [],
                        SRT: [],
                        SSRT: [],
                        URT: [],
                        EXT: []
                    },
                    "servers.$[].manualClaims": {
                        CT: [],
                        RT: [],
                        SRT: [],
                        SSRT: [],
                        URT: [],
                        EXT: []
                    }
                } 
            }
        );
        console.log(`Reset counts, claims, and manual claims for ${result.modifiedCount} users`);
        return result.modifiedCount;
    });
}

module.exports = {
    createPlayer,
    addClaim,
    addManualClaim,
    getPlayerData,
    resetUserCounts
};
