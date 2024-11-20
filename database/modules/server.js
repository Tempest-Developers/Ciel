const { wrapDbOperation, connectDB } = require('./connection');

async function createServer(serverID) {
    return wrapDbOperation(async () => {
        const { mServerDB } = await connectDB();
        return await mServerDB.insertOne({
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
            pingUser: []
        });
    });
}

async function createServerSettings(serverID) {
    return wrapDbOperation(async () => {
        try {
            const { mServerSettingsDB } = await connectDB();
            const existingSettings = await mServerSettingsDB.findOne({ serverID });

            const defaultSettings = {
                serverID,
                register: false,
                premier: false,
                settings: {
                    allowShowStats: true,
                    allowRolePing: false,
                    allowCooldownPing: false,
                    handlers: {
                        claim: true,
                        summon: true,
                        manualClaim: false,
                        manualSummon: false
                    }
                },
                userPing: []
            };

            if (existingSettings) {
                // Preserve existing values while ensuring new properties exist
                const updatedSettings = {
                    ...defaultSettings,
                    register: existingSettings.register ?? defaultSettings.register,
                    premier: existingSettings.premier ?? defaultSettings.premier,
                    settings: {
                        ...defaultSettings.settings,
                        allowShowStats: existingSettings.settings?.allowShowStats ?? defaultSettings.settings.allowShowStats,
                        allowRolePing: existingSettings.settings?.allowRolePing ?? defaultSettings.settings.allowRolePing,
                        allowCooldownPing: existingSettings.settings?.allowCooldownPing ?? defaultSettings.settings.allowCooldownPing,
                        handlers: {
                            ...defaultSettings.settings.handlers,
                            // If old settings exist without handlers, use default values
                            ...(existingSettings.settings?.handlers || {})
                        }
                    },
                    userPing: existingSettings.userPing || defaultSettings.userPing
                };

                await mServerSettingsDB.updateOne(
                    { serverID },
                    { $set: updatedSettings }
                );

                return updatedSettings;
            } else {
                // Create new settings with defaults
                await mServerSettingsDB.insertOne(defaultSettings);
                return defaultSettings;
            }
        } catch (error) {
            console.error('Error creating server settings:', error);
            throw error;
        }
    });
}

async function toggleRegister(serverID) {
    return wrapDbOperation(async () => {
        try {
            const { mServerSettingsDB } = await connectDB();
            const serverSettings = await mServerSettingsDB.findOne({ serverID });

            if (!serverSettings) {
                throw new Error('Server settings not found');
            }

            const newRegisterValue = true;

            await mServerSettingsDB.updateOne(
                { serverID },
                { $set: { register: newRegisterValue } }
            );

            return { serverID, register: newRegisterValue };
        } catch (error) {
            console.error('Error toggling register:', error);
            throw error;
        }
    });
}

async function toggleAllowRolePing(serverID) {
    return wrapDbOperation(async () => {
        try {
            const { mServerSettingsDB } = await connectDB();
            const serverSettings = await mServerSettingsDB.findOne({ serverID });

            if (!serverSettings) {
                throw new Error('Server settings not found');
            }

            const newAllowRolePingValue = !serverSettings.settings?.allowRolePing;

            await mServerSettingsDB.updateOne(
                { serverID },
                { $set: { 'settings.allowRolePing': newAllowRolePingValue } }
            );

            return { serverID, allowRolePing: newAllowRolePingValue };
        } catch (error) {
            console.error('Error toggling allowRolePing:', error);
            throw error;
        }
    });
}

async function toggleAllowCooldownPing(serverID) {
    return wrapDbOperation(async () => {
        try {
            const { mServerSettingsDB } = await connectDB();
            const serverSettings = await mServerSettingsDB.findOne({ serverID });

            if (!serverSettings) {
                throw new Error('Server settings not found');
            }

            const newAllowCooldownPingValue = !serverSettings.settings?.allowCooldownPing;

            await mServerSettingsDB.updateOne(
                { serverID },
                { $set: { 'settings.allowCooldownPing': newAllowCooldownPingValue } }
            );

            return { serverID, allowCooldownPing: newAllowCooldownPingValue };
        } catch (error) {
            console.error('Error toggling allowCooldownPing:', error);
            throw error;
        }
    });
}

async function toggleHandler(serverID, handlerType, userId) {
    return wrapDbOperation(async () => {
        try {
            // Only allow specific user to toggle handlers
            if (userId !== '292675388180791297') {
                throw new Error('Unauthorized to toggle handlers');
            }

            const { mServerSettingsDB } = await connectDB();
            let serverSettings = await mServerSettingsDB.findOne({ serverID });

            // If server settings don't exist or need updating, create/update them
            if (!serverSettings || !serverSettings.settings?.handlers) {
                serverSettings = await createServerSettings(serverID);
            }

            // Verify the handler type exists
            if (!serverSettings.settings?.handlers?.hasOwnProperty(handlerType)) {
                throw new Error(`Invalid handler type: ${handlerType}`);
            }

            const currentValue = serverSettings.settings.handlers[handlerType];
            const newValue = !currentValue;

            await mServerSettingsDB.updateOne(
                { serverID },
                { $set: { [`settings.handlers.${handlerType}`]: newValue } }
            );

            return { serverID, handler: handlerType, enabled: newValue };
        } catch (error) {
            console.error('Error toggling handler:', error);
            throw error;
        }
    });
}

async function getServerData(serverID) {
    return wrapDbOperation(async () => {
        const { mServerDB } = await connectDB();
        return await mServerDB.findOne({ serverID });
    });
}

async function getServerSettings(serverID) {
    return wrapDbOperation(async () => {
        const { mServerSettingsDB } = await connectDB();
        let settings = await mServerSettingsDB.findOne({ serverID });
        
        // If settings exist but need updating to new structure
        if (settings && !settings.settings?.handlers) {
            settings = await createServerSettings(serverID);
        }
        
        return settings;
    });
}

async function addServerClaim(serverID, claim) {
    return wrapDbOperation(async () => {
        const { mServerDB } = await connectDB();
        const claimData = {
            claimedID: claim.claimedID,
            userID: claim.userID,
            serverID,
            cardName: claim.cardName,
            cardID: claim.cardID,
            owner: claim.owner,
            artist: claim.artist,
            print: claim.print,
            tier: claim.tier,
            timestamp: claim.timestamp
        };

        const serverUpdate = await mServerDB.findOneAndUpdate(
            {
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
                        $slice: -100
                    }
                },
                $inc: { [`counts.${getTierIndex(claim.tier)}`]: 1 }
            }
        );

        return { 
            claimData, 
            updated: serverUpdate.lastErrorObject?.n > 0 
        };
    });
}

function getTierIndex(tier) {
    const tiers = ['CT', 'RT', 'SRT', 'SSRT', 'URT', 'EXT'];
    return tiers.indexOf(tier);
}

module.exports = {
    createServer,
    createServerSettings,
    toggleRegister,
    toggleAllowRolePing,
    toggleAllowCooldownPing,
    toggleHandler,
    getServerData,
    getServerSettings,
    addServerClaim
};
