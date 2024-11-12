const { wrapDbOperation, connectDB } = require('./connection');

async function logCommand(userID, username, serverID, serverName, commandName, options = {}) {
    return wrapDbOperation(async () => {
        try {
            const { mCommandLogsDB } = await connectDB();
            return await mCommandLogsDB.insertOne({
                userID,
                username,
                serverID,
                serverName,
                commandName,
                options,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Error logging command:', error);
            throw error;
        }
    });
}

async function getCommandLogs(serverID = null, page = 1, limit = 10) {
    return wrapDbOperation(async () => {
        try {
            const { mCommandLogsDB } = await connectDB();
            const query = serverID ? { serverID } : {};
            const skip = (page - 1) * limit;
            
            const logs = await mCommandLogsDB
                .find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .toArray();
                
            const total = await mCommandLogsDB.countDocuments(query);
            const totalPages = Math.ceil(total / limit);
            
            return {
                logs,
                currentPage: page,
                totalPages,
                totalLogs: total
            };
        } catch (error) {
            console.error('Error getting command logs:', error);
            throw error;
        }
    });
}

module.exports = {
    logCommand,
    getCommandLogs
};
